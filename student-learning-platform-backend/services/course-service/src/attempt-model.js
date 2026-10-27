import mongoose from "mongoose";

const answerSchema = new mongoose.Schema({
  questionId: { type:String, required:true },
  answer: { type:mongoose.Schema.Types.Mixed, default:null },
  pointsEarned: { type:Number, min:0, default:0 },
  reviewed: { type:Boolean, default:false },
  feedback: { type:String, default:"", maxlength:2000 }
}, { _id:false });

const schema = new mongoose.Schema({
  studentId: { type:String, required:true, index:true },
  courseId: { type:String, required:true, index:true },
  quizId: { type:String, required:true, index:true },
  attemptNumber: { type:Number, required:true, min:1 },
  answers: { type:[answerSchema], default:[] },
  score: { type:Number, min:0, default:0 },
  maxScore: { type:Number, min:0, required:true },
  status: { type:String, enum:["submitted","pending_review","reviewed"], default:"submitted" },
  submittedAt: { type:Date, default:Date.now }
}, { timestamps:true });

schema.index({ studentId:1, courseId:1, quizId:1, createdAt:-1 });
schema.index({ studentId:1, courseId:1, quizId:1, attemptNumber:1 }, { unique:true });
export default mongoose.model("AssessmentAttempt", schema);
