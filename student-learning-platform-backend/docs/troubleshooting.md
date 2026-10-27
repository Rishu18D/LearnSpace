# Troubleshooting

- MongoDB connection failure: `docker compose ps`; then `docker compose logs mongo`.
- RabbitMQ connection failure: `docker compose logs rabbitmq`; management UI is `http://localhost:15672` (default local credentials guest/guest).
- Gateway returns 502: check target service logs and configured service URL.
- 401: register/login again and send `Authorization: Bearer <accessToken>`.
- 403: verify the account role and whether the resource belongs to the caller.
- Duplicate key: an email, slug, enrollment, progress item, or event ID already exists.
- Port in use: identify and stop the process or configure a different port consistently.
