# Student Learning Platform — Frontend

React and Vite web client for the Student Learning Platform backend.

## Run locally

1. From the project root, follow the [one-command setup](../README.md) to start Docker, the backend, and the frontend together.
2. Install frontend dependencies:

   ```powershell
   npm install
   ```

3. Keep the API base URL as `/api` for local development. The Vite development server proxies it to `http://localhost:3000`, avoiding cross-origin browser requests:

   ```powershell
   Copy-Item .env.example .env
   ```

4. To run only the frontend after the backend is already running:

   ```powershell
   npm run dev
   ```

Open the URL printed by Vite (normally `http://localhost:5173`). For a deployed frontend, configure `VITE_API_BASE_URL` to the API Gateway URL or a same-origin `/api` reverse-proxy path.

## Before public launch

- The frontend currently has no self-service password recovery flow because the backend does not expose password-reset endpoints. Provide a real support contact or implement and test the full reset flow before inviting the public.
- Add owner-approved privacy, terms, and support information before launch; these depend on your organization and cannot be safely supplied by the UI.
- Configure and verify the production API URL, allowed frontend origin, and database/message-broker services using the [production deployment guide](../student-learning-platform-backend/docs/production-deployment.md).

## Verify

```powershell
npm run build
```
