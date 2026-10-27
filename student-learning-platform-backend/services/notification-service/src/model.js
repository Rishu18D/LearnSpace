import mongoose from "mongoose";
const schema=new mongoose.Schema({
  userId:{type:String,required:true,index:true},
  type:{type:String,required:true},
  title:{type:String,required:true,maxlength:160},
  message:{type:String,required:true,maxlength:1000},
  data:{type:mongoose.Schema.Types.Mixed,default:{}},
  readAt:{type:Date,default:null},
  eventId:{type:String,unique:true,sparse:true}
},{timestamps:true});
schema.index({userId:1,createdAt:-1});
export default mongoose.model("Notification",schema);
