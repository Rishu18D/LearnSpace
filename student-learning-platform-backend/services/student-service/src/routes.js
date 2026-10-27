import { Router } from "express";
import { z } from "zod";
import Student from "./model.js";
import { asyncHandler, authenticate, allowRoles, parseObjectId } from "@slp/common";
const router = Router();
const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal("")),
  bio: z.string().max(500).optional()
}).strict();

router.post("/", authenticate, asyncHandler(async (req, res) => {
  const data = z.object({ fullName: z.string().trim().min(2).max(100).optional() }).parse(req.body);
  const doc = await Student.findOneAndUpdate(
    { userId: req.user.sub },
    { $setOnInsert: { userId: req.user.sub, email: req.user.email, fullName: data.fullName || req.user.email.split("@")[0] } },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({ student: doc });
}));
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const student = await Student.findOne({ userId: req.user.sub });
  if (!student) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Create your profile first" }, requestId: req.requestId });
  res.json({ student });
}));
router.patch("/me", authenticate, asyncHandler(async (req, res) => {
  const data = profileSchema.parse(req.body);
  const student = await Student.findOneAndUpdate({ userId: req.user.sub }, { $set: data }, { new: true, runValidators: true });
  if (!student) return res.status(404).json({ error: { code: "PROFILE_NOT_FOUND", message: "Create your profile first" }, requestId: req.requestId });
  res.json({ student });
}));
router.get("/", authenticate, allowRoles("admin"), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [students,total] = await Promise.all([Student.find().sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Student.countDocuments()]);
  res.json({ students, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
}));
router.get("/:id", authenticate, asyncHandler(async (req, res) => {
  if (!parseObjectId(req.params.id)) return res.status(400).json({ error: { code: "INVALID_ID", message: "Invalid student ID" }, requestId: req.requestId });
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" }, requestId: req.requestId });
  if (req.user.role !== "admin" && student.userId !== req.user.sub) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot view this profile" }, requestId: req.requestId });
  res.json({ student });
}));
export default router;
