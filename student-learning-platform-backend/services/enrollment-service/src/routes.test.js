import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createToken, errorHandler, requestId } from "@slp/common";
import Enrollment from "./model.js";
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

test("concurrent enrollment creation returns a conflict instead of a server error", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFetch = globalThis.fetch;
  const originalFindOne = Enrollment.findOne;
  const originalCreate = Enrollment.create;
  const courseId = "507f1f77bcf86cd799439011";
  process.env.JWT_SECRET = "test-secret-for-enrollment-race";
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    return new Response(JSON.stringify({ course: { _id: courseId } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  Enrollment.findOne = async () => null;
  Enrollment.create = async () => {
    throw { code: 11000, keyPattern: { studentId: 1, courseId: 1 } };
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);
    const token = createToken({
      _id: "507f191e810c19729de860ea",
      role: "student",
      email: "learner@example.com"
    });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ courseId })
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "ALREADY_ENROLLED");
    });
  } finally {
    globalThis.fetch = originalFetch;
    Enrollment.findOne = originalFindOne;
    Enrollment.create = originalCreate;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
