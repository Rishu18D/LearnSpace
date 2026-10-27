# Production deployment (Render)

This repository includes a Render Blueprint in [`../../render.yaml`](../../render.yaml). The backend is packaged as one Docker web service that runs the gateway and its seven internal services; the React app is a separate Render static site. Only the gateway is exposed publicly. The backend services use their local ports inside the container.

## Required external services

Provision these before deploying:

- A MongoDB Atlas cluster with seven databases: `slp_auth`, `slp_students`, `slp_courses`, `slp_enrollments`, `slp_notifications`, `slp_progress`, and `slp_analytics`.
- A managed RabbitMQ broker that provides a TLS `amqps://` connection URL.

The included Compose file is for local development only. Its MongoDB has no authentication and must not be exposed publicly; its published ports are now bound to loopback. Do not use the Compose database for public production traffic.

## Deploy

1. Push this repository to a Git provider that Render can access.
2. In Render, create a Blueprint using the repository's `render.yaml`.
3. Set each `MONGO_*_URI` to its corresponding Atlas database URI, with TLS enabled and a database user limited to that database. Set `RABBITMQ_URL` to the managed broker's TLS URL. Do not reuse credentials or commit them.
4. Restrict Atlas network access to the outbound IP ranges for the Render region where the backend runs. Avoid `0.0.0.0/0`.
5. Let the Blueprint generate `JWT_SECRET`; keep `TRUST_PROXY_HOPS=1`. The frontend origin is connected to the backend CORS setting by the Blueprint.
6. Deploy both services and verify the backend `/health/ready` endpoint returns `200`. The frontend API base is built from the backend host automatically.
7. Set custom domains in Render if needed. Prefer frontend and API domains under the same registrable domain so browsers send the `SameSite=Lax` refresh cookie. If the frontend and backend domains change, update the backend `CORS_ORIGIN` to the exact frontend origin (scheme and host, no path).
8. Create the first administrator only after registering its account:

   ```powershell
   npm run admin:promote -w auth-service -- admin@example.com
   ```

   Run this command from the backend directory with a secure operator connection to the production `MONGO_AUTH_URI`. Sign out and back in after promotion.

## Important launch limitations

Instructor sign-up is intentionally open, as requested. Instructor accounts can create and publish public courses; review course content and abuse reports operationally.

Before accepting real users, provide and publish your privacy policy, terms, support contact, data retention/deletion process, and incident-response contact. This starter does not yet implement email verification, password reset, account self-deletion/data export, payment handling, or an instructor moderation workflow. Access tokens last 15 minutes; rotating HttpOnly refresh cookies last 30 days. Access tokens are currently held in browser local storage, so an XSS vulnerability could expose the short-lived token. Use HTTPS and keep frontend dependencies current.

The enrollment event publisher is still best-effort rather than transactional. Do not rely on enrollment notifications as a durable business record. Add monitored backups and restore tests for Atlas, broker alerts/dead-letter handling, structured log collection, uptime alerts, and a tested rollback before production use. The Blueprint defines services but cannot create Atlas or RabbitMQ credentials for you.
