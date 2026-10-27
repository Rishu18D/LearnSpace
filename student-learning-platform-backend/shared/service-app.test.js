import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createApp, startService } from "./service-app.js";

test("service app assigns request IDs before parsing JSON and reports invalid bodies as 400", async () => {
  const app = createApp({ name: "test-service", mongoUriEnv: "MONGO_TEST_URI", routes: express.Router() });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/invalid-json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });

    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "REQUEST_ERROR");
    assert.ok(body.requestId);
    assert.equal(response.headers.get("x-request-id"), body.requestId);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("service startup rejects malformed MongoDB write concern configuration before connecting", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousUri = process.env.MONGO_TEST_URI;
  process.env.JWT_SECRET = "test-secret-for-mongo-uri-validation";
  process.env.MONGO_TEST_URI = "mongodb://localhost:27017/?w=majority/slp_courses";
  const app = createApp({ name: "test-service", mongoUriEnv: "MONGO_TEST_URI", routes: express.Router() });

  try {
    await assert.rejects(startService(app, 0), /invalid write concern/i);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousUri === undefined) delete process.env.MONGO_TEST_URI;
    else process.env.MONGO_TEST_URI = previousUri;
  }
});

test("service startup requires a database name in its MongoDB URI", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousUri = process.env.MONGO_TEST_URI;
  process.env.JWT_SECRET = "test-secret-for-mongo-uri-validation";
  process.env.MONGO_TEST_URI = "mongodb://localhost:27017";
  const app = createApp({ name: "test-service", mongoUriEnv: "MONGO_TEST_URI", routes: express.Router() });

  try {
    await assert.rejects(startService(app, 0), /include the database name/i);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousUri === undefined) delete process.env.MONGO_TEST_URI;
    else process.env.MONGO_TEST_URI = previousUri;
  }
});
