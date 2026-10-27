# Setup Guide

1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env`. It is configured for the local Docker Compose MongoDB, RabbitMQ, and Redis services. Replace those URLs only when using hosted providers, and generate a unique `JWT_SECRET` (at least 32 characters). Never put real credentials in `.env.example` or commit `.env`.
3. Run `npm install`.
4. From the backend root, run `npm run dev:all`. It starts local Docker infrastructure only when the MongoDB or RabbitMQ URLs point to localhost, then starts every service and the gateway and waits for health checks.
5. Check `http://localhost:3000/health/ready`; it returns `200` only when all backend services are ready.
6. Start the frontend on `http://localhost:5173`; this matches the default `CORS_ORIGIN`.
7. Register a test student using the commands in README.md.

For MongoDB Atlas, put each service's database name in the URI path and keep write concern separate. For example:

```text
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/slp_courses?retryWrites=true&w=majority
```

Do not put the database name in the `w` parameter. The services validate MongoDB URIs at startup and report malformed database/write-concern settings before accepting requests.

The local `.env` is loaded by the backend processes started from the project. `CORS_ORIGIN` must be the frontend's exact origin (scheme, hostname, and port); for example, `http://localhost:5173`. If the frontend is opened on another port or hostname, update this value and restart the backend. `TRUST_PROXY_HOPS=0` is appropriate for direct local access; set it to the exact number of trusted reverse proxies in a hosted deployment.

The default Compose command starts local MongoDB, RabbitMQ, and Redis infrastructure; application services run on the host with `npm run dev:all`. The `.env.example` uses these local services by default. With hosted URLs, `npm run dev:all` skips starting local Docker infrastructure; if any MongoDB or RabbitMQ URL points to localhost, the dev command starts the local containers.

To run the complete backend application bundle in Docker, configure hosted MongoDB and RabbitMQ URLs in `.env`, then run:

```powershell
docker compose --profile application up -d --build backend
```

The Docker image receives `.env` as runtime environment variables; it does not copy `.env` into the image. The gateway is available at `http://localhost:3000` (or the configured `GATEWAY_PORT`). In this bundled Docker topology, the gateway and internal services share a container, so their `localhost` service URLs are correct. To run services in separate containers, use their Compose DNS names instead.

`REDIS_URL` must be a connection URL such as `redis://...` or `rediss://...`, not a `redis-cli -u ...` command. The course service caches public catalog and course-detail responses for 60 seconds and invalidates cached generations after course updates or archival. Without `REDIS_URL`, requests use MongoDB directly. Only public course views are cached; authenticated views that may contain private content bypass the shared cache.
