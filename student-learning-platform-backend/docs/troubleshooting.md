# Troubleshooting

- MongoDB connection failure: `docker compose ps`; then `docker compose logs mongo`.
- Render `/health/ready` returns 503: inspect its `checks` object. `database: "disconnected"` means the service cannot reach its configured MongoDB database; `status: "unreachable"` means the gateway cannot reach that backend process. Check Render service logs for the MongoDB connection error, then verify every `MONGO_*_URI` has the correct Atlas hostname, database name, database-user credentials, and URL-encoded special characters in the username/password. In Atlas Network Access, allow the outbound IP ranges shown for this Render service's region. A running frontend or gateway does not mean the backend database is reachable.
- For the single-container Render deployment, leave `AUTH_SERVICE_URL`, `COURSE_SERVICE_URL`, and the other `*_SERVICE_URL` overrides unset so the gateway uses its internal `localhost` service ports. Never point them at the public Render URL; that routes service-to-service requests back through the gateway.
- Render course API returns 502: open `/health/ready` and follow `checks.courses`. Confirm `MONGO_COURSES_URI` points to the intended Atlas database and that the Atlas database user has read/write access. An empty database should return an empty course list; 502 indicates the course service is unavailable, not merely that the database has no course records.
- RabbitMQ connection failure: `docker compose logs rabbitmq`; management UI is `http://localhost:15672` (default local credentials guest/guest).
- Gateway returns 502: check target service logs and configured service URL.
- 401: register/login again and send `Authorization: Bearer <accessToken>`.
- 403: verify the account role and whether the resource belongs to the caller.
- Duplicate key: an email, slug, enrollment, progress item, or event ID already exists.
- Port in use: identify and stop the process or configure a different port consistently.
