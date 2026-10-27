import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import { createServer } from "node:http";
import { createToken, errorHandler, requestId } from "@slp/common";
import Course from "./model.js";
import AssessmentAttempt from "./attempt-model.js";
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

function testApp() {
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use("/", routes);
  app.use(errorHandler);
  return app;
}

function withSecret(secret, callback) {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    });
}

test("course detail allows its instructor to view an unpublished course only when authenticated", async () => {
  const originalFindById = Course.findById;
  const courseId = "507f1f77bcf86cd799439011";
  const ownerId = "507f191e810c19729de860ea";
  Course.findById = async () => ({
    _id: courseId,
    instructorId: ownerId,
    published: false,
    title: "Draft course"
  });
  try {
    await withSecret("test-secret-for-course-routes", async () => {
      const ownerToken = createToken({ _id: ownerId, role: "instructor", email: "owner@example.com" });
      const otherToken = createToken({ _id: "507f1f77bcf86cd799439012", role: "instructor", email: "other@example.com" });
      await withServer(testApp(), async baseUrl => {
        const ownerResponse = await fetch(`${baseUrl}/${courseId}`, { headers: { authorization: `Bearer ${ownerToken}` } });
        assert.equal(ownerResponse.status, 200);
        assert.equal((await ownerResponse.json()).course.title, "Draft course");
        assert.equal((await fetch(`${baseUrl}/${courseId}`)).status, 404);
        const otherResponse = await fetch(`${baseUrl}/${courseId}`, { headers: { authorization: `Bearer ${otherToken}` } });
        assert.equal(otherResponse.status, 404);
      });
    });
  } finally {
    Course.findById = originalFindById;
  }
});

test("course owner can publish lessons with full content while another instructor cannot edit them", async () => {
  const originalFindOne = Course.findOne;
  const originalFindOneAndUpdate = Course.findOneAndUpdate;
  const originalFindById = Course.findById;
  const ownerId = "507f191e810c19729de860ea";
  const courseId = "507f1f77bcf86cd799439011";
  const updates = [];
  Course.findOne = async filter => filter.instructorId === ownerId ? {
    _id: courseId,
    instructorId: ownerId,
    published: false,
    learningObjectives: ["Understand the fundamentals"],
    lessons: [{ title: "Introduction", content: "Draft content", order: 0 }],
    modules: []
  } : null;
  Course.findOneAndUpdate = async (filter, update) => {
    updates.push({ filter, update });
    return filter.instructorId === ownerId ? { _id: courseId, instructorId: ownerId, ...update.$set } : null;
  };
  Course.findById = async () => ({
    _id: courseId,
    instructorId: ownerId,
    published: true,
    lessons: [{ title: "Introduction", content: "Published lesson content.", order: 0 }]
  });
  try {
    await withSecret("test-secret-for-course-publishing", async () => {
      const ownerToken = createToken({ _id: ownerId, role: "instructor", email: "teacher@example.com" });
      const otherToken = createToken({ _id: "507f1f77bcf86cd799439012", role: "instructor", email: "other@example.com" });
      await withServer(testApp(), async baseUrl => {
        const lessonContent = "Read this explanation.\nThen try the exercise.";
        const ownerResponse = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
          body: JSON.stringify({ published: true, learningObjectives: ["Understand the fundamentals"], lessons: [{ title: "Introduction", content: lessonContent, order: 0 }] })
        });
        assert.equal(ownerResponse.status, 200);
        const { course } = await ownerResponse.json();
        assert.equal(course.published, true);
        assert.equal(course.lessons[0].content, lessonContent);
        const publicResponse = await fetch(`${baseUrl}/${courseId}`);
        assert.equal(publicResponse.status, 200);
        assert.equal((await publicResponse.json()).course.lessons[0].content, "Published lesson content.");
        const otherResponse = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${otherToken}`, "content-type": "application/json" },
          body: JSON.stringify({ published: true })
        });
        assert.equal(otherResponse.status, 404);
        assert.deepEqual(updates[0].filter, { _id: courseId, instructorId: ownerId });
        assert.equal(updates.length, 1);
      });
    });
  } finally {
    Course.findOne = originalFindOne;
    Course.findOneAndUpdate = originalFindOneAndUpdate;
    Course.findById = originalFindById;
  }
});

test("instructor can save a course draft with detailed lesson content", async () => {
  const originalCreate = Course.create;
  const instructorId = "507f191e810c19729de860ea";
  let createdCourse;
  Course.create = async data => {
    createdCourse = { _id: "507f1f77bcf86cd799439011", ...data };
    return createdCourse;
  };
  try {
    await withSecret("test-secret-for-course-creation", async () => {
      const token = createToken({ _id: instructorId, role: "instructor", email: "teacher@example.com" });
      await withServer(testApp(), async baseUrl => {
        const lessonContent = "Full lesson text.\nSecond paragraph.";
        const response = await fetch(`${baseUrl}/`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            title: "Course with detailed lessons",
            description: "A complete course description.",
            category: "Learning",
            level: "beginner",
            lessons: [{ title: "First lesson", description: "A short summary.", content: lessonContent, order: 0 }]
          })
        });
        assert.equal(response.status, 201);
        const { course } = await response.json();
        assert.equal(course.published, false);
        assert.equal(course.lessons[0].content, lessonContent);
        assert.equal(createdCourse.instructorId, instructorId);
      });
    });
  } finally {
    Course.create = originalCreate;
  }
});

test("course publishing rejects courses without learning objectives and a published lesson", async () => {
  const originalFindOne = Course.findOne;
  const originalFindOneAndUpdate = Course.findOneAndUpdate;
  const courseId = "507f1f77bcf86cd799439011";
  const ownerId = "507f191e810c19729de860ea";
  let writes = 0;
  let lookup = 0;
  Course.findOne = async () => {
    const scenario=lookup++;
    if(scenario===0) return {
      _id: courseId, instructorId: ownerId, published: false, learningObjectives: [], lessons: [], modules: []
    };
    if(scenario===1) return {
      _id: courseId, instructorId: ownerId, published: false,
      learningObjectives: ["Understand the topic"],
      lessons: [{ title: "Hidden lesson", published: false }],
      modules: []
    };
    return {
      _id: courseId, instructorId: ownerId, published: true,
      learningObjectives: ["Understand the topic"], lessons: [], modules: []
    };
  };
  Course.findOneAndUpdate = async () => { writes += 1; return null; };
  try {
    await withSecret("test-secret-for-course-publication-checks", async () => {
      const token = createToken({ _id: ownerId, role: "instructor", email: "teacher@example.com" });
      await withServer(testApp(), async baseUrl => {
        const response = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ published: true })
        });
        assert.equal(response.status, 422);
        assert.equal((await response.json()).error.code, "COURSE_NOT_READY");
        const hiddenLessonResponse = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ published: true })
        });
        assert.equal(hiddenLessonResponse.status, 422);
        assert.ok((await hiddenLessonResponse.json()).error.details.includes("Add at least one published lesson before publishing."));
        const emptyPublishedUpdate = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ modules: [] })
        });
        assert.equal(emptyPublishedUpdate.status, 422);
        assert.equal(writes, 0);
      });
    });
  } finally {
    Course.findOne = originalFindOne;
    Course.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("an archived course can be restored only as an unpublished draft", async () => {
  const originalFindOne = Course.findOne;
  const originalFindOneAndUpdate = Course.findOneAndUpdate;
  const courseId = "507f1f77bcf86cd799439011";
  const ownerId = "507f191e810c19729de860ea";
  let savedUpdate;
  Course.findOne = async () => ({
    _id: courseId, instructorId: ownerId, published: false, archived: true, lessons: [], modules: []
  });
  Course.findOneAndUpdate = async (filter, update) => {
    savedUpdate = update.$set;
    return { _id: courseId, instructorId: ownerId, published: false, archived: false, ...update.$set };
  };
  try {
    await withSecret("test-secret-for-course-restoration", async () => {
      const token = createToken({ _id: ownerId, role: "instructor", email: "teacher@example.com" });
      await withServer(testApp(), async baseUrl => {
        const response = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ archived: false })
        });
        assert.equal(response.status, 200);
        const { course } = await response.json();
        assert.equal(course.archived, false);
        assert.equal(course.published, false);
        assert.equal(savedUpdate.archived, false);
        assert.equal(savedUpdate.published, undefined);
      });
    });
  } finally {
    Course.findOne = originalFindOne;
    Course.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("course studio migration preserves legacy lesson IDs and archives omitted lessons", async () => {
  const originalFindOne = Course.findOne;
  const originalFindOneAndUpdate = Course.findOneAndUpdate;
  const courseId = "507f1f77bcf86cd799439011";
  const ownerId = "507f191e810c19729de860ea";
  const keptLessonId = "507f1f77bcf86cd799439012";
  const removedLessonId = "507f1f77bcf86cd799439013";
  let savedUpdate;
  Course.findOne = async () => ({
    _id: courseId,
    instructorId: ownerId,
    published: false,
    modules: [],
    lessons: [
      { _id: keptLessonId, title: "Keep this lesson", content: "Old lesson content", order: 0 },
      { _id: removedLessonId, title: "Archive this lesson", content: "Old content", order: 1 }
    ]
  });
  Course.findOneAndUpdate = async (filter, update) => {
    savedUpdate = update.$set;
    return { _id: courseId, instructorId: ownerId, ...update.$set };
  };
  try {
    await withSecret("test-secret-for-legacy-course-migration", async () => {
      const token = createToken({ _id: ownerId, role: "instructor", email: "teacher@example.com" });
      await withServer(testApp(), async baseUrl => {
        const response = await fetch(`${baseUrl}/${courseId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            migrateLegacyLessons: true,
            modules: [{
              title: "Existing lessons",
              order: 0,
              lessons: [{ _id: keptLessonId, title: "Edited lesson", content: "Updated content", order: 0 }]
            }]
          })
        });
        assert.equal(response.status, 200);
        assert.equal(savedUpdate.lessons.length, 1);
        assert.equal(savedUpdate.lessons[0]._id, removedLessonId);
        assert.equal(savedUpdate.lessons[0].archived, true);
        assert.equal(savedUpdate.lessons[0].published, false);
        const { course } = await response.json();
        assert.equal(course.modules[0].lessons[0]._id, keptLessonId);
        assert.equal(course.modules[0].lessons[0].content, "Updated content");
      });
    });
  } finally {
    Course.findOne = originalFindOne;
    Course.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("admin import supports dry runs and rejects repeated import keys without writing", async () => {
  const originalExists = Course.exists;
  const originalCreate = Course.create;
  let writes = 0;
  Course.exists = async () => null;
  Course.create = async data => { writes += 1; return { _id: `507f191e810c19729de860e${writes}`, ...data }; };
  try {
    await withSecret("test-secret-for-course-import", async () => {
      const token = createToken({ _id: "507f191e810c19729de860ea", role: "admin", email: "admin@example.com" });
      const data = {
        importKey: "course-fixture-01",
        title: "Imported course",
        description: "A valid imported course.",
        category: "Testing",
        learningObjectives: ["Explain the course topic"],
        modules: [{ title: "First module", order: 0, lessons: [{ title: "First lesson", content: "# Lesson\n\nRead and practice.", order: 0 }] }]
      };
      await withServer(testApp(), async baseUrl => {
        const sample = JSON.parse(await readFile(new URL("../../../docs/examples/sample-course.json", import.meta.url), "utf8"));
        const samplePreview = await fetch(`${baseUrl}/manage/import`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ dryRun: true, courses: sample.courses })
        });
        assert.equal(samplePreview.status, 200);
        assert.equal((await samplePreview.json()).valid, 1);
        const dryRun = await fetch(`${baseUrl}/manage/import`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ dryRun: true, courses: [data] })
        });
        assert.equal(dryRun.status, 200);
        assert.equal((await dryRun.json()).valid, 1);
        assert.equal(writes, 0);
        const duplicateImport = await fetch(`${baseUrl}/manage/import`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ dryRun: false, courses: [data, data] })
        });
        assert.equal(duplicateImport.status, 422);
        assert.equal((await duplicateImport.json()).errors.length, 1);
        assert.equal(writes, 0);
      });
    });
  } finally {
    Course.exists = originalExists;
    Course.create = originalCreate;
  }
});

test("course instructors can review and score pending short-answer attempts", async () => {
  const originalFindById = Course.findById;
  const originalFind = AssessmentAttempt.find;
  const originalFindOne = AssessmentAttempt.findOne;
  const ownerId = "507f191e810c19729de860ea";
  const courseId = "507f1f77bcf86cd799439011";
  const quizId = "507f1f77bcf86cd799439012";
  const questionId = "507f1f77bcf86cd799439014";
  const attemptId = "507f1f77bcf86cd799439015";
  const course = new Course({
    _id: courseId,
    title: "Review course",
    slug: "review-course",
    description: "Course text",
    category: "Testing",
    instructorId: ownerId,
    quizzes: [{
      _id: quizId,
      title: "Reflection",
      questions: [{
        _id: questionId, prompt: "Explain the idea.", type: "short_answer",
        gradingRubric: "Award one point for a correct explanation.", points: 2, order: 0
      }]
    }]
  });
  const attempt = {
    _id: attemptId,
    studentId: "507f1f77bcf86cd799439016",
    courseId,
    quizId,
    attemptNumber: 1,
    answers: [{ questionId, answer: "It works this way.", pointsEarned: 0, reviewed: false }],
    score: 0,
    maxScore: 2,
    status: "pending_review",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    async save() { this.saved = true; }
  };
  Course.findById = async () => course;
  AssessmentAttempt.find = () => ({
    sort() { return this; },
    limit: async () => [attempt]
  });
  AssessmentAttempt.findOne = async () => attempt;
  try {
    await withSecret("test-secret-for-assessment-review", async () => {
      const token = createToken({ _id: ownerId, role: "instructor", email: "teacher@example.com" });
      await withServer(testApp(), async baseUrl => {
        const pendingResponse = await fetch(`${baseUrl}/${courseId}/attempts/pending`, {
          headers: { authorization: `Bearer ${token}` }
        });
        assert.equal(pendingResponse.status, 200);
        const pending = await pendingResponse.json();
        assert.equal(pending.attempts[0].quizTitle, "Reflection");
        assert.equal(pending.attempts[0].questions[0].prompt, "Explain the idea.");
        assert.equal(pending.attempts[0].questions[0].answer, "It works this way.");
        assert.equal(pending.attempts[0].questions[0].reviewable, true);

        const invalidGrade = await fetch(`${baseUrl}/${courseId}/quizzes/${quizId}/attempts/${attemptId}/review`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ grades: [{ questionId, pointsEarned: 1.5 }] })
        });
        assert.equal(invalidGrade.status, 400);

        const reviewResponse = await fetch(`${baseUrl}/${courseId}/quizzes/${quizId}/attempts/${attemptId}/review`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ grades: [{ questionId, pointsEarned: 1, feedback: "Good explanation." }] })
        });
        assert.equal(reviewResponse.status, 200);
        const reviewed = await reviewResponse.json();
        assert.equal(reviewed.attempt.status, "reviewed");
        assert.equal(reviewed.attempt.score, 1);
        assert.equal(reviewed.percentage, 50);
        assert.equal(attempt.saved, true);
      });
    });
  } finally {
    Course.findById = originalFindById;
    AssessmentAttempt.find = originalFind;
    AssessmentAttempt.findOne = originalFindOne;
  }
});

test("student quiz responses hide answer keys until after authoritative grading", async () => {
  const originalFindById = Course.findById;
  const originalCount = AssessmentAttempt.countDocuments;
  const originalCreate = AssessmentAttempt.create;
  const originalFetch = globalThis.fetch;
  const courseId = "507f1f77bcf86cd799439011";
  const quizId = "507f1f77bcf86cd799439012";
  const course = new Course({
    _id: courseId,
    title: "Assessment course",
    slug: "assessment-course",
    description: "Course text",
    category: "Testing",
    instructorId: "507f1f77bcf86cd799439013",
    published: true,
    quizzes: [{
      _id: quizId,
      title: "Quiz",
      published: true,
      attemptLimit: 2,
      passingScore: 50,
      questions: [
        { prompt: "Which choice is correct?", type: "single_choice", options: ["A", "B"], correctAnswers: ["B"], points: 2, order: 0 },
        { prompt: "Explain why.", type: "short_answer", gradingRubric: "Award points for a clear explanation.", correctAnswers: [], points: 2, order: 1 }
      ]
    }]
  });
  const questionIds = course.quizzes[0].questions.map(item => String(item._id));
  Course.findById = async () => course;
  AssessmentAttempt.countDocuments = async () => 0;
  AssessmentAttempt.create = async data => new AssessmentAttempt({ _id: "507f191e810c19729de860e1", ...data });
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:")) return originalFetch(url, options);
    return new Response(JSON.stringify({ enrollments: [{ courseId, status: "active" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  try {
    await withSecret("test-secret-for-quiz-grading", async () => {
      const token = createToken({ _id: "507f191e810c19729de860ea", role: "student", email: "student@example.com" });
      await withServer(testApp(), async baseUrl => {
        const quizResponse = await fetch(`${baseUrl}/${courseId}/quizzes/${quizId}`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(quizResponse.status, 200);
        const quizBody = await quizResponse.json();
        assert.equal("correctAnswers" in quizBody.quiz.questions[0], false);
        const invalidAnswer = await fetch(`${baseUrl}/${courseId}/quizzes/${quizId}/attempts`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ answers: { [questionIds[0]]: "not-an-option" } })
        });
        assert.equal(invalidAnswer.status, 400);
        const attemptResponse = await fetch(`${baseUrl}/${courseId}/quizzes/${quizId}/attempts`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ answers: { [questionIds[0]]: "B", [questionIds[1]]: "Because it is correct." } })
        });
        assert.equal(attemptResponse.status, 201);
        const result = await attemptResponse.json();
        assert.equal(result.needsReview, true);
        assert.equal(result.attempt.score, 2);
        assert.equal(result.questionResults[0].correct, true);
        assert.equal(result.questionResults[1].correct, null);
        assert.equal(result.questionResults[0].correctAnswers[0], "B");
      });
    });
  } finally {
    Course.findById = originalFindById;
    AssessmentAttempt.countDocuments = originalCount;
    AssessmentAttempt.create = originalCreate;
    globalThis.fetch = originalFetch;
  }
});
