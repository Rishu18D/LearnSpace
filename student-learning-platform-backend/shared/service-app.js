import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import "./load-env.js";
import { requestId, errorHandler, notFound, corsOrigins } from "./index.js";

export function createApp({ name, mongoUriEnv, routes, jsonLimit = "1mb" }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: corsOrigins(), credentials: true }));
  app.use(requestId);
  app.use(express.json({ limit: jsonLimit }));
  app.get("/health/live", (req, res) => res.json({ service: name, status: "alive" }));
  app.get("/health/ready", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ service: name, status: ready ? "ready" : "not_ready", database: ready ? "connected" : "disconnected" });
  });
  app.use("/", routes);
  app.use(notFound);
  app.use(errorHandler);
  app.locals.mongoUriEnv = mongoUriEnv;
  return app;
}

export async function startService(app, port, { onShutdown = async () => {} } = {}) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  const envName = app.locals.mongoUriEnv;
  const uri = process.env[envName];
  if (!uri) throw new Error(`${envName} must be configured`);
  let mongoUri;
  try {
    mongoUri = new URL(uri);
  } catch {
    throw new Error(`${envName} must be a valid MongoDB connection URI`);
  }
  if (!["mongodb:", "mongodb+srv:"].includes(mongoUri.protocol)) {
    throw new Error(`${envName} must use mongodb:// or mongodb+srv://`);
  }
  if (mongoUri.searchParams.get("w")?.includes("/")) {
    throw new Error(`${envName} has an invalid write concern. Put the database name in the URI path and use w=majority.`);
  }
  if (!mongoUri.pathname || mongoUri.pathname === "/") {
    throw new Error(`${envName} must include the database name in the URI path`);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(port, () => console.log(`${app.locals.serviceName || "Service"} listening on ${port}`));
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      await mongoose.disconnect();
      await onShutdown();
      process.exit(0);
    } catch (error) {
      console.error("Service shutdown failed", error);
      process.exit(1);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
