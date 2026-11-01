import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createToken, errorHandler, requestId } from "@slp/common";
import routes from "./routes.js";

async function withServer(run) {
  const server = createServer(express()
    .use(express.json())
    .use(requestId)
    .use("/", routes)
    .use(errorHandler));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function withUpstreamMocks(run, responseForUrl) {
  const originalFetch = globalThis.fetch;
  const previousSecret = process.env.JWT_SECRET;
  const previousUrls = {
    COURSE_SERVICE_URL: process.env.COURSE_SERVICE_URL,
    ENROLLMENT_SERVICE_URL: process.env.ENROLLMENT_SERVICE_URL,
    PROGRESS_SERVICE_URL: process.env.PROGRESS_SERVICE_URL,
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL,
    STUDENT_SERVICE_URL: process.env.STUDENT_SERVICE_URL
  };
  process.env.JWT_SECRET = "test-secret-for-analytics-routes";
  process.env.COURSE_SERVICE_URL = "http://course.test";
  process.env.ENROLLMENT_SERVICE_URL = "http://enrollment.test";
  process.env.PROGRESS_SERVICE_URL = "http://progress.test";
  process.env.NOTIFICATION_SERVICE_URL = "http://notification.test";
  process.env.STUDENT_SERVICE_URL = "http://student.test";
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname === "127.0.0.1") return originalFetch(url, options);
    const body = responseForUrl(String(url));
    if (body === undefined) throw new Error(`Unexpected upstream request: ${url}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await run(originalFetch);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    for (const [key, value] of Object.entries(previousUrls)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function courseCountsForUrl(url) {
  if (url.includes("status=published")) return { pagination: { total: 7 } };
  if (url.includes("status=draft")) return { pagination: { total: 5 } };
  if (url.includes("status=archived")) return { pagination: { total: 3 } };
  return { pagination: { total: 12 } };
}

test("student analytics reports enrollment, lesson, and notification totals", async () => {
  await withUpstreamMocks(async originalFetch => {
    const token = createToken({
      _id: "507f191e810c19729de860ea",
      role: "student",
      email: "learner@example.com"
    });
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/student`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        summary: {
          activeEnrollments: 4,
          completedEnrollments: 2,
          totalEnrollments: 8,
          completedLessons: 16,
          unreadNotifications: 1
        }
      });
    });
  }, url => {
    if (url === "http://enrollment.test/me/summary") {
      return { summary: { active: 4, completed: 2, cancelled: 2, total: 8 } };
    }
    if (url === "http://progress.test/me") return { completedLessons: 16 };
    if (url === "http://notification.test/") return { unread: 1 };
    return undefined;
  });
});

test("instructor analytics uses upstream pagination totals, not the current page size", async () => {
  await withUpstreamMocks(async originalFetch => {
    const token = createToken({
      _id: "507f191e810c19729de860ea",
      role: "instructor",
      email: "teacher@example.com"
    });
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/instructor`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        summary: {
          coursesManaged: 12,
          publishedCourses: 7,
          draftCourses: 5,
          archivedCourses: 3
        }
      });
    });
  }, courseCountsForUrl);
});

test("admin analytics combines course totals with the student profile total", async () => {
  await withUpstreamMocks(async originalFetch => {
    const token = createToken({
      _id: "507f191e810c19729de860ea",
      role: "admin",
      email: "admin@example.com"
    });
    await withServer(async baseUrl => {
      const response = await originalFetch(`${baseUrl}/admin`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        summary: {
          coursesManaged: 12,
          publishedCourses: 7,
          draftCourses: 5,
          archivedCourses: 3,
          studentProfiles: 27
        }
      });
    });
  }, url => {
    if (url.startsWith("http://course.test/")) return courseCountsForUrl(url);
    if (url === "http://student.test/?limit=1") return { pagination: { total: 27 } };
    return undefined;
  });
});
