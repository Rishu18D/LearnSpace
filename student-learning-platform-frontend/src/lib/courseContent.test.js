import test from "node:test";
import assert from "node:assert/strict";
import { getPublishedLessons } from "./courseContent.js";

test("module courses include only lessons in published, active modules", () => {
  const course = {
    modules: [
      { _id: "published", title: "Published", lessons: [
        { _id: "visible", published: true },
        { _id: "hidden-lesson", published: false },
        { _id: "archived-lesson", archived: true }
      ] },
      { _id: "draft", published: false, lessons: [{ _id: "draft-lesson" }] },
      { _id: "archived", archived: true, lessons: [{ _id: "archived-module-lesson" }] }
    ],
    lessons: [
      { _id: "visible", moduleId: "published" },
      { _id: "draft-lesson", moduleId: "draft" }
    ]
  };

  assert.deepEqual(getPublishedLessons(course).map(lesson => lesson._id), ["visible"]);
});

test("unpublished module content is not treated as legacy lesson content", () => {
  const course = {
    modules: [{ published: false, lessons: [{ _id: "hidden" }] }],
    lessons: [{ _id: "hidden", moduleId: "draft" }]
  };

  assert.deepEqual(getPublishedLessons(course), []);
});

test("legacy courses include only lessons that are not unpublished or archived", () => {
  const course = {
    lessons: [
      { _id: "visible" },
      { _id: "draft", published: false },
      { _id: "archived", archived: true }
    ]
  };

  assert.deepEqual(getPublishedLessons(course).map(lesson => lesson._id), ["visible"]);
});
