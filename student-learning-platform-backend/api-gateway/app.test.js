import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";

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

test("gateway strips its API prefix and forwards request IDs", async () => {
  const previousAuthUrl = process.env.AUTH_SERVICE_URL;
  const upstream = express();
  upstream.get("/probe", (req, res) => res.json({
    path: req.url,
    requestId: req.headers["x-request-id"],
    clientIp: req.headers["x-client-ip"]
  }));

  try {
    await withServer(upstream, async upstreamUrl => {
      process.env.AUTH_SERVICE_URL = upstreamUrl;
      const { default: app } = await import("./src/app.js");
      await withServer(app, async gatewayUrl => {
        const response = await fetch(`${gatewayUrl}/api/auth/probe?check=1`, {
          headers: { "x-client-ip": "203.0.113.9", "x-request-id": "invalid/id" }
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.path, "/probe?check=1");
        assert.ok(body.requestId);
        assert.notEqual(body.requestId, "invalid/id");
        assert.ok(body.clientIp);
        assert.notEqual(body.clientIp, "203.0.113.9");
        assert.equal(response.headers.get("x-request-id"), body.requestId);

        const readiness = await fetch(`${gatewayUrl}/health/ready`);
        assert.equal(readiness.status, 503);
        assert.equal((await readiness.json()).status, "not_ready");
      });
    });
  } finally {
    if (previousAuthUrl === undefined) delete process.env.AUTH_SERVICE_URL;
    else process.env.AUTH_SERVICE_URL = previousAuthUrl;
  }
});
