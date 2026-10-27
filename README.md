# Learnspace

Student learning platform with a React/Vite frontend and an Express microservices backend.

## Run the whole project locally

Requirements: Node.js 20+, npm 10+, and Docker Desktop.

1. Copy `student-learning-platform-backend/.env.example` to `student-learning-platform-backend/.env`.
2. Set `JWT_SECRET` to a unique random value with at least 32 characters.
3. Install dependencies once:

   ```powershell
   npm install --prefix student-learning-platform-backend
   npm install --prefix student-learning-platform-frontend
   ```

4. From this project root, start Docker infrastructure, every backend service, the API gateway, and the frontend with one command:

   ```powershell
   npm run dev
   ```

Open [http://localhost:5173](http://localhost:5173). The API is available through the gateway at [http://localhost:3000](http://localhost:3000). Press Ctrl+C to stop the app processes; Docker data is preserved.

Run the backend regression tests from the project root with `npm test`.

## Deploy on Render

The repository includes a Render Blueprint at [render.yaml](render.yaml). Push the repository to GitHub, then in Render choose **New → Blueprint**, select this repository and branch, and keep `render.yaml` as the Blueprint path. Render will build and deploy one Docker web service: the React frontend is built into the image and served by the API gateway, and all backend services run in that same service. The website and `/api` use the same Render URL. Do not select `scripts/start-project.js` as a Dockerfile; it is only the local development launcher. The root [Dockerfile](Dockerfile) builds the combined Render app; the backend also retains its backend-only Dockerfile for local Docker use.

The app still needs externally hosted MongoDB Atlas databases and a managed RabbitMQ broker; Render does not run the local Docker Compose infrastructure. Follow the [Render deployment guide](student-learning-platform-backend/docs/production-deployment.md) for required environment variables, network configuration, deploy verification, and launch limitations.

Backend services can also be started without the frontend:

```powershell
npm run dev:all --prefix student-learning-platform-backend
```

See the [production deployment guide](student-learning-platform-backend/docs/production-deployment.md) before deploying publicly. A Render Blueprint is provided in [render.yaml](render.yaml).
