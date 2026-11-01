import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import Enrollment from "./model.js";
import { asyncHandler, authenticate, allowRoles, parseObjectId } from "@slp/common";
import amqp from "amqplib";
const router=Router();
let channel;

async function getJson(url, authorization) {
  let response;
  try {
    response=await fetch(url,{
      headers:authorization?{authorization}:{},
      signal:AbortSignal.timeout(3000)
    });
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",message:"Enrollment completion check failed",error:error.message}));
    throw Object.assign(new Error("Unable to verify course completion right now"),{status:503});
  }
  if(!response.ok) throw Object.assign(new Error("Unable to verify course completion right now"),{status:503});
  try {
    return await response.json();
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",message:"Enrollment completion response was invalid",error:error.message}));
    throw Object.assign(new Error("A service returned invalid course completion data"),{status:503});
  }
}

async function publish(event){
  try {
    if(!channel) {
      const conn=await amqp.connect(process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672");
      channel=await conn.createChannel();
      await channel.assertExchange("slp.events","topic",{durable:true});
    }
    channel.publish("slp.events",event.eventType,Buffer.from(JSON.stringify(event)),{persistent:true,contentType:"application/json",messageId:event.eventId});
  } catch(err) { console.error(JSON.stringify({level:"warn",message:"RabbitMQ publish failed; event not delivered",error:err.message})); }
}
router.post("/",authenticate,allowRoles("student"),asyncHandler(async(req,res)=>{
  const {courseId}=z.object({courseId:z.string().regex(/^[a-f\d]{24}$/i)}).parse(req.body);
  let response;
  try {
    response=await fetch(`${process.env.COURSE_SERVICE_URL || "http://localhost:3003"}/${courseId}`,{signal:AbortSignal.timeout(3000)});
  } catch (error) {
    console.warn(JSON.stringify({level:"warn",requestId:req.requestId,message:"Course service check failed",error:error.message}));
    return res.status(503).json({error:{code:"COURSE_SERVICE_UNAVAILABLE",message:"Unable to verify course right now"},requestId:req.requestId});
  }
  if(!response.ok) return res.status(response.status===404?404:503).json({error:{code:response.status===404?"COURSE_NOT_FOUND":"COURSE_SERVICE_UNAVAILABLE",message:response.status===404?"Course does not exist or is unpublished":"Unable to verify course right now"},requestId:req.requestId});
  const existing=await Enrollment.findOne({studentId:req.user.sub,courseId});
  if(existing && existing.status!=="cancelled") return res.status(409).json({error:{code:"ALREADY_ENROLLED",message:"An active or completed enrollment already exists"},requestId:req.requestId});
  let enrollment;
  if(existing) {
    enrollment=await Enrollment.findOneAndUpdate(
      {_id:existing._id,status:"cancelled"},
      {$set:{status:"active",enrolledAt:new Date(),completedAt:null}},
      {new:true,runValidators:true}
    );
    if(!enrollment) return res.status(409).json({error:{code:"ALREADY_ENROLLED",message:"An active or completed enrollment already exists"},requestId:req.requestId});
  } else {
    try {
      enrollment=await Enrollment.create({studentId:req.user.sub,courseId});
    } catch(error) {
      if(error?.code===11000) return res.status(409).json({error:{code:"ALREADY_ENROLLED",message:"An active or completed enrollment already exists"},requestId:req.requestId});
      throw error;
    }
  }
  await publish({eventId:randomUUID(),eventType:"EnrollmentCreated",occurredAt:new Date().toISOString(),data:{enrollmentId:enrollment.id,studentId:enrollment.studentId,courseId:enrollment.courseId}});
  res.status(201).json({enrollment});
}));
router.get("/me/summary",authenticate,asyncHandler(async(req,res)=>{
  const studentId=req.user.sub;
  const [active,completed,cancelled,total]=await Promise.all([
    Enrollment.countDocuments({studentId,status:"active"}),
    Enrollment.countDocuments({studentId,status:"completed"}),
    Enrollment.countDocuments({studentId,status:"cancelled"}),
    Enrollment.countDocuments({studentId})
  ]);
  res.json({summary:{active,completed,cancelled,total}});
}));
router.get("/me",authenticate,asyncHandler(async(req,res)=>{
  const {page,limit,status,courseId}=z.object({
    page:z.coerce.number().int().min(1).default(1),
    limit:z.coerce.number().int().min(1).max(100).default(20),
    status:z.enum(["active","completed","cancelled"]).optional(),
    courseId:z.string().regex(/^[a-f\d]{24}$/i).optional()
  }).parse(req.query);
  const filter={studentId:req.user.sub};
  if(status) filter.status=status;
  if(courseId) filter.courseId=courseId;
  const [enrollments,total]=await Promise.all([Enrollment.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Enrollment.countDocuments(filter)]);
  res.json({enrollments,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));
router.get("/:id",authenticate,asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid enrollment ID"},requestId:req.requestId});
  const enrollment=await Enrollment.findById(req.params.id);
  if(!enrollment) return res.status(404).json({error:{code:"NOT_FOUND",message:"Enrollment not found"},requestId:req.requestId});
  if(req.user.role!=="admin" && enrollment.studentId!==req.user.sub) return res.status(403).json({error:{code:"FORBIDDEN",message:"Not your enrollment"},requestId:req.requestId});
  res.json({enrollment});
}));
router.patch("/:id",authenticate,asyncHandler(async(req,res)=>{
  const {status}=z.object({status:z.enum(["cancelled","completed"])}).strict().parse(req.body);
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid enrollment ID"},requestId:req.requestId});
  const enrollment=await Enrollment.findById(req.params.id);
  if(!enrollment) return res.status(404).json({error:{code:"NOT_FOUND",message:"Enrollment not found"},requestId:req.requestId});
  if(req.user.role!=="admin" && enrollment.studentId!==req.user.sub) return res.status(403).json({error:{code:"FORBIDDEN",message:"Not your enrollment"},requestId:req.requestId});
  if(status==="completed") {
    if(req.user.role!=="student") return res.status(403).json({error:{code:"FORBIDDEN",message:"Only enrolled students can complete their course"},requestId:req.requestId});
    if(enrollment.status==="cancelled") return res.status(409).json({error:{code:"ENROLLMENT_CANCELLED",message:"Reactivate this enrollment before completing the course"},requestId:req.requestId});
    if(enrollment.status==="completed") return res.json({enrollment});

    const courseBase=process.env.COURSE_SERVICE_URL||"http://localhost:3003";
    const progressBase=process.env.PROGRESS_SERVICE_URL||"http://localhost:3006";
    const [courseResult,progressResult]=await Promise.all([
      getJson(`${courseBase}/${encodeURIComponent(enrollment.courseId)}`),
      getJson(`${progressBase}/courses/${encodeURIComponent(enrollment.courseId)}`,req.headers.authorization)
    ]);
    const moduleLessons=(courseResult?.course?.modules||[])
      .filter(module=>module?.published!==false&&!module?.archived)
      .flatMap(module=>(module.lessons||[])
        .filter(lesson=>lesson?.published!==false&&!lesson?.archived)
        .map(lesson=>String(lesson?._id)));
    const lessonIds=moduleLessons.length
      ? moduleLessons
      : (courseResult?.course?.lessons||[])
        .filter(lesson=>lesson?.published!==false&&!lesson?.archived)
        .map(lesson=>String(lesson?._id));
    const completedIds=new Set((progressResult?.progress||[])
      .filter(item=>item?.completed===true)
      .map(item=>String(item.lessonId)));
    if(!Array.isArray(progressResult?.progress) || lessonIds.length===0 || lessonIds.some(id=>!completedIds.has(id))) {
      return res.status(409).json({error:{code:"COURSE_NOT_COMPLETE",message:"Complete every published lesson before marking this course complete"},requestId:req.requestId});
    }
    enrollment.status="completed";
    enrollment.completedAt=new Date();
  } else {
    if(enrollment.status==="completed") return res.status(409).json({error:{code:"ENROLLMENT_COMPLETED",message:"A completed enrollment cannot be cancelled"},requestId:req.requestId});
    enrollment.status="cancelled";
    enrollment.completedAt=null;
  }
  await enrollment.save();
  res.json({enrollment});
}));
export default router;
