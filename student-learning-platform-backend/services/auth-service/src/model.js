import mongoose from "mongoose";
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["student", "instructor", "admin"], default: "student" },
  active: { type: Boolean, default: true }
}, { timestamps: true });
export default mongoose.model("User", userSchema);
