import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { trustedClientIp } from "@slp/common";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import User from "./model.js";
import RefreshSession from "./session-model.js";
import { asyncHandler, createToken, authenticate } from "@slp/common";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => ipKeyGenerator(trustedClientIp(req))
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => ipKeyGenerator(trustedClientIp(req))
});
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes"
  }),
  role: z.enum(["student", "instructor"]).default("student")
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes"
  })
});
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const refreshCookieName = "slp_refresh";

function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function isDuplicateEmailError(error) {
  return error?.code === 11000 && (error.keyPattern?.email === 1 || error.keyValue?.email !== undefined);
}

function readRefreshCookie(req) {
  for (const cookie of (req.headers.cookie || "").split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== refreshCookieName) continue;
    return cookie.slice(separator + 1).trim();
  }
  return null;
}

async function createRefreshSession(user) {
  const token = randomBytes(32).toString("base64url");
  await RefreshSession.create({
    userId: user.id,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + refreshLifetimeMs)
  });
  return token;
}

function setRefreshCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append("Set-Cookie", `${refreshCookieName}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

function clearRefreshCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append("Set-Cookie", `${refreshCookieName}=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

router.post("/register", registerLimiter, asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const email = data.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) return res.status(409).json({ error: { code: "EMAIL_EXISTS", message: "An account with this email already exists" }, requestId: req.requestId });
  const passwordHash = await bcrypt.hash(data.password, 12);
  let user;
  try {
    user = await User.create({ name: data.name, email, passwordHash, role: data.role });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      return res.status(409).json({ error: { code: "EMAIL_EXISTS", message: "An account with this email already exists" }, requestId: req.requestId });
    }
    throw error;
  }
  const token = createToken(user);
  setRefreshCookie(res, await createRefreshSession(user));
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: token, tokenType: "Bearer", expiresIn: 900 });
}));

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.active || !(await bcrypt.compare(data.password, user.passwordHash))) {
    return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" }, requestId: req.requestId });
  }
  setRefreshCookie(res, await createRefreshSession(user));
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: createToken(user), tokenType: "Bearer", expiresIn: 900 });
}));

router.post("/refresh", asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (!token) return res.status(401).json({ error: { code: "REFRESH_REQUIRED", message: "Sign in to continue" }, requestId: req.requestId });

  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hashRefreshToken(token), revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!session) return res.status(401).json({ error: { code: "INVALID_REFRESH_TOKEN", message: "Sign in to continue" }, requestId: req.requestId });

  const user = await User.findById(session.userId);
  if (!user || !user.active) return res.status(401).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "Account is unavailable" }, requestId: req.requestId });

  setRefreshCookie(res, await createRefreshSession(user));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken: createToken(user),
    tokenType: "Bearer",
    expiresIn: 900
  });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  const token = readRefreshCookie(req);
  if (token) {
    await RefreshSession.updateOne(
      { tokenHash: hashRefreshToken(token), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  clearRefreshCookie(res);
  res.status(200).json({ message: "Logged out" });
}));
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user || !user.active) return res.status(401).json({ error: { code: "ACCOUNT_UNAVAILABLE", message: "Account is unavailable" }, requestId: req.requestId });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));
export default router;
