# Production deployment (Render)

This repository includes a Render Blueprint in [`../../render.yaml`](../../render.yaml). The backend is packaged as one Docker web service that runs the gateway and its seven internal services; the React app is a separate Render static site. Only the gateway is exposed publicly. The backend services use their local ports inside the container.

## Required external services

Provision these before deploying:

- A MongoDB Atlas cluster with seven databases: `slp_auth`, `slp_students`, `slp_courses`, `slp_enrollments`, `slp_notifications`, `slp_progress`, and `slp_analytics`.
- A managed RabbitMQ broker that provides a TLS `amqps://` connection URL.

The included Compose file is for local development only. Its MongoDB has no authentication and must not be exposed publicly; its published ports are now bound to loopback. Do not use the Compose database for public production traffic.

## Deploy

1. Push this repository to a Git provider that Render can access.
2. In the Render Dashboard, choose **New → Blueprint**, connect this repository, and select the branch to deploy. Keep the Blueprint file path as `render.yaml` at the repository root, then review and apply the detected services. This Blueprint creates the backend Docker web service and the frontend static site together.
3. Do not create a Docker web service using `scripts/start-project.js` as its Dockerfile. That file is a local development launcher written in JavaScript, not a Dockerfile; this is the cause of the “unknown instruction: import” build error. The backend Dockerfile is `student-learning-platform-backend/Dockerfile` and is already configured by the Blueprint.
4. Before the first deploy, provide the requested `MONGO_*_URI` values for the seven Atlas databases and the `RABBITMQ_URL` for your managed TLS RabbitMQ broker. Use separate, least-privilege database credentials. Do not use the local Docker Compose services for production or commit credentials.
5. Restrict Atlas network access to the outbound IP ranges for the Render region where the backend runs. Avoid `0.0.0.0/0`.
6. Let Render generate `JWT_SECRET` and keep `TRUST_PROXY_HOPS=1`. The Blueprint connects the frontend host to the backend CORS configuration and the backend host to the frontend build.
7. Deploy both services and verify the backend `/health/ready` endpoint returns `200`; then open the frontend and verify that course browsing and account registration can reach the API.
8. Set custom domains in Render if needed. Prefer frontend and API domains under the same registrable domain so browsers send the `SameSite=Lax` refresh cookie. If the frontend or backend domains change, update the backend `CORS_ORIGIN` to the exact frontend origin (scheme and host, no path), and rebuild the frontend with its API base set to the backend host.
9. Create the first administrator only after registering its account:

   ```powershell
   $env:ADMIN_EMAIL = "admin@example.com"
   $env:CONFIRM_ADMIN_EMAIL = "admin@example.com"
   npm run provision:admin
   Remove-Item Env:ADMIN_EMAIL
   Remove-Item Env:CONFIRM_ADMIN_EMAIL
   ```

   Run this command from the backend directory with a secure operator connection to the production `MONGO_AUTH_URI`. Sign out and back in after promotion. The command promotes an existing account; it does not create one.

### If configuring services manually

The Blueprint is preferred because it wires the frontend API URL and backend CORS origin automatically. If you continue configuring the existing Render service instead:

- For the backend web service, use the repository root, Docker runtime, **Root Directory** `student-learning-platform-backend`, **Dockerfile Path** `Dockerfile`, and **Docker Context** `.`. Those Docker paths are relative to the configured root directory. Do not use `scripts/start-project.js` as the Dockerfile or start command; the container already uses the `CMD` in `Dockerfile`.
- Set the same backend environment variables listed in the Blueprint, including the seven `MONGO_*_URI` values, `RABBITMQ_URL`, `JWT_SECRET`, `NODE_ENV=production`, and `TRUST_PROXY_HOPS=1`. Set `CORS_ORIGIN` to the frontend's exact HTTPS origin. If you copied values from the local `.env.example`, change `NODE_ENV=development` to `production`; the backend now detects Render and enforces production mode automatically.
- Create a separate Render **Static Site** for the frontend with **Root Directory** `student-learning-platform-frontend`, **Build Command** `npm ci && npm run build`, and **Publish Directory** `dist`. Add a rewrite from `/*` to `/index.html` for client-side routes, and set `VITE_API_BASE_URL` to the backend service host. Redeploy after changing this build-time variable.

## Important launch limitations

Instructor sign-up is intentionally open, as requested. Instructor accounts can create and publish public courses; review course content and abuse reports operationally.

Before accepting real users, provide and publish your privacy policy, terms, support contact, data retention/deletion process, and incident-response contact. This starter does not yet implement email verification, password reset, account self-deletion/data export, payment handling, or an instructor moderation workflow. Access tokens last 15 minutes; rotating HttpOnly refresh cookies last 30 days. Access tokens are currently held in browser local storage, so an XSS vulnerability could expose the short-lived token. Use HTTPS and keep frontend dependencies current.

The enrollment event publisher is still best-effort rather than transactional. Do not rely on enrollment notifications as a durable business record. Add monitored backups and restore tests for Atlas, broker alerts/dead-letter handling, structured log collection, uptime alerts, and a tested rollback before production use. The Blueprint defines services but cannot create Atlas or RabbitMQ credentials for you.
