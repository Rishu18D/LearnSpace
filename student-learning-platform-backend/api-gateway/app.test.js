import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("gateway serves the frontend SPA on the same origin and keeps API misses as JSON", async () => {
  const previousServeFrontend = process.env.SERVE_FRONTEND;
  const previousFrontendDist = process.env.FRONTEND_DIST_DIR;
  const previousEnvironment = process.env.NODE_ENV;
  const frontendDist = await mkdtemp(path.join(os.tmpdir(), "learnspace-frontend-"));
  await mkdir(path.join(frontendDist, "assets"));
  await writeFile(path.join(frontendDist, "index.html"), "<!doctype html><title>Learnspace test</title>");
  await writeFile(path.join(frontendDist, "assets", "app.js"), "console.log('test');");

  try {
    process.env.SERVE_FRONTEND = "true";
    process.env.FRONTEND_DIST_DIR = frontendDist;
    process.env.NODE_ENV = "production";
    const { default: app } = await import(`./src/app.js?frontend-test=${Date.now()}`);

    await withServer(app, async baseUrl => {
      const home = await fetch(baseUrl);
      assert.equal(home.status, 200);
      assert.match(await home.text(), /Learnspace test/);
      assert.equal(home.headers.get("cache-control"), "no-cache");

      const route = await fetch(`${baseUrl}/courses/example`, { headers: { accept: "text/html" } });
      assert.equal(route.status, 200);
      assert.match(await route.text(), /Learnspace test/);

      const asset = await fetch(`${baseUrl}/assets/app.js`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get("cache-control"), /immutable/);

      const missingApi = await fetch(`${baseUrl}/api/unknown`, { headers: { accept: "text/html" } });
      assert.equal(missingApi.status, 404);
      assert.deepEqual(await missingApi.json(), {
        error: { code: "NOT_FOUND", message: "Gateway route not found" },
        requestId: missingApi.headers.get("x-request-id")
      });

      const missingPage = await fetch(`${baseUrl}/missing.js`, { headers: { accept: "application/javascript" } });
      assert.equal(missingPage.status, 404);
      assert.equal(missingPage.headers.get("content-type")?.startsWith("application/json"), true);
    });
  } finally {
    await rm(frontendDist, { recursive: true, force: true });
    if (previousServeFrontend === undefined) delete process.env.SERVE_FRONTEND;
    else process.env.SERVE_FRONTEND = previousServeFrontend;
    if (previousFrontendDist === undefined) delete process.env.FRONTEND_DIST_DIR;
    else process.env.FRONTEND_DIST_DIR = previousFrontendDist;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});
