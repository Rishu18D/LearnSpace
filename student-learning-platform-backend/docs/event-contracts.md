# Event Contracts

## EnrollmentCreated (version 1)

```json
{
  "eventId": "unique-event-id",
  "eventType": "EnrollmentCreated",
  "occurredAt": "2026-01-01T12:00:00.000Z",
  "data": {
    "enrollmentId": "mongo-object-id",
    "studentId": "auth-user-id",
    "courseId": "mongo-object-id"
  }
}
```

Publisher: Enrollment Service. Exchange: `slp.events` (topic, durable). Routing key: `EnrollmentCreated`. Consumer queue: `notifications.enrollment` (durable).

Consumers should be idempotent because messages may be redelivered. The starter uses `eventId` to avoid duplicate notification inserts. The publisher is not transactional: implement an outbox collection and a retrying publisher before relying on events for critical workflows.
