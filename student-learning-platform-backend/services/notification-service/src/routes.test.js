import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createToken, errorHandler, requestId } from "@slp/common";
import Notification from "./model.js";
import routes from "./routes.js";

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use("/", routes);
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function tokenFor(userId) {
  return createToken({ _id: userId, role: "student", email: "learner@example.com" });
}

test("notification filters and counts are scoped to the signed-in user", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = Notification.find;
  const originalCountDocuments = Notification.countDocuments;
  const userId = "507f191e810c19729de860ea";
  process.env.JWT_SECRET = "test-secret-for-notification-routes";
  let queriedFilter;
  Notification.find = filter => {
    queriedFilter = filter;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return Promise.resolve([{ _id: "notice-1", userId, readAt: null }]); }
    };
  };
  Notification.countDocuments = async filter => {
    assert.equal(filter.userId, userId);
    if (filter.readAt === null) return 2;
    if (filter.readAt?.$ne === null) return 3;
    return 5;
  };

  try {
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/?status=unread&page=1&limit=1`, {
        headers: { authorization: `Bearer ${tokenFor(userId)}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(queriedFilter, { userId, readAt: null });
      assert.deepEqual(await response.json(), {
        notifications: [{ _id: "notice-1", userId, readAt: null }],
        unread: 2,
        counts: { all: 5, unread: 2, read: 3 },
        pagination: { page: 1, limit: 1, total: 2, pages: 2 }
      });
    });
  } finally {
    Notification.find = originalFind;
    Notification.countDocuments = originalCountDocuments;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("mark all read updates only unread notifications belonging to the signed-in user", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalUpdateMany = Notification.updateMany;
  const userId = "507f191e810c19729de860ea";
  process.env.JWT_SECRET = "test-secret-for-notification-routes";
  Notification.updateMany = async (filter, update) => {
    assert.deepEqual(filter, { userId, readAt: null });
    assert.ok(update.$set.readAt instanceof Date);
    return { modifiedCount: 4 };
  };

  try {
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/read-all`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${tokenFor(userId)}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { updated: 4 });
    });
  } finally {
    Notification.updateMany = originalUpdateMany;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("invalid notification status filters return a client error", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-for-notification-routes";

  try {
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/?status=all`, {
        headers: { authorization: `Bearer ${tokenFor("507f191e810c19729de860ea")}` }
      });
      assert.equal(response.status, 400);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
