FROM node:22-alpine AS frontend-build
WORKDIR /frontend

COPY student-learning-platform-frontend/package.json student-learning-platform-frontend/package-lock.json ./
RUN npm ci
COPY student-learning-platform-frontend/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIST_DIR=/app/frontend-dist
WORKDIR /app

COPY student-learning-platform-backend/package.json student-learning-platform-backend/package-lock.json ./
COPY student-learning-platform-backend/ ./
RUN npm ci --omit=dev
COPY --from=frontend-build /frontend/dist ./frontend-dist

EXPOSE 10000
CMD ["node", "scripts/start-backend.js"]
