import mongoose from "mongoose";
const schema = new mongoose.Schema({
  studentId:{type:String,required:true,index:true},
  courseId:{type:String,required:true,index:true},
  status:{type:String,enum:["active","cancelled","completed"],default:"active"},
  enrolledAt:{type:Date,default:Date.now},
  completedAt:{type:Date,default:null}
},{timestamps:true});
schema.index({studentId:1,courseId:1},{unique:true});
export default mongoose.model("Enrollment",schema);
