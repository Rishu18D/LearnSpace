import { Router } from "express";
import { asyncHandler, authenticate, allowRoles } from "@slp/common";
const router = Router();

async function getJson(base, path, token) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: token ? { authorization: token } : {},
      signal: AbortSignal.timeout(3000)
    });
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Analytics upstream request failed", error: error.message }));
    throw Object.assign(new Error("An upstream service is unavailable"), { status: 503 });
  }
  if (!response.ok) throw Object.assign(new Error("An upstream service did not respond successfully"), { status: 503 });
  try {
    return await response.json();
  } catch (error) {
    console.warn(JSON.stringify({ level: "warn", message: "Analytics upstream response was invalid", error: error.message }));
    throw Object.assign(new Error("An upstream service returned an invalid response"), { status: 503 });
  }
}

function readCount(value, message) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw Object.assign(new Error(message), { status: 503 });
  }
  return value;
}

async function getCourseCounts(token) {
  const base = process.env.COURSE_SERVICE_URL || "http://localhost:3003";
  const [managed, published, drafts, archived] = await Promise.all([
    getJson(base, "/manage/mine?limit=1", token),
    getJson(base, "/manage/mine?status=published&limit=1", token),
    getJson(base, "/manage/mine?status=draft&limit=1", token),
    getJson(base, "/manage/mine?status=archived&limit=1", token)
  ]);
  return {
    coursesManaged: readCount(managed?.pagination?.total, "The course service returned invalid analytics data"),
    publishedCourses: readCount(published?.pagination?.total, "The course service returned invalid analytics data"),
    draftCourses: readCount(drafts?.pagination?.total, "The course service returned invalid analytics data"),
    archivedCourses: readCount(archived?.pagination?.total, "The course service returned invalid analytics data")
  };
}

router.get("/student", authenticate, asyncHandler(async (req, res) => {
  const [enrollments, progress, notifications] = await Promise.all([
    getJson(process.env.ENROLLMENT_SERVICE_URL || "http://localhost:3004", "/me/summary", req.headers.authorization),
    getJson(process.env.PROGRESS_SERVICE_URL || "http://localhost:3006", "/me", req.headers.authorization),
    getJson(process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3005", "/", req.headers.authorization)
  ]);
  const enrollmentSummary = enrollments?.summary;
  if (!enrollmentSummary || !Number.isSafeInteger(enrollmentSummary.active) ||
      !Number.isSafeInteger(enrollmentSummary.completed) || !Number.isSafeInteger(enrollmentSummary.total) ||
      !Number.isSafeInteger(progress?.completedLessons) || !Number.isSafeInteger(notifications?.unread)) {
    throw Object.assign(new Error("An upstream service returned invalid analytics data"), { status: 503 });
  }
  res.json({
    summary: {
      activeEnrollments: enrollmentSummary.active,
      completedEnrollments: enrollmentSummary.completed,
      totalEnrollments: enrollmentSummary.total,
      completedLessons: progress.completedLessons,
      unreadNotifications: notifications.unread
    }
  });
}));
router.get("/instructor", authenticate, allowRoles("instructor", "admin"), asyncHandler(async (req, res) => {
  res.json({ summary: await getCourseCounts(req.headers.authorization) });
}));
router.get("/admin", authenticate, allowRoles("admin"), asyncHandler(async (req, res) => {
  const [courses, students] = await Promise.all([
    getCourseCounts(req.headers.authorization),
    getJson(process.env.STUDENT_SERVICE_URL || "http://localhost:3001", "/?limit=1", req.headers.authorization)
  ]);
  res.json({
    summary: {
      ...courses,
      studentProfiles: readCount(students?.pagination?.total, "The student service returned invalid analytics data")
    }
  });
}));
export default router;
