import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const backendRoot = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({ path: path.join(backendRoot, ".env") });
const isProduction = process.env.NODE_ENV === "production";

if (!isProduction && !existsSync(path.join(backendRoot, ".env"))) {
  console.error("Backend .env is missing. Copy .env.example to .env and set a unique JWT_SECRET first.");
  process.exit(1);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${signal ? `with ${signal}` : `with code ${code}`}`));
    });
  });
}

function pointsToLocalService(value, protocols) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

const usesLocalInfrastructure = [
  process.env.MONGO_AUTH_URI,
  process.env.MONGO_STUDENTS_URI,
  process.env.MONGO_COURSES_URI,
  process.env.MONGO_ENROLLMENTS_URI,
  process.env.MONGO_NOTIFICATIONS_URI,
  process.env.MONGO_PROGRESS_URI,
  process.env.MONGO_ANALYTICS_URI
].some(uri => pointsToLocalService(uri, ["mongodb:", "mongodb+srv:"])) ||
  pointsToLocalService(process.env.RABBITMQ_URL, ["amqp:", "amqps:"]);

if (!isProduction && usesLocalInfrastructure) {
  try {
    await run("docker", ["compose", "up", "-d", "--wait", "--wait-timeout", "120"], { cwd: backendRoot });
  } catch (error) {
    console.error(`Could not start Docker infrastructure: ${error.message}`);
    process.exit(1);
  }
}

const gatewayPort = Number(process.env.PORT || process.env.GATEWAY_PORT || 3000);
if (!Number.isInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) {
  console.error("PORT or GATEWAY_PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

const services = [
  { name: "student-service", port: 3001 },
  { name: "auth-service", port: 3002 },
  { name: "course-service", port: 3003 },
  { name: "enrollment-service", port: 3004 },
  { name: "notification-service", port: 3005 },
  { name: "progress-service", port: 3006 },
  { name: "analytics-service", port: 3007 },
  { name: "api-gateway", port: gatewayPort }
];

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", error => {
      if (error.code === "EADDRINUSE") reject(new Error(`Port ${port} is already in use`));
      else reject(error);
    });
    server.listen(port, () => {
      server.close(error => error ? reject(error) : resolve());
    });
  });
}

try {
  for (const service of services) await assertPortAvailable(service.port);
} catch (error) {
  console.error(`Cannot start backend: ${error.message}. Stop the existing service or configure PORT/GATEWAY_PORT if the gateway port is occupied.`);
  process.exit(1);
}

const children = new Set();
let stopping = false;
let startupError;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

for (const service of services) {
  const cwd = service.name === "api-gateway"
    ? path.join(backendRoot, "api-gateway")
    : path.join(backendRoot, "services", service.name);
  const args = [...(isProduction ? [] : ["--watch"]), "src/server.js"];
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, PORT: String(service.port) },
    stdio: "inherit"
  });
  children.add(child);
  child.once("error", error => {
    startupError = error;
    console.error(`Could not start ${service.name}: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      startupError = new Error(`${service.name} exited ${signal ? `with ${signal}` : `with code ${code}`}`);
      console.error(startupError.message);
      stop(code || 1);
    }
    if (stopping && children.size === 0) process.exit(process.exitCode || 0);
  });
}

async function waitForReadiness() {
  const deadline = Date.now() + 120_000;
  while (!stopping && Date.now() < deadline) {
    if (startupError) throw startupError;
    const results = await Promise.all(services.map(async service => {
      try {
        const response = await fetch(`http://127.0.0.1:${service.port}/health/ready`, {
          signal: AbortSignal.timeout(1500)
        });
        return response.ok;
      } catch {
        return false;
      }
    }));
    if (results.every(Boolean)) {
      console.log(`Backend ready: API Gateway at http://localhost:${gatewayPort}`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!stopping) throw new Error("Backend services did not become healthy within 120 seconds");
}

try {
  await waitForReadiness();
} catch (error) {
  console.error(error.message);
  stop(1);
}

if (stopping && children.size === 0) process.exit(process.exitCode || 0);
