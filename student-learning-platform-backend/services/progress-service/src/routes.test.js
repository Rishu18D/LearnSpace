import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { authenticate, createToken, errorHandler, requestId } from "@slp/common";
import Progress from "./model.js";
import routes from "./routes.js";

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("lesson completion rejects a lesson that is not in the enrolled course", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFetch = globalThis.fetch;
  const originalFindOne = Progress.findOne;
  const originalFindOneAndUpdate = Progress.findOneAndUpdate;
  process.env.JWT_SECRET = "test-secret-for-progress-routes";
  const courseId = "507f1f77bcf86cd799439011";
  const token = createToken({ _id: "507f191e810c19729de860ea", role: "student", email: "learner@example.com" });
  const requestedUrls = [];
  let progressWrites = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    requestedUrls.push(String(url));
    if (String(url).includes("/me?courseId=")) {
      return new Response(JSON.stringify({
        enrollments: [{ courseId, status: "active" }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      course: { lessons: [{ _id: "507f1f77bcf86cd799439099" }] }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  Progress.findOneAndUpdate = async () => {
    progressWrites += 1;
    return {};
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/lessons/507f1f77bcf86cd799439088/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ courseId })
      });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).error.code, "LESSON_NOT_FOUND");
      assert.equal(requestedUrls.length, 2);
      assert.equal(progressWrites, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    Progress.findOne = originalFindOne;
    Progress.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("lesson completion records a course lesson after enrollment and membership checks", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFetch = globalThis.fetch;
  const originalFindOne = Progress.findOne;
  const originalFindOneAndUpdate = Progress.findOneAndUpdate;
  process.env.JWT_SECRET = "test-secret-for-progress-routes";
  const courseId = "507f1f77bcf86cd799439011";
  const lessonId = "507f1f77bcf86cd799439099";
  const token = createToken({ _id: "507f191e810c19729de860ea", role: "student", email: "learner@example.com" });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    return String(url).includes("/me?courseId=")
      ? new Response(JSON.stringify({ enrollments: [{ courseId, status: "active" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
      : new Response(JSON.stringify({ course: { lessons: [{ _id: lessonId }] } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  Progress.findOne = async () => null;
  Progress.findOneAndUpdate = async () => ({ lessonId, completed: true });

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/lessons/${lessonId}/complete`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ courseId })
      });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).progress, { lessonId, completed: true });
    });
  } finally {
    globalThis.fetch = originalFetch;
    Progress.findOne = originalFindOne;
    Progress.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("lesson access records a resumable position only for an enrolled course lesson", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFetch = globalThis.fetch;
  const originalFindOneAndUpdate = Progress.findOneAndUpdate;
  const courseId = "507f1f77bcf86cd799439011";
  const lessonId = "507f1f77bcf86cd799439099";
  let savedFilter;
  let savedUpdate;
  process.env.JWT_SECRET = "test-secret-for-progress-routes";
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    return String(url).includes("/me?courseId=")
      ? new Response(JSON.stringify({ enrollments: [{ courseId, status: "active" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
      : new Response(JSON.stringify({ course: { lessons: [{ _id: lessonId }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
  };
  Progress.findOneAndUpdate = async (filter, update) => {
    savedFilter = filter;
    savedUpdate = update;
    return { lessonId, completed: false, lastAccessedAt: update.$set.lastAccessedAt };
  };
  try {
    const token = createToken({ _id: "507f191e810c19729de860ea", role: "student", email: "learner@example.com" });
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);
    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/courses/${courseId}/lessons/${lessonId}/access`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.progress.completed, false);
      assert.equal(typeof result.progress.lastAccessedAt, "string");
      assert.deepEqual(savedFilter, { studentId: "507f191e810c19729de860ea", courseId, lessonId });
      assert.equal(savedUpdate.$setOnInsert.completed, false);
      assert.equal(savedUpdate.$set.lastAccessedAt instanceof Date, true);
    });
  } finally {
    globalThis.fetch = originalFetch;
    Progress.findOneAndUpdate = originalFindOneAndUpdate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
