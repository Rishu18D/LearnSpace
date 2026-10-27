# Database Design

All IDs are MongoDB ObjectIds except external `userId`, `studentId`, and `courseId` references, which are stored as strings at service boundaries.

- `slp_auth.users`: unique email, password hash, role, active status.
- `slp_students.students`: unique `userId`, name, email, avatar URL, bio.
- `slp_courses.courses`: unique slug, instructor ID, course objectives and metadata, modules with stable lesson IDs, quizzes and hidden answer keys, publication/archive state, and optional unique import key. Legacy flat `lessons` remain supported for existing courses.
- `slp_enrollments.enrollments`: unique compound index on studentId + courseId.
- `slp_notifications.notifications`: eventId unique/sparse for event deduplication; index on userId + createdAt.
- `slp_progress.lessonprogresses`: unique compound index on studentId + courseId + lessonId, completion and last-access timestamps.
- `slp_courses.assessmentattempts`: student/course/quiz IDs, ordered attempt number, submitted answers, score, and review state. The unique attempt-number index prevents concurrent duplicate attempt slots.
- `slp_analytics`: reserved for future materialized read models.

Course modules are additive and legacy top-level lessons remain readable. A removed module or lesson is archived on course edits so existing progress references remain intact. Course deletion is a soft archive. Schema changes should be introduced deliberately: back up data, deploy code that can read both forms, backfill when needed, and remove old fields only after all services no longer depend on them.
