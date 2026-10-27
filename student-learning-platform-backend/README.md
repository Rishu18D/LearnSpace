# Student Learning Platform — Backend

Node.js + Express microservices monorepo. The React/Vite frontend is intentionally excluded.

## Services and ports

| Component | Port | Responsibility |
|---|---:|---|
| API Gateway | 3000 | Single public API entry point and proxy routing |
| Student Service | 3001 | Student profile data |
| Auth Service | 3002 | Registration, login, JWT identity |
| Course Service | 3003 | Courses and lesson definitions |
| Enrollment Service | 3004 | Course enrollments; emits `EnrollmentCreated` |
| Notification Service | 3005 | In-app notifications; consumes enrollment events |
| Progress Service | 3006 | Lesson completion records |
| Analytics Service | 3007 | Role-aware summary endpoints |
| MongoDB | 27017 | Local development database server |
| RabbitMQ | 5672 | Event broker; management UI on 15672 |
| Redis | 6379 | Optional cache for public course catalog and detail responses |

Each service uses a distinct logical MongoDB database. This is development isolation, not strong production security isolation.

## Requirements

- Node.js 20 or newer
- npm 10 or compatible
- Docker Desktop (for MongoDB and RabbitMQ)

## Windows PowerShell setup

1. Extract the project ZIP and open PowerShell in its root folder.
2. Create a local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Replace `JWT_SECRET` in `.env` with a long random secret. Do not commit `.env`.
4. Start infrastructure:

   ```powershell
   docker compose up -d
   ```

5. Install dependencies:

   ```powershell
   npm install
   ```

6. Start all backend services and the gateway from the backend root. Local Docker infrastructure starts automatically only when a MongoDB or RabbitMQ URL points to localhost:

   ```powershell
   npm run dev:all
   ```

   To run the bundled backend in Docker instead, use `docker compose --profile application up -d --build backend`. It reads the backend `.env` at container runtime.

The command waits for MongoDB and RabbitMQ, starts each service in watch mode, and verifies service readiness. Press Ctrl+C to stop the services; Docker volumes are preserved. To start an individual service for debugging, use its `npm run dev:<service>` command.

## First API checks

Gateway health:

```powershell
Invoke-RestMethod http://localhost:3000/health/live
```

Register a student:

```powershell
$body = @{
  name = "Test Student"
  email = "student@example.com"
  password = "Use-A-Long-Unique-Password-123!"
} | ConvertTo-Json

$auth = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/register -ContentType "application/json" -Body $body
$token = $auth.accessToken
$headers = @{ Authorization = "Bearer $token" }
```

Create the student's profile:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/students -Headers $headers -ContentType "application/json" -Body (@{} | ConvertTo-Json)
```

Get current identity:

```powershell
Invoke-RestMethod http://localhost:3000/api/auth/me -Headers $headers
```

List public courses:

```powershell
Invoke-RestMethod http://localhost:3000/api/courses
```

## Main endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/students`, `GET /api/students/me`, `PATCH /api/students/me`, `GET /api/students/:id`
- `GET /api/courses`, `GET /api/courses/:id-or-slug`, `GET /api/courses/manage/mine`, `POST /api/courses`, `PATCH /api/courses/:id`, `DELETE /api/courses/:id` (archives)
- `POST /api/courses/:id/duplicate`, `POST /api/courses/manage/import`, quiz retrieval, submission, attempt history, and instructor review endpoints
- `POST /api/enrollments`, `GET /api/enrollments/me`, `GET /api/enrollments/:id`, `PATCH /api/enrollments/:id`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`
- `GET /api/progress/me`, `GET /api/progress/courses/:courseId`, `POST /api/progress/lessons/:lessonId/complete`
- `POST /api/progress/courses/:courseId/lessons/:lessonId/access`
- `GET /api/analytics/student`, `GET /api/analytics/instructor`, `GET /api/analytics/admin`

## Important implementation notes

- JWT access tokens expire after 15 minutes. Rotating refresh sessions are stored as hashes and delivered through HttpOnly cookies; logout revokes the refresh session. A stolen access token remains valid until it expires.
- Public registration creates a `student` by default and may create an `instructor` when explicitly requested. Admin accounts cannot be created through public registration.
- Instructors can sign up publicly and publish courses. This is intentional for the current launch model; add approval and moderation if open publishing is no longer acceptable.
- Refresh tokens are rotated in HttpOnly cookies; access tokens last 15 minutes. The browser still stores short-lived access tokens in local storage.
- The enrollment event publisher is best-effort in this starter. A production implementation should use a transactional outbox and retries; a MongoDB record and RabbitMQ publish are not one atomic transaction.
- Analytics is a live API aggregation starter, not a materialized analytics read model. The admin endpoint intentionally does not invent totals.
- When `REDIS_URL` is configured, the course service caches public catalog and published course-detail responses for 60 seconds. Authenticated course views bypass this shared cache; Redis failures are logged and requests fall back to MongoDB.
- The services use one MongoDB server with separate logical databases for local development. Production should use per-service credentials and stricter network boundaries.
- The notification consumer starts with the Notification Service. Repeated poison messages are rejected without requeue in this starter; a configured dead-letter exchange and operational replay process should be added before production.
- Progress checks both active enrollment and lesson membership through the Enrollment and Course Services before recording completion.
- A cancelled enrollment can be reactivated by enrolling again; active and completed enrollments remain protected from duplicate enrollment.
- This is a learning MVP and is not automatically production-ready. See the [production deployment guide](docs/production-deployment.md) for hosted services, security limitations, and remaining operational work.

## Course authoring, imports, and administrator provisioning

Teachers can create courses from **Manage courses**. Add learning objectives, modules, ordered lessons, Markdown content, resources, and assessments. Save as a draft, preview it, then publish after the server-side content checklist passes. Published lesson content is readable on the course page without enrollment. Quiz answer keys remain private; the course service grades objective questions and places short answers in an instructor-review queue. Removed modules/lessons and deleted courses are archived so progress references are preserved.

Administrators can import JSON from the course studio. Select a JSON file and run the dry-run preview before importing. [`docs/examples/sample-course.json`](docs/examples/sample-course.json) demonstrates the supported course/module/lesson/quiz format. Each imported course may have a stable `importKey`; a key already stored or repeated in the same file is rejected, and existing data is never overwritten. Imported courses are drafts. If a batch write fails, the service attempts to remove records created by that batch before reporting failure.

Public registration cannot create an administrator. Provision an administrator only through an operator-controlled command, after registering the account:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:CONFIRM_ADMIN_EMAIL = "admin@example.com"
npm run provision:admin
Remove-Item Env:ADMIN_EMAIL
Remove-Item Env:CONFIRM_ADMIN_EMAIL
```

Run from the backend root with access to the protected `MONGO_AUTH_URI` credential. No unauthenticated admin-creation endpoint is provided.

Current limitations: course and assessment data share a nested course-service document; video/file hosting is not provided (use approved HTTPS links); import history is logged rather than stored in a browsable history collection; subjective answers require instructor review. Add deployment-specific backup/recovery, monitoring, rate limits, and security review before public production use.

## Troubleshooting

- `ECONNREFUSED` to MongoDB/RabbitMQ: run `docker compose ps` and inspect logs with `docker compose logs mongo rabbitmq`.
- `JWT_SECRET is not configured`: check root `.env` and start services from the repository root.
- Gateway `502`: check that the destination service is running on its configured port.
- `EADDRINUSE`: another process already uses the port; stop it or change the service port and matching URL.
- MongoDB connection errors: verify Docker Desktop is running and port 27017 is available.
