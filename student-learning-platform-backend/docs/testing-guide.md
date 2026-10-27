# Testing Guide

Run the shared middleware regression tests from the backend root:

```powershell
npm test
```

The tests cover shared request validation/error responses, optional JWT authentication, request IDs for malformed JSON, gateway prefix/request-ID forwarding, unpublished-course ownership, and lesson membership checks. They do not require MongoDB or RabbitMQ. Before production, add isolated integration tests for:

- Registration validation, password hashing, duplicate email, invalid login.
- JWT expiry, missing token, role checks, and resource ownership.
- Student profile ownership and pagination.
- Admin publishing and broader course visibility rules.
- Duplicate enrollment (including concurrent requests).
- RabbitMQ consumer idempotency and retry/dead-letter behavior.
- Progress access and lesson completion against real service boundaries.
- Gateway forwarding and upstream timeout/error behavior.

Use an isolated test database and never run destructive tests against production data.
