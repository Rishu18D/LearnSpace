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

Backend services can also be started without the frontend:

```powershell
npm run dev:all --prefix student-learning-platform-backend
```

See the [production deployment guide](student-learning-platform-backend/docs/production-deployment.md) before deploying publicly. A Render Blueprint is provided in [render.yaml](render.yaml).
