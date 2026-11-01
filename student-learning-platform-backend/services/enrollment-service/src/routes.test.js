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

test("enrollment summary returns accurate per-status counts for the authenticated user", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalCountDocuments = Enrollment.countDocuments;
  const studentId = "507f191e810c19729de860ea";
  process.env.JWT_SECRET = "test-secret-for-enrollment-summary";
  Enrollment.countDocuments = async filter => {
    assert.equal(filter.studentId, studentId);
    return { active: 3, completed: 2, cancelled: 1, undefined: 6 }[filter.status];
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);
    const token = createToken({ _id: studentId, role: "student", email: "learner@example.com" });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/me/summary`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        summary: { active: 3, completed: 2, cancelled: 1, total: 6 }
      });
    });
  } finally {
    Enrollment.countDocuments = originalCountDocuments;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("enrollment status filters are scoped to the authenticated user", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = Enrollment.find;
  const originalCountDocuments = Enrollment.countDocuments;
  const studentId = "507f191e810c19729de860ea";
  process.env.JWT_SECRET = "test-secret-for-enrollment-filter";
  let queriedFilter;
  Enrollment.find = filter => {
    queriedFilter = filter;
    return {
      sort() { return this; },
      skip() { return this; },
      limit() { return Promise.resolve([]); }
    };
  };
  Enrollment.countDocuments = async filter => {
    assert.deepEqual(filter, queriedFilter);
    return 0;
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);
    const token = createToken({ _id: studentId, role: "student", email: "learner@example.com" });

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/me?status=completed&page=1&limit=5`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(queriedFilter, { studentId, status: "completed" });
      assert.deepEqual(await response.json(), {
        enrollments: [],
        pagination: { page: 1, limit: 5, total: 0, pages: 0 }
      });
    });
  } finally {
    Enrollment.find = originalFind;
    Enrollment.countDocuments = originalCountDocuments;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("enrollment can be completed only after every published lesson is complete", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousCourseUrl = process.env.COURSE_SERVICE_URL;
  const previousProgressUrl = process.env.PROGRESS_SERVICE_URL;
  const originalFetch = globalThis.fetch;
  const originalFindById = Enrollment.findById;
  const studentId = "507f191e810c19729de860ea";
  const enrollmentId = "507f1f77bcf86cd799439010";
  const courseId = "507f1f77bcf86cd799439011";
  const lessonId = "507f1f77bcf86cd799439099";
  const enrollment = {
    _id: enrollmentId,
    studentId,
    courseId,
    status: "active",
    completedAt: null,
    async save() { this.saved = true; return this; }
  };
  process.env.JWT_SECRET = "test-secret-for-completion-transition";
  process.env.COURSE_SERVICE_URL = "http://course.test";
  process.env.PROGRESS_SERVICE_URL = "http://progress.test";
  const token = createToken({ _id: studentId, role: "student", email: "learner@example.com" });
  Enrollment.findById = async id => id === enrollmentId ? enrollment : null;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    if (url === `http://course.test/${courseId}`) {
      return new Response(JSON.stringify({ course: { lessons: [{ _id: lessonId }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url === `http://progress.test/courses/${courseId}`) {
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      return new Response(JSON.stringify({ progress: [{ lessonId, completed: true }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);

    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/${enrollmentId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" })
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.enrollment.status, "completed");
      assert.ok(result.enrollment.completedAt);
      assert.equal(enrollment.saved, true);
    });
  } finally {
    globalThis.fetch = originalFetch;
    Enrollment.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousCourseUrl === undefined) delete process.env.COURSE_SERVICE_URL;
    else process.env.COURSE_SERVICE_URL = previousCourseUrl;
    if (previousProgressUrl === undefined) delete process.env.PROGRESS_SERVICE_URL;
    else process.env.PROGRESS_SERVICE_URL = previousProgressUrl;
  }
});

test("enrollment completion is rejected until all published lessons are done", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousCourseUrl = process.env.COURSE_SERVICE_URL;
  const previousProgressUrl = process.env.PROGRESS_SERVICE_URL;
  const originalFetch = globalThis.fetch;
  const originalFindById = Enrollment.findById;
  const studentId = "507f191e810c19729de860ea";
  const enrollmentId = "507f1f77bcf86cd799439010";
  const courseId = "507f1f77bcf86cd799439011";
  const enrollment = { _id: enrollmentId, studentId, courseId, status: "active", async save() { throw new Error("Must not save incomplete enrollment"); } };
  process.env.JWT_SECRET = "test-secret-for-incomplete-transition";
  process.env.COURSE_SERVICE_URL = "http://course.test";
  process.env.PROGRESS_SERVICE_URL = "http://progress.test";
  const token = createToken({ _id: studentId, role: "student", email: "learner@example.com" });
  Enrollment.findById = async () => enrollment;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    if (url === `http://course.test/${courseId}`) {
      return new Response(JSON.stringify({ course: { lessons: [{ _id: "lesson-1" }, { _id: "lesson-2" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url === `http://progress.test/courses/${courseId}`) {
      return new Response(JSON.stringify({ progress: [{ lessonId: "lesson-1", completed: true }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };

  try {
    const app = express();
    app.use(express.json());
    app.use(requestId);
    app.use("/", routes);
    app.use(errorHandler);
    await withServer(app, async baseUrl => {
      const response = await fetch(`${baseUrl}/${enrollmentId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" })
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "COURSE_NOT_COMPLETE");
    });
  } finally {
    globalThis.fetch = originalFetch;
    Enrollment.findById = originalFindById;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousCourseUrl === undefined) delete process.env.COURSE_SERVICE_URL;
    else process.env.COURSE_SERVICE_URL = previousCourseUrl;
    if (previousProgressUrl === undefined) delete process.env.PROGRESS_SERVICE_URL;
    else process.env.PROGRESS_SERVICE_URL = previousProgressUrl;
  }
});
