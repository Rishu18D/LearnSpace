import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema({
  title: { type:String, required:true, trim:true, maxlength:160 },
  url: { type:String, required:true, maxlength:2048 },
  type: { type:String, enum:["link","download"], default:"link" }
}, { _id:true });

const lessonSchema = new mongoose.Schema({
  title: { type:String, required:true, trim:true, maxlength:160 },
  description: { type:String, default:"", maxlength:2000 },
  learningObjectives: { type:[{ type:String, trim:true, maxlength:300 }], default:[] },
  content: { type:String, default:"", maxlength:100000 },
  contentFormat: { type:String, enum:["markdown","text"], default:"markdown" },
  estimatedMinutes: { type:Number, min:1, max:1440, default:10 },
  videoUrl: { type:String, default:"", maxlength:2048 },
  resources: { type:[resourceSchema], default:[] },
  order: { type:Number, required:true, min:0 },
  published: { type:Boolean, default:true },
  archived: { type:Boolean, default:false }
}, { _id:true, timestamps:true });

const moduleSchema = new mongoose.Schema({
  title: { type:String, required:true, trim:true, maxlength:160 },
  description: { type:String, default:"", maxlength:2000 },
  order: { type:Number, required:true, min:0 },
  published: { type:Boolean, default:true },
  archived: { type:Boolean, default:false },
  lessons: { type:[lessonSchema], default:[] }
}, { _id:true, timestamps:true });

const questionSchema = new mongoose.Schema({
  prompt: { type:String, required:true, trim:true, maxlength:2000 },
  type: { type:String, enum:["single_choice","multiple_select","true_false","fill_blank","short_answer"], required:true },
  options: { type:[{ type:String, trim:true, maxlength:500 }], default:[] },
  correctAnswers: { type:[{ type:String, trim:true, maxlength:500 }], default:[] },
  explanation: { type:String, default:"", maxlength:2000 },
  gradingRubric: { type:String, default:"", maxlength:3000 },
  points: { type:Number, min:1, max:100, default:1 },
  order: { type:Number, required:true, min:0 }
}, { _id:true });

const quizSchema = new mongoose.Schema({
  title: { type:String, required:true, trim:true, maxlength:160 },
  instructions: { type:String, default:"", maxlength:3000 },
  moduleId: { type:mongoose.Schema.Types.ObjectId, default:null },
  lessonId: { type:mongoose.Schema.Types.ObjectId, default:null },
  questions: { type:[questionSchema], default:[] },
  passingScore: { type:Number, min:0, max:100, default:70 },
  attemptLimit: { type:Number, min:1, max:20, default:3 },
  showAnswers: { type:Boolean, default:true },
  published: { type:Boolean, default:false }
}, { _id:true, timestamps:true });

const schema = new mongoose.Schema({
  title: { type:String, required:true, trim:true, minlength:3, maxlength:160 },
  slug: { type:String, required:true, unique:true, lowercase:true, index:true },
  description: { type:String, required:true, maxlength:5000 },
  learningObjectives: { type:[{ type:String, trim:true, maxlength:300 }], default:[] },
  category: { type:String, required:true, trim:true, maxlength:80 },
  tags: { type:[{ type:String, trim:true, lowercase:true, maxlength:40 }], default:[] },
  level: { type:String, enum:["beginner","intermediate","advanced"], default:"beginner" },
  prerequisites: { type:[{ type:String, trim:true, maxlength:300 }], default:[] },
  estimatedMinutes: { type:Number, min:1, max:100000, default:60 },
  thumbnailUrl: { type:String, default:"" },
  language: { type:String, trim:true, maxlength:40, default:"en" },
  instructorId: { type:String, required:true, index:true },
  lessons: { type:[lessonSchema], default:[] },
  modules: { type:[moduleSchema], default:[] },
  quizzes: { type:[quizSchema], default:[] },
  importKey: { type:String, default:undefined, unique:true, sparse:true, maxlength:160 },
  published: { type:Boolean, default:false },
  archived: { type:Boolean, default:false }
}, { timestamps:true });

schema.index({ published:1, category:1, level:1 });
export default mongoose.model("Course", schema);
