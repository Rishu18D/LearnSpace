# Production deployment (Render)

This repository includes a Render Blueprint in [`../../render.yaml`](../../render.yaml). It creates one public Docker web service. The root Dockerfile builds the React frontend and backend into a single image; the API gateway serves the frontend and proxies `/api` to the internal services. The browser uses one Render hostname for both the website and API. The internal services use private loopback ports inside the container.

## Required external services

Provision these before deploying:

- A MongoDB Atlas cluster with seven databases: `slp_auth`, `slp_students`, `slp_courses`, `slp_enrollments`, `slp_notifications`, `slp_progress`, and `slp_analytics`.
- A managed RabbitMQ broker that provides a TLS `amqps://` connection URL.

The included Compose file is for local development only. Its MongoDB has no authentication and must not be exposed publicly; its published ports are now bound to loopback. Do not use the Compose database for public production traffic.

## Deploy

1. Push this repository to a Git provider that Render can access.
2. In the Render Dashboard, choose **New → Blueprint**, connect this repository, and select the branch to deploy. Keep the Blueprint file path as `render.yaml` at the repository root, then review and apply the single web service.
3. Do not create a Docker web service using `scripts/start-project.js` as its Dockerfile. That file is a local development launcher written in JavaScript, not a Dockerfile; this is the cause of the “unknown instruction: import” build error. The Blueprint uses the root `Dockerfile` to build both frontend and backend. The backend-only Dockerfile remains at `student-learning-platform-backend/Dockerfile` for backend-only Docker use.
4. Before the first deploy, provide the requested `MONGO_*_URI` values for the seven Atlas databases and the `RABBITMQ_URL` for your managed TLS RabbitMQ broker. Use separate, least-privilege database credentials. Do not use the local Docker Compose services for production or commit credentials.
5. Restrict Atlas network access to the outbound IP ranges for the Render region where the backend runs. Avoid `0.0.0.0/0`.
6. Let Render generate `JWT_SECRET` and keep `TRUST_PROXY_HOPS=1`. The single-origin deployment does not need `CORS_ORIGIN`.
7. Deploy the service and verify `/health/ready` returns `200`; then open the root URL and verify course browsing and account registration can reach `/api`.
8. Add a custom domain to this same service if needed. Because frontend and API share the domain, no separate CORS or frontend API URL configuration is needed.
9. Create the first administrator only after registering its account:

   ```powershell
   $env:ADMIN_EMAIL = "admin@example.com"
   $env:CONFIRM_ADMIN_EMAIL = "admin@example.com"
   npm run provision:admin
   Remove-Item Env:ADMIN_EMAIL
   Remove-Item Env:CONFIRM_ADMIN_EMAIL
   ```

   Run this command from the backend directory with a secure operator connection to the production `MONGO_AUTH_URI`. Sign out and back in after promotion. The command promotes an existing account; it does not create one.

### If configuring the web service manually

The Blueprint is preferred. If configuring one combined Docker web service manually:

- Set **Root Directory** to `.` (the repository root), **Runtime** to Docker, **Dockerfile Path** to `Dockerfile`, and **Docker Context** to `.`. The root Dockerfile builds and bundles both apps.
- Set `SERVE_FRONTEND=true`, `FRONTEND_DIST_DIR=/app/frontend-dist`, `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `JWT_SECRET`, all seven `MONGO_*_URI` values, and `RABBITMQ_URL`. `CORS_ORIGIN` is not needed for this same-origin setup.
- Do not create a separate static site for the frontend. Set the Render health check path to `/health/ready`.

## Important launch limitations

Instructor sign-up is intentionally open, as requested. Instructor accounts can create and publish public courses; review course content and abuse reports operationally.

Before accepting real users, provide and publish your privacy policy, terms, support contact, data retention/deletion process, and incident-response contact. This starter does not yet implement email verification, password reset, account self-deletion/data export, payment handling, or an instructor moderation workflow. Access tokens last 15 minutes; rotating HttpOnly refresh cookies last 30 days. Access tokens are currently held in browser local storage, so an XSS vulnerability could expose the short-lived token. Use HTTPS and keep frontend dependencies current.

The enrollment event publisher is still best-effort rather than transactional. Do not rely on enrollment notifications as a durable business record. Add monitored backups and restore tests for Atlas, broker alerts/dead-letter handling, structured log collection, uptime alerts, and a tested rollback before production use. The Blueprint defines services but cannot create Atlas or RabbitMQ credentials for you.
