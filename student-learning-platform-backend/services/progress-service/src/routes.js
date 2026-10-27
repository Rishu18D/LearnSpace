import { Router } from "express";
import { z } from "zod";
import Progress from "./model.js";
import { asyncHandler, authenticate, allowRoles, parseObjectId } from "@slp/common";

const router=Router();

async function verifyLessonAccess(req,courseId,lessonId) {
  let enrollmentResponse;
  try {
    enrollmentResponse=await fetch(`${process.env.ENROLLMENT_SERVICE_URL||"http://localhost:3004"}/me?courseId=${courseId}&limit=1`,{
      headers:{authorization:req.headers.authorization},
      signal:AbortSignal.timeout(3000)
    });
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",requestId:req.requestId,message:"Enrollment service check failed",error:error.message}));
    return {status:503,code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"};
  }
  if(!enrollmentResponse.ok) return {status:503,code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"};
  let enrollmentBody;
  try {
    enrollmentBody=await enrollmentResponse.json();
  } catch {
    return {status:503,code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"};
  }
  if(!Array.isArray(enrollmentBody?.enrollments)) return {status:503,code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"};
  if(!enrollmentBody.enrollments.some(item=>item?.courseId===courseId&&item.status==="active")) {
    return {status:403,code:"NOT_ENROLLED",message:"Active enrollment required"};
  }

  let courseResponse;
  try {
    courseResponse=await fetch(`${process.env.COURSE_SERVICE_URL||"http://localhost:3003"}/${courseId}`,{signal:AbortSignal.timeout(3000)});
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",requestId:req.requestId,message:"Course service check failed",error:error.message}));
    return {status:503,code:"COURSE_CHECK_FAILED",message:"Unable to verify course lesson"};
  }
  if(courseResponse.status===404) return {status:404,code:"COURSE_NOT_FOUND",message:"Published course not found"};
  if(!courseResponse.ok) return {status:503,code:"COURSE_CHECK_FAILED",message:"Unable to verify course lesson"};
  let courseBody;
  try {
    courseBody=await courseResponse.json();
  } catch {
    return {status:503,code:"COURSE_CHECK_FAILED",message:"Unable to verify course lesson"};
  }
  if(!Array.isArray(courseBody?.course?.lessons)) return {status:503,code:"COURSE_CHECK_FAILED",message:"Unable to verify course lesson"};
  if(!courseBody.course.lessons.some(item=>String(item?._id)===lessonId)) {
    return {status:404,code:"LESSON_NOT_FOUND",message:"Published lesson does not belong to this course"};
  }
  return null;
}

router.get("/me",authenticate,asyncHandler(async(req,res)=>{
  const progress=await Progress.find({studentId:req.user.sub}).sort({updatedAt:-1});
  const completed=progress.filter(item=>item.completed);
  const courses=new Set(completed.map(item=>item.courseId));
  res.json({progress,completedLessons:completed.length,coursesWithProgress:courses.size});
}));

router.get("/courses/:courseId",authenticate,asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.courseId)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid course ID"},requestId:req.requestId});
  const filter={courseId:req.params.courseId};
  if(req.user.role!=="admin") filter.studentId=req.user.sub;
  const progress=await Progress.find(filter);
  res.json({progress,completedLessons:progress.filter(item=>item.completed).length});
}));

router.post("/courses/:courseId/lessons/:lessonId/access",authenticate,allowRoles("student"),asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.courseId)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid course ID"},requestId:req.requestId});
  z.object({}).strict().parse(req.body);
  const lessonId=String(req.params.lessonId);
  if(!parseObjectId(lessonId)) return res.status(400).json({error:{code:"INVALID_LESSON_ID",message:"Invalid lesson ID"},requestId:req.requestId});
  const failure=await verifyLessonAccess(req,req.params.courseId,lessonId);
  if(failure) return res.status(failure.status).json({error:{code:failure.code,message:failure.message},requestId:req.requestId});
  const now=new Date();
  const progress=await Progress.findOneAndUpdate(
    {studentId:req.user.sub,courseId:req.params.courseId,lessonId},
    {$set:{lastAccessedAt:now},$setOnInsert:{completed:false,completedAt:null}},
    {new:true,upsert:true,runValidators:true}
  );
  res.json({progress});
}));

router.post("/lessons/:lessonId/complete",authenticate,allowRoles("student"),asyncHandler(async(req,res)=>{
  const data=z.object({courseId:z.string().regex(/^[a-f\d]{24}$/i)}).strict().parse(req.body);
  const lessonId=String(req.params.lessonId);
  if(!parseObjectId(lessonId)) return res.status(400).json({error:{code:"INVALID_LESSON_ID",message:"Invalid lesson ID"},requestId:req.requestId});
  const failure=await verifyLessonAccess(req,data.courseId,lessonId);
  if(failure) return res.status(failure.status).json({error:{code:failure.code,message:failure.message},requestId:req.requestId});
  const filter={studentId:req.user.sub,courseId:data.courseId,lessonId};
  const existing=await Progress.findOne(filter);
  const now=new Date();
  let progress;
  if(existing) {
    existing.completed=true;
    existing.completedAt ||= now;
    existing.lastAccessedAt=now;
    progress=await existing.save();
  } else {
    progress=await Progress.findOneAndUpdate(filter,{$set:{completed:true,completedAt:now,lastAccessedAt:now}},{new:true,upsert:true,runValidators:true});
  }
  res.status(200).json({progress});
}));

export default router;
