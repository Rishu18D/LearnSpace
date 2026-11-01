# API Reference (starter)

All paths below are exposed through the Gateway. Protected routes require `Authorization: Bearer <accessToken>`.

| Method | Path | Auth / permission | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public; creates a student by default; accepts `role: "student"` or `"instructor"` (never admin) | Register |
| POST | `/api/auth/login` | Public; rate limited | Login |
| POST | `/api/auth/refresh` | Refresh cookie | Rotate the refresh session and issue a new access token |
| POST | `/api/auth/logout` | Refresh cookie | Revoke the refresh session and clear the cookie |
| GET | `/api/auth/me` | Any authenticated user | Current identity |
| POST | `/api/students` | Authenticated | Create own profile if missing |
| GET | `/api/students/me` | Authenticated | Own profile |
| PATCH | `/api/students/me` | Authenticated | Update own profile |
| GET | `/api/students` | Admin | Paginated profiles |
| GET | `/api/courses` | Public | Paginated, searchable published course catalog |
| GET | `/api/courses/:id-or-slug` | Public for published courses; owner/admin can preview drafts | Course detail, modules, published lessons, and readable lesson content |
| GET | `/api/courses/manage/mine` | Instructor/admin | Managed courses |
| POST | `/api/courses` | Instructor/admin | Create a draft course with modules, lessons, and assessments |
| PATCH | `/api/courses/:id` | Instructor/admin; owner/admin | Update course; publish requires learning objectives and published lessons |
| DELETE | `/api/courses/:id` | Instructor/admin; owner/admin | Archive course while preserving student progress |
| POST | `/api/courses/:id/duplicate` | Instructor/admin; owner/admin | Duplicate course as a new draft with new content IDs |
| POST | `/api/courses/manage/import` | Admin | Validate or import JSON `{ "dryRun": true, "courses": [...] }`; import keys are idempotent and existing courses are not overwritten |
| GET | `/api/courses/:id/quizzes/:quizId` | Enrolled student or admin | Get quiz questions without student-visible answer keys |
| POST | `/api/courses/:id/quizzes/:quizId/attempts` | Enrolled student | Submit answers for backend grading |
| GET | `/api/courses/:id/quizzes/:quizId/attempts/me` | Enrolled student | View own attempts |
| GET | `/api/courses/:id/attempts/pending` | Course owner/admin | List pending subjective responses for instructor review |
| PATCH | `/api/courses/:id/quizzes/:quizId/attempts/:attemptId/review` | Course owner/admin | Review subjective answers |
| POST | `/api/enrollments` | Student | Enroll using `{ "courseId": "<id>" }` |
| GET | `/api/enrollments/me` | Authenticated | Own paginated enrollments; optionally filter by `courseId` and status |
| GET | `/api/enrollments/me/summary` | Authenticated | Exact counts of own active, completed, cancelled, and total enrollments |
| GET | `/api/enrollments/:id` | Owner/admin | Enrollment details |
| PATCH | `/api/enrollments/:id` | Owner/admin | Cancel an active enrollment, or mark it complete after every published lesson is verified complete |
| GET | `/api/notifications` | Authenticated | Own paginated notification feed; optionally filter by `status=unread` or `status=read`; includes overall status counts |
| PATCH | `/api/notifications/:id/read` | Owner | Mark notification read |
| PATCH | `/api/notifications/read-all` | Authenticated | Mark all of the current user's unread notifications as read |
| GET | `/api/progress/me` | Authenticated | Own progress |
| POST | `/api/progress/lessons/:lessonId/complete` | Authenticated and enrolled | Complete lesson |
| POST | `/api/progress/courses/:courseId/lessons/:lessonId/access` | Student with active enrollment | Save last lesson accessed |
| GET | `/api/analytics/student` | Authenticated | Own active/completed/total enrollments, completed lessons, and unread notifications |
| GET | `/api/analytics/instructor` | Instructor/admin | Managed, published, draft, and archived course totals |
| GET | `/api/analytics/admin` | Admin | Platform student-profile and course publishing totals |

Validation errors use a JSON `error` object. Authenticated service routes return `401` for missing/invalid tokens and `403` for insufficient permission. Not every route has a complete formal OpenAPI schema yet.
