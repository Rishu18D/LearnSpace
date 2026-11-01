import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { connectMongoWithRetry, createApp, startService } from "./service-app.js";

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

test("service endpoints return 503 while MongoDB is disconnected", async () => {
  const app = createApp({ name: "test-service", mongoUriEnv: "MONGO_TEST_URI", routes: express.Router() });
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/example`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, "SERVICE_NOT_READY");
    assert.equal(response.headers.get("x-request-id"), body.requestId);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("MongoDB connection retries with bounded exponential backoff", async () => {
  const originalError = console.error;
  const originalLog = console.log;
  const delays = [];
  let attempts = 0;
  console.error = () => {};
  console.log = () => {};

  try {
    const connected = await connectMongoWithRetry("mongodb://example.test/slp_test", {
      serviceName: "test-service",
      connect: async () => {
        attempts += 1;
        if (attempts < 4) throw new Error("temporary network failure");
      },
      wait: async delay => { delays.push(delay); }
    });

    assert.equal(connected, true);
    assert.equal(attempts, 4);
    assert.deepEqual(delays, [1000, 2000, 4000]);
  } finally {
    console.error = originalError;
    console.log = originalLog;
  }
});

test("MongoDB retries stop when service shutdown is requested", async () => {
  const originalError = console.error;
  const delays = [];
  let stopping = false;
  console.error = () => {};

  try {
    const connected = await connectMongoWithRetry("mongodb://example.test/slp_test", {
      serviceName: "test-service",
      shouldStop: () => stopping,
      connect: async () => { throw new Error("temporary network failure"); },
      wait: async delay => {
        delays.push(delay);
        stopping = true;
      }
    });

    assert.equal(connected, false);
    assert.deepEqual(delays, [1000]);
  } finally {
    console.error = originalError;
  }
});
