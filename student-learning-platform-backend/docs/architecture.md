# Architecture

The browser talks only to the API Gateway. The Gateway proxies each `/api/<service>` prefix to one backend service. Services own their business logic and collections; they must not read each other's MongoDB databases directly.

## Request flow

`Browser -> Vite /api proxy -> Gateway :3000 -> target service -> owned MongoDB database`

## Service ownership

- Auth: account identity, password hash, role.
- Student: profile information keyed by auth `userId`.
- Course: course metadata and lesson definitions.
- Enrollment: student/course enrollment records.
- Notification: per-user in-app notification records.
- Progress: per-user lesson completion records.
- Analytics: role-checked summaries. The current implementation aggregates some service APIs synchronously.

## Event flow

Enrollment Service emits `EnrollmentCreated` to RabbitMQ exchange `slp.events`. Notification Service consumes the event and inserts a notification idempotently using the unique `eventId` index. This first version is best-effort, not a durable outbox implementation.

## Trust boundaries

Every service validates the JWT for protected routes. Role checks alone are not sufficient: resource ownership checks are also required. Do not expose service ports publicly in a production deployment; expose only the Gateway.
