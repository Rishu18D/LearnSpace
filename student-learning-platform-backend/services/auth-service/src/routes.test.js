import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import { errorHandler, requestId } from "@slp/common";
import User from "./model.js";
import RefreshSession from "./session-model.js";
import routes from "./routes.js";

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("public registration creates students by default and permits instructor accounts but not admins", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalSessionCreate = RefreshSession.create;
  process.env.JWT_SECRET = "test-secret-for-auth-registration";
  const created = [];
  const sessions = [];
  User.findOne = async () => null;
  User.create = async data => {
    const user = { ...data, _id: `507f191e810c19729de860e${created.length}`, id: `507f191e810c19729de860e${created.length}` };
    created.push(user);
    return user;
  };
  RefreshSession.create = async data => {
    sessions.push(data);
    return data;
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const register = (email, role, password = "long-test-password-123") => fetch(`${baseUrl}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test User", email, password, ...(role ? { role } : {}) })
      });

      const studentResponse = await register("student@example.com");
      assert.equal(studentResponse.status, 201);
      assert.equal((await studentResponse.json()).user.role, "student");
      assert.match(studentResponse.headers.getSetCookie()[0], /HttpOnly/);
      assert.match(studentResponse.headers.getSetCookie()[0], /Path=\/api\/auth/);

      const instructorResponse = await register("teacher@example.com", "instructor");
      assert.equal(instructorResponse.status, 201);
      assert.equal((await instructorResponse.json()).user.role, "instructor");

      const unicodePasswordResponse = await register("unicode@example.com", undefined, "🙂".repeat(20));
      assert.equal(unicodePasswordResponse.status, 400);

      const adminResponse = await register("admin@example.com", "admin");
      assert.equal(adminResponse.status, 400);
      assert.equal(created.length, 2);
      assert.equal(sessions.length, 2);
    });
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    RefreshSession.create = originalSessionCreate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("registration handles duplicate races and login normalizes email, validates password bytes, and authenticates valid credentials", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalSessionCreate = RefreshSession.create;
  process.env.JWT_SECRET = "test-secret-for-auth-login";
  const passwordHash = await bcrypt.hash("different-valid-password", 4);
  let findCount = 0;
  let lookup;
  let sessionCreates = 0;
  User.findOne = filter => {
    lookup = filter;
    findCount += 1;
    if (findCount === 1) return Promise.resolve(null);
    return {
      select: async () => ({
        _id: "507f191e810c19729de860ea",
        id: "507f191e810c19729de860ea",
        name: "Test User",
        email: "user@example.com",
        role: "student",
        active: true,
        passwordHash
      })
    };
  };
  User.create = async () => {
    throw { code: 11000, keyPattern: { email: 1 } };
  };
  RefreshSession.create = async () => { sessionCreates += 1; };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const duplicateResponse = await fetch(`${baseUrl}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Test User", email: "USER@example.com", password: "long-test-password-123" })
      });
      assert.equal(duplicateResponse.status, 409);
      assert.equal((await duplicateResponse.json()).error.code, "EMAIL_EXISTS");

      const invalidPasswordResponse = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "🙂".repeat(20) })
      });
      assert.equal(invalidPasswordResponse.status, 400);

      const invalidCredentialsResponse = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: " USER@example.com ", password: "long-test-password-123" })
      });
      assert.equal(invalidCredentialsResponse.status, 401);
      assert.deepEqual(lookup, { email: "user@example.com" });

      const loginResponse = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: " USER@example.com ", password: "different-valid-password" })
      });
      assert.equal(loginResponse.status, 200);
      const payload = await loginResponse.json();
      assert.equal(payload.user.email, "user@example.com");
      assert.equal(payload.user.role, "student");
      assert.ok(payload.accessToken);
      assert.match(loginResponse.headers.getSetCookie()[0], /HttpOnly/);
      assert.equal(sessionCreates, 1);
    });
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    RefreshSession.create = originalSessionCreate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("refresh rotates the HttpOnly session cookie and logout revokes it", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalUserFindById = User.findById;
  const originalSessionFindOneAndUpdate = RefreshSession.findOneAndUpdate;
  const originalSessionCreate = RefreshSession.create;
  const originalSessionUpdateOne = RefreshSession.updateOne;
  process.env.JWT_SECRET = "test-secret-for-refresh-session";
  const user = {
    _id: "507f191e810c19729de860ea",
    id: "507f191e810c19729de860ea",
    name: "Test User",
    email: "user@example.com",
    role: "student",
    active: true
  };
  let rotationFilter;
  let revokedTokenHash;
  User.findById = async () => user;
  RefreshSession.findOneAndUpdate = async filter => {
    rotationFilter = filter;
    return { userId: user.id };
  };
  RefreshSession.create = async data => data;
  RefreshSession.updateOne = async filter => {
    revokedTokenHash = filter.tokenHash;
    return { modifiedCount: 1 };
  };

  try {
    const app = express();
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/refresh`, {
        method: "POST",
        headers: { cookie: "slp_refresh=old-refresh-token" }
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.user.id, user.id);
      assert.equal(body.expiresIn, 900);
      assert.ok(body.accessToken);
      assert.match(response.headers.getSetCookie()[0], /HttpOnly/);
      assert.equal(rotationFilter.revokedAt, null);
      assert.ok(rotationFilter.expiresAt.$gt instanceof Date);

      const logout = await fetch(`${baseUrl}/logout`, {
        method: "POST",
        headers: { cookie: "slp_refresh=old-refresh-token" }
      });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
      assert.ok(revokedTokenHash);
    });
  } finally {
    User.findById = originalUserFindById;
    RefreshSession.findOneAndUpdate = originalSessionFindOneAndUpdate;
    RefreshSession.create = originalSessionCreate;
    RefreshSession.updateOne = originalSessionUpdateOne;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
