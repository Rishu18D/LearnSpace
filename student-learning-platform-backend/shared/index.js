import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

export function corsOrigins() {
  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    if (process.env.NODE_ENV === "production" && process.env.SERVE_FRONTEND === "true") return [];
    return ["http://localhost:5173"];
  }

  return configured.split(",").map(value => {
    const origin = value.trim();
    if (origin === "*") throw new Error("CORS_ORIGIN must list trusted frontend origins, not *");
    if (!origin) throw new Error("CORS_ORIGIN cannot contain an empty origin");

    const withProtocol = /^https?:\/\//i.test(origin)
      ? origin
      : `${process.env.NODE_ENV === "production" ? "https" : "http"}://${origin}`;
    let parsed;
    try {
      parsed = new URL(withProtocol);
    } catch {
      throw new Error(`CORS_ORIGIN contains an invalid origin: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error(`CORS_ORIGIN must contain origins without paths: ${origin}`);
    }
    return parsed.origin;
  });
}

export function trustedClientIp(req) {
  const gatewayIp = req.get("x-client-ip");
  return gatewayIp && isIP(gatewayIp) ? gatewayIp : req.ip;
}

export function requestId(req, res, next) {
  const suppliedId = req.headers["x-request-id"];
  const id = typeof suppliedId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId)
    ? suppliedId
    : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function createToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return jwt.sign(
    { sub: String(user._id), role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m", issuer: "slp-auth", audience: "slp-api", algorithm: "HS256" }
  );
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Bearer token required" }, requestId: req.requestId });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "slp-auth",
      audience: "slp-api",
      algorithms: ["HS256"]
    });
    next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" }, requestId: req.requestId });
  }
}

export function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Insufficient permissions" }, requestId: req.requestId });
    }
    next();
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const duplicate = err.codeName === "DuplicateKey" || err.code === 11000;
  const candidateStatus = Number(err.status || err.statusCode);
  const status = duplicate ? 409 :
    (candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus :
      (["ZodError", "ValidationError", "CastError"].includes(err.name) || err.type === "entity.parse.failed" ? 400 : 500));
  const code = duplicate ? "CONFLICT" :
    err.name === "ZodError" ? "VALIDATION_ERROR" :
    status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
  const message = status >= 500 ? "An unexpected server error occurred" : (err.message || "Request failed");
  if (status >= 500) console.error(JSON.stringify({ level: "error", requestId: req.requestId, message: err.message }));
  res.status(status).json({
    error: { code, message, ...(err.name === "ZodError" ? { details: err.issues.map(i => ({ path: i.path.join("."), message: i.message })) } : {}) },
    requestId: req.requestId
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: req.requestId });
}

export function parseObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value));
}
