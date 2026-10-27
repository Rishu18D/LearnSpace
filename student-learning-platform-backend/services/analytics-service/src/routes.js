import { Router } from "express";
import { asyncHandler, authenticate, allowRoles } from "@slp/common";
const router=Router();
async function getJson(base,path,token){
  let response;
  try {
    response=await fetch(`${base}${path}`,{headers:token?{authorization:token}:{},signal:AbortSignal.timeout(3000)});
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",message:"Analytics upstream request failed",error:error.message}));
    throw Object.assign(new Error("An upstream service is unavailable"),{status:503});
  }
  if(!response.ok) throw Object.assign(new Error("An upstream service did not respond successfully"),{status:503});
  try {
    return await response.json();
  } catch(error) {
    console.warn(JSON.stringify({level:"warn",message:"Analytics upstream response was invalid",error:error.message}));
    throw Object.assign(new Error("An upstream service returned an invalid response"),{status:503});
  }
}
router.get("/student",authenticate,asyncHandler(async(req,res)=>{
  const [enrollments,progress,notifications]=await Promise.all([
    getJson(process.env.ENROLLMENT_SERVICE_URL||"http://localhost:3004","/me",req.headers.authorization),
    getJson(process.env.PROGRESS_SERVICE_URL||"http://localhost:3006","/me",req.headers.authorization),
    getJson(process.env.NOTIFICATION_SERVICE_URL||"http://localhost:3005","/",req.headers.authorization)
  ]);
  if(!Array.isArray(enrollments.enrollments)||!Number.isFinite(progress.completedLessons)||!Number.isFinite(notifications.unread)) {
    throw Object.assign(new Error("An upstream service returned an invalid response"),{status:503});
  }
  res.json({summary:{activeEnrollments:enrollments.enrollments.filter(e=>e?.status==="active").length,completedLessons:progress.completedLessons,unreadNotifications:notifications.unread}});
}));
router.get("/instructor",authenticate,allowRoles("instructor","admin"),asyncHandler(async(req,res)=>{
  const courses=await getJson(process.env.COURSE_SERVICE_URL||"http://localhost:3003","/manage/mine",req.headers.authorization);
  if(!Array.isArray(courses.courses)) throw Object.assign(new Error("The course service returned an invalid response"),{status:503});
  res.json({summary:{coursesManaged:courses.courses.length,publishedCourses:courses.courses.filter(c=>c?.published).length}});
}));
router.get("/admin",authenticate,allowRoles("admin"),asyncHandler(async(req,res)=>{
  res.json({message:"Admin aggregate metrics are not yet materialized. Connect event-fed read models before presenting platform-wide totals."});
}));
export default router;
