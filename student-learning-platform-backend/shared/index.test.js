import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { z } from "zod";
import {
  authenticate,
  corsOrigins,
  createToken,
  errorHandler,
  optionalAuthenticate,
  requestId
} from "./index.js";

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

test("validation and duplicate-key errors use client error statuses", async () => {
  const app = express();
  app.use(requestId);
  app.get("/validation", (req, res, next) => {
    try {
      z.string().parse(42);
      res.end();
    } catch (error) {
      next(error);
    }
  });
  app.get("/duplicate", (req, res, next) => next(Object.assign(new Error("duplicate"), { code: 11000 })));
  app.use(errorHandler);

  await withServer(app, async baseUrl => {
    const validation = await fetch(`${baseUrl}/validation`);
    assert.equal(validation.status, 400);
    assert.equal((await validation.json()).error.code, "VALIDATION_ERROR");

    const duplicate = await fetch(`${baseUrl}/duplicate`);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error.code, "CONFLICT");
  });
});

test("CORS accepts only explicit origins and normalizes hosted service hostnames", () => {
  const previousOrigin = process.env.CORS_ORIGIN;
  const previousEnvironment = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "learnspace-frontend.onrender.com,https://learnspace.example";
    assert.deepEqual(corsOrigins(), [
      "https://learnspace-frontend.onrender.com",
      "https://learnspace.example"
    ]);

    process.env.CORS_ORIGIN = "*";
    assert.throws(corsOrigins, /trusted frontend origins/i);
    process.env.CORS_ORIGIN = "https://learnspace.example/path";
    assert.throws(corsOrigins, /without paths/i);
  } finally {
    if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousOrigin;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});

test("same-origin production deployments do not require cross-origin CORS origins", () => {
  const previousOrigin = process.env.CORS_ORIGIN;
  const previousEnvironment = process.env.NODE_ENV;
  const previousServeFrontend = process.env.SERVE_FRONTEND;
  try {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = "production";
    process.env.SERVE_FRONTEND = "true";
    assert.deepEqual(corsOrigins(), []);
  } finally {
    if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousOrigin;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousServeFrontend === undefined) delete process.env.SERVE_FRONTEND;
    else process.env.SERVE_FRONTEND = previousServeFrontend;
  }
});

test("optional authentication allows public access and verifies supplied tokens", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-for-shared-middleware";
  try {
    const app = express();
    app.use(requestId);
    app.get("/optional", optionalAuthenticate, (req, res) => res.json({ user: req.user?.sub || null }));
    app.get("/required", authenticate, (req, res) => res.json({ user: req.user.sub }));
    app.use(errorHandler);

    const token = createToken({ _id: "507f1f77bcf86cd799439011", role: "student", email: "learner@example.com" });
    await withServer(app, async baseUrl => {
      const publicResponse = await fetch(`${baseUrl}/optional`);
      assert.equal(publicResponse.status, 200);
      assert.deepEqual(await publicResponse.json(), { user: null });

      const authenticatedResponse = await fetch(`${baseUrl}/optional`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(authenticatedResponse.status, 200);
      assert.deepEqual(await authenticatedResponse.json(), { user: "507f1f77bcf86cd799439011" });

      const invalidResponse = await fetch(`${baseUrl}/optional`, {
        headers: { authorization: "Bearer invalid" }
      });
      assert.equal(invalidResponse.status, 401);
    });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
