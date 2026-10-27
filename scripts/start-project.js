import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const backendRoot = path.join(projectRoot, "student-learning-platform-backend");
const frontendRoot = path.join(projectRoot, "student-learning-platform-frontend");
const children = new Set();
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

function start(name, args, cwd) {
  const child = spawn(process.execPath, args, { cwd, stdio: "inherit" });
  children.add(child);
  child.once("error", error => {
    console.error(`Could not start ${name}: ${error.message}`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} exited ${signal ? `with ${signal}` : `with code ${code}`}`);
      stop(code || 1);
    }
    if (stopping && children.size === 0) process.exit(process.exitCode || 0);
  });
  return child;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("backend", [path.join(backendRoot, "scripts", "start-backend.js")], backendRoot);
start("frontend", [path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js"), "--host", "0.0.0.0"], frontendRoot);
