import mongoose from "mongoose";
const schema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  avatarUrl: { type: String, default: "" },
  bio: { type: String, maxlength: 500, default: "" }
}, { timestamps: true });
export default mongoose.model("Student", schema);
