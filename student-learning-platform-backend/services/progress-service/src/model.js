import mongoose from "mongoose";
const schema=new mongoose.Schema({
  studentId:{type:String,required:true,index:true},
  courseId:{type:String,required:true,index:true},
  lessonId:{type:String,required:true},
  completed:{type:Boolean,default:false},
  completedAt:{type:Date,default:null},
  lastAccessedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({studentId:1,courseId:1,lessonId:1},{unique:true});
export default mongoose.model("LessonProgress",schema);
