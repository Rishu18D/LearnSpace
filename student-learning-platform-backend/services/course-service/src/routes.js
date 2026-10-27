import { randomUUID } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import Course from "./model.js";
import AssessmentAttempt from "./attempt-model.js";
import { courseCache } from "./cache.js";
import { asyncHandler, authenticate, optionalAuthenticate, allowRoles, parseObjectId } from "@slp/common";

const router = Router();
const safeUrl = z.string().url().max(2048).refine(value => ["http:", "https:"].includes(new URL(value).protocol), "URL must use HTTP or HTTPS");
const objectiveList = z.array(z.string().trim().min(1).max(300)).max(30);
const resource = z.object({
  title:z.string().trim().min(1).max(160),
  url:safeUrl,
  type:z.enum(["link","download"]).optional()
}).strict();
const lesson = z.object({
  _id:z.string().regex(/^[a-f\d]{24}$/i).optional(),
  title:z.string().trim().min(1).max(160),
  description:z.string().max(2000).optional(),
  learningObjectives:objectiveList.optional(),
  content:z.string().max(100000).optional(),
  contentFormat:z.enum(["markdown","text"]).optional(),
  estimatedMinutes:z.number().int().min(1).max(1440).optional(),
  videoUrl:safeUrl.optional().or(z.literal("")),
  resources:z.array(resource).max(50).optional(),
  order:z.number().int().min(0),
  published:z.boolean().optional(),
  archived:z.boolean().optional()
}).strict();
const moduleInput = z.object({
  _id:z.string().regex(/^[a-f\d]{24}$/i).optional(),
  title:z.string().trim().min(1).max(160),
  description:z.string().max(2000).optional(),
  order:z.number().int().min(0),
  published:z.boolean().optional(),
  archived:z.boolean().optional(),
  lessons:z.array(lesson).max(200).default([])
}).strict();
const question = z.object({
  _id:z.string().regex(/^[a-f\d]{24}$/i).optional(),
  prompt:z.string().trim().min(1).max(2000),
  type:z.enum(["single_choice","multiple_select","true_false","fill_blank","short_answer"]),
  options:z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  correctAnswers:z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  explanation:z.string().max(2000).optional(),
  gradingRubric:z.string().max(3000).optional(),
  points:z.number().int().min(1).max(100).default(1),
  order:z.number().int().min(0)
}).strict().superRefine((value, context) => {
  const options=value.options || [];
  if (new Set(options).size!==options.length) context.addIssue({code:z.ZodIssueCode.custom,path:["options"],message:"Options must be unique."});
  if (value.type==="single_choice" && (options.length<2 || value.correctAnswers.length!==1 || !options.includes(value.correctAnswers[0]))) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["correctAnswers"],message:"Single-choice questions need one correct answer that matches an option."});
  }
  if (value.type==="multiple_select" && (options.length<2 || !value.correctAnswers.length || value.correctAnswers.some(answer=>!options.includes(answer)))) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["correctAnswers"],message:"Select at least one correct option from the available choices."});
  }
  if (value.type==="true_false" && (value.correctAnswers.length!==1 || !["true","false"].includes(value.correctAnswers[0].toLowerCase()))) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["correctAnswers"],message:"True/false questions must have one correct answer: true or false."});
  }
  if (value.type==="fill_blank" && !value.correctAnswers.length) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["correctAnswers"],message:"Fill-in-the-blank questions need at least one accepted answer."});
  }
  if (value.type==="short_answer" && !value.gradingRubric?.trim()) {
    context.addIssue({code:z.ZodIssueCode.custom,path:["gradingRubric"],message:"Short-answer questions require an instructor grading rubric."});
  }
});
const quiz = z.object({
  _id:z.string().regex(/^[a-f\d]{24}$/i).optional(),
  title:z.string().trim().min(1).max(160),
  instructions:z.string().max(3000).optional(),
  moduleId:z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  lessonId:z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  questions:z.array(question).max(100).default([]),
  passingScore:z.number().min(0).max(100).optional(),
  attemptLimit:z.number().int().min(1).max(20).optional(),
  showAnswers:z.boolean().optional(),
  published:z.boolean().optional(),
  archived:z.boolean().optional()
}).strict().superRefine((value, context) => {
  if(value.published && !value.questions.length) context.addIssue({code:z.ZodIssueCode.custom,path:["questions"],message:"A published quiz must contain at least one question."});
});
const courseInput = z.object({
  title:z.string().trim().min(3).max(160),
  description:z.string().trim().min(1).max(5000),
  learningObjectives:objectiveList.optional(),
  category:z.string().trim().min(1).max(80),
  tags:z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  level:z.enum(["beginner","intermediate","advanced"]).optional(),
  prerequisites:z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  estimatedMinutes:z.number().int().min(1).max(100000).optional(),
  thumbnailUrl:safeUrl.optional().or(z.literal("")),
  language:z.string().trim().min(2).max(40).optional(),
  lessons:z.array(lesson).max(200).optional(),
  modules:z.array(moduleInput).max(100).optional(),
  quizzes:z.array(quiz).max(100).optional(),
  published:z.boolean().optional()
}).strict();
const importedCourse = courseInput.extend({ importKey:z.string().trim().min(1).max(160).optional() });
const courseUpdate = courseInput.partial().extend({
  archived:z.boolean().optional(),
  migrateLegacyLessons:z.boolean().optional()
}).strict();
const slugify = value => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,150);
const object = value => value?.toObject ? value.toObject() : value;

function courseView(value, exposeAnswers = false) {
  const course = object(value);
  const { importKey,...courseData }=course;
  const moduleLessons = (course.modules || []).flatMap(module => (module.lessons || []).map(item => ({
    ...item,
    moduleId:module._id,
    moduleTitle:module.title
  })));
  const output = {
    ...courseData,
    lessons:moduleLessons.length ? [...moduleLessons, ...(course.lessons || [])] : course.lessons || []
  };
  if (!exposeAnswers) {
    output.quizzes = (course.quizzes || []).filter(item => item.published).map(item => ({
      ...item,
      questions:(item.questions || []).map(({ correctAnswers, gradingRubric, ...safeQuestion }) => safeQuestion)
    }));
  }
  delete output.__v;
  return output;
}

function publicationIssues(data) {
  const issues = [];
  if (!(data.learningObjectives || []).length) issues.push("Add at least one learning objective before publishing.");
  const modules = (data.modules || []).filter(item => !item.archived);
  if (modules.length) {
    const lessons = modules
      .filter(item => item.published !== false)
      .flatMap(item => item.lessons || [])
      .filter(item => item.published !== false && !item.archived);
    if (!lessons.length) issues.push("Add at least one published lesson to a published module.");
  } else if (!(data.lessons || []).some(item => item.published !== false && !item.archived)) {
    issues.push("Add at least one published lesson before publishing.");
  }
  return issues;
}

function reconcileModules(inputModules, existing, migrateLegacyLessons = false) {
  const currentModules=existing.modules || [];
  const moduleIds=inputModules.map(item=>item._id).filter(Boolean);
  const lessonIds=inputModules.flatMap(item=>item.lessons || []).map(item=>item._id).filter(Boolean);
  const currentModuleIds=new Set(currentModules.map(item=>String(item._id)));
  const currentLessonIds=new Set([
    ...currentModules.flatMap(item=>(item.lessons || []).map(lessonItem=>String(lessonItem._id))),
    ...(existing.lessons || []).map(item=>String(item._id))
  ]);
  if(new Set(moduleIds).size!==moduleIds.length || new Set(lessonIds).size!==lessonIds.length) {
    return { error:"Module and lesson IDs must be unique within a course" };
  }
  if(moduleIds.some(id=>!currentModuleIds.has(id)) || lessonIds.some(id=>!currentLessonIds.has(id))) {
    return { error:"Module or lesson ID does not belong to this course" };
  }
  const incomingModuleIds=new Set(moduleIds);
  const incomingLessonIds=new Set(lessonIds);
  const modules=inputModules.map(item=>{
    const current=currentModules.find(currentItem=>String(currentItem._id)===item._id);
    if(!current) return item;
    const archivedLessons=(current.lessons || [])
      .filter(lessonItem=>!incomingLessonIds.has(String(lessonItem._id)))
      .map(lessonItem=>({...object(lessonItem),published:false,archived:true}));
    return { ...item, archived:false, lessons:[...item.lessons,...archivedLessons] };
  });
  const removedModules=currentModules
    .filter(item=>!incomingModuleIds.has(String(item._id)))
    .map(item=>({
      ...object(item),
      published:false,
      archived:true,
      lessons:(item.lessons || [])
        .filter(lessonItem=>!incomingLessonIds.has(String(lessonItem._id)))
        .map(lessonItem=>({...object(lessonItem),published:false,archived:true}))
    }));
  const result={ modules:[...modules,...removedModules] };
  if(migrateLegacyLessons) {
    result.lessons=(existing.lessons || [])
      .filter(item=>!incomingLessonIds.has(String(item._id)))
      .map(item=>({...object(item),published:false,archived:true}));
  }
  return result;
}

async function courseForRequest(req, { requirePublished = false } = {}) {
  if (!parseObjectId(req.params.id)) return null;
  const course = await Course.findById(req.params.id);
  if (!course) return null;
  const owner = req.user?.sub === course.instructorId || req.user?.role === "admin";
  if (requirePublished && !course.published) return null;
  if (!course.published && !owner) return null;
  return course;
}

async function enrollmentForCourse(req, courseId) {
  let response;
  try {
    response = await fetch(`${process.env.ENROLLMENT_SERVICE_URL || "http://localhost:3004"}/me?courseId=${courseId}&limit=1`, {
      headers:{ authorization:req.headers.authorization },
      signal:AbortSignal.timeout(3000)
    });
  } catch (error) {
    console.warn(JSON.stringify({ level:"warn", requestId:req.requestId, message:"Enrollment service check failed", error:error.message }));
    return { unavailable:true, enrolled:false };
  }
  if (!response.ok) return { unavailable:true, enrolled:false };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { unavailable:true, enrolled:false };
  }
  return { unavailable:false, enrolled:Array.isArray(payload?.enrollments) && payload.enrollments.some(item => item.courseId === courseId && item.status === "active") };
}

function publicCourse(course) {
  const safe = courseView(course);
  safe.modules = (safe.modules || []).filter(item => item.published !== false && !item.archived).map(item => ({
    ...item,
    lessons:(item.lessons || []).filter(lessonItem => lessonItem.published !== false && !lessonItem.archived)
  }));
  safe.lessons = safe.lessons.filter(item => item.moduleId ? safe.modules.some(module => String(module._id) === String(item.moduleId)) : item.published !== false && !item.archived);
  safe.quizzes = (safe.quizzes || []).filter(item => item.published && !item.archived);
  safe.archived = false;
  return safe;
}

function gradeQuestion(questionItem, answer) {
  if (questionItem.type === "short_answer") return { points:0, reviewed:false };
  const normalize = value => String(value ?? "").trim().toLocaleLowerCase();
  const expected = (questionItem.correctAnswers || []).map(normalize).sort();
  const actual = (Array.isArray(answer) ? answer : [answer]).map(normalize).filter(Boolean).sort();
  const isCorrect = expected.length === actual.length && expected.every((value, index) => value === actual[index]);
  return { points:isCorrect ? questionItem.points : 0, reviewed:true };
}

function safeAttempt(attempt) {
  const value = object(attempt);
  return { ...value, answers:(value.answers || []).map(({ questionId, answer, pointsEarned, reviewed, feedback }) => ({ questionId, answer, pointsEarned, reviewed, feedback })) };
}

router.get("/", asyncHandler(async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1), limit=Math.min(100,Math.max(1,Number(req.query.limit)||12));
  const sortBy=["createdAt","title","estimatedMinutes"].includes(req.query.sortBy)?req.query.sortBy:"createdAt";
  const direction=req.query.sortOrder==="asc"?1:-1;
  const cacheParameters={
    page,
    limit,
    category:req.query.category?String(req.query.category).slice(0,80):"",
    level:req.query.level&&["beginner","intermediate","advanced"].includes(req.query.level)?req.query.level:"",
    tag:req.query.tag?String(req.query.tag).slice(0,40).toLowerCase():"",
    search:req.query.search?String(req.query.search).slice(0,80):"",
    sortBy,
    direction
  };
  const cacheVersion=await courseCache.version();
  const cacheKey=cacheVersion===null?null:courseCache.key(cacheVersion,"catalog",cacheParameters);
  if(cacheKey) {
    const cached=await courseCache.get(cacheKey);
    if(cached!==undefined) return res.json(cached);
  }
  const filter={published:true,archived:{$ne:true}};
  if(req.query.category) filter.category=String(req.query.category).slice(0,80);
  if(req.query.level && ["beginner","intermediate","advanced"].includes(req.query.level)) filter.level=req.query.level;
  if(req.query.tag) filter.tags=String(req.query.tag).slice(0,40).toLowerCase();
  if(req.query.search) {
    const pattern=String(req.query.search).slice(0,80).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    filter.$or=[{title:{$regex:pattern,$options:"i"}},{description:{$regex:pattern,$options:"i"}},{tags:{$regex:pattern,$options:"i"}}];
  }
  const [courses,total]=await Promise.all([
    Course.find(filter).sort({[sortBy]:direction,_id:1}).skip((page-1)*limit).limit(limit),
    Course.countDocuments(filter)
  ]);
  const response={courses:courses.map(publicCourse),pagination:{page,limit,total,pages:Math.ceil(total/limit)}};
  if(cacheKey) await courseCache.set(cacheKey,response);
  res.json(response);
}));

router.get("/manage/mine", authenticate, allowRoles("instructor","admin"), asyncHandler(async (req,res) => {
  const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));
  const filter=req.user.role==="admin"?{}:{instructorId:req.user.sub};
  if(req.query.status==="published") filter.published=true;
  if(req.query.status==="draft") filter.published=false;
  if(req.query.status==="archived") filter.archived=true;
  else if(req.query.status!=="all") filter.archived={$ne:true};
  if(req.query.search) filter.title={$regex:String(req.query.search).slice(0,80).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),$options:"i"};
  const [courses,total]=await Promise.all([
    Course.find(filter).sort({updatedAt:-1}).skip((page-1)*limit).limit(limit),
    Course.countDocuments(filter)
  ]);
  res.json({courses:courses.map(course => courseView(course,true)),pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}));

router.post("/manage/import", authenticate, allowRoles("admin"), asyncHandler(async (req,res) => {
  const input=z.object({ dryRun:z.boolean().optional(), courses:z.array(z.unknown()).min(1).max(100) }).strict().parse(req.body);
  const validated=[];
  const errors=[];
  for (const [index,raw] of input.courses.entries()) {
    const parsed=importedCourse.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ course:index+1, path:issue.path.join("."), message:issue.message });
      continue;
    }
    const key=parsed.data.importKey;
    const duplicateInFile=key && validated.some(item => item.importKey === key);
    const duplicateInDatabase=key && await Course.exists({ importKey:key });
    if (duplicateInFile || duplicateInDatabase) {
      errors.push({ course:index+1, path:"importKey", message:duplicateInFile ? "Duplicate import key in this file." : "This import key already exists; existing courses are never overwritten." });
      continue;
    }
    if (parsed.data.published) errors.push({ course:index+1, path:"published", message:"Imported courses are always created as drafts; publish them after review." });
    validated.push(parsed.data);
  }
  if (input.dryRun || errors.length) {
    return res.status(errors.length ? 422 : 200).json({ dryRun:input.dryRun === true, valid:validated.length, imported:0, errors });
  }
  const created=[];
  try {
    for (const item of validated) {
      const { importKey, ...data }=item;
      const course=await Course.create({
        ...data,
        slug:`${slugify(data.title)}-${randomUUID().slice(0,8)}`,
        instructorId:req.user.sub,
        published:false,
        ...(importKey ? { importKey } : {})
      });
      created.push(course._id);
    }
  } catch (error) {
    if (created.length) await Course.deleteMany({ _id:{ $in:created }, instructorId:req.user.sub });
    throw error;
  }
  console.info(JSON.stringify({ level:"info", requestId:req.requestId, event:"course.import", actorId:req.user.sub, created:created.length }));
  res.status(201).json({ dryRun:false, valid:validated.length, imported:created.length, errors:[], courseIds:created.map(String) });
}));

router.post("/", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  const data=courseInput.parse(req.body);
  const course=await Course.create({...data,slug:`${slugify(data.title)}-${randomUUID().slice(0,8)}`,instructorId:req.user.sub,published:false});
  res.status(201).json({course:courseView(course,true)});
}));

router.post("/:id/duplicate", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  const source=await courseForRequest(req);
  if(!source) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  const data=object(source);
  delete data._id; delete data.id; delete data.createdAt; delete data.updatedAt; delete data.__v; delete data.importKey;
  const moduleIds=new Map();
  const lessonIds=new Map();
  for(const module of data.modules||[]) {
    moduleIds.set(String(module._id),new mongoose.Types.ObjectId());
    for(const lessonItem of module.lessons||[]) lessonIds.set(String(lessonItem._id),new mongoose.Types.ObjectId());
  }
  const course=await Course.create({
    ...data,
    title:`${data.title} (copy)`,
    slug:`${slugify(data.title)}-${randomUUID().slice(0,8)}`,
    instructorId:req.user.sub,
    published:false,
    archived:false,
    modules:(data.modules||[]).map(item=>({
      ...item,_id:moduleIds.get(String(item._id)),
      lessons:(item.lessons||[]).map(lessonItem=>({...lessonItem,_id:lessonIds.get(String(lessonItem._id))}))
    })),
    lessons:(data.lessons||[]).map(item=>({...item,_id:new mongoose.Types.ObjectId()})),
    quizzes:(data.quizzes||[]).map(item=>({
      ...item,_id:new mongoose.Types.ObjectId(),
      moduleId:item.moduleId?moduleIds.get(String(item.moduleId))||null:null,
      lessonId:item.lessonId?lessonIds.get(String(item.lessonId))||null:null,
      questions:(item.questions||[]).map(questionItem=>({...questionItem,_id:new mongoose.Types.ObjectId()}))
    }))
  });
  res.status(201).json({course:courseView(course,true)});
}));

router.post("/:id/quizzes/:quizId/attempts", authenticate, allowRoles("student"), asyncHandler(async(req,res)=>{
  const course=await courseForRequest(req,{requirePublished:true});
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Published course not found"},requestId:req.requestId});
  const quizItem=course.quizzes.id(req.params.quizId);
  if(!quizItem || !quizItem.published) return res.status(404).json({error:{code:"NOT_FOUND",message:"Published quiz not found"},requestId:req.requestId});
  const enrollment=await enrollmentForCourse(req,String(course._id));
  if(enrollment.unavailable) return res.status(503).json({error:{code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"},requestId:req.requestId});
  if(!enrollment.enrolled) return res.status(403).json({error:{code:"NOT_ENROLLED",message:"Active enrollment is required"},requestId:req.requestId});
  const body=z.object({answers:z.record(z.union([z.string().max(5000),z.array(z.string().max(500)).max(20)]))}).strict().parse(req.body);
  const questions=quizItem.questions;
  if(!questions.length) return res.status(409).json({error:{code:"QUIZ_EMPTY",message:"This quiz has no questions"},requestId:req.requestId});
  const questionIds=new Set(questions.map(item=>String(item._id)));
  if(Object.keys(body.answers).some(id=>!questionIds.has(id))) return res.status(400).json({error:{code:"INVALID_ANSWER",message:"An answer references an unknown quiz question"},requestId:req.requestId});
  for(const item of questions) {
    const answer=body.answers[String(item._id)];
    if(answer===undefined) continue;
    if(item.type==="multiple_select") {
      if(!Array.isArray(answer) || answer.some(option=>!item.options.includes(option))) {
        return res.status(400).json({error:{code:"INVALID_ANSWER",message:"Select answers must be a list of available options"},requestId:req.requestId});
      }
    } else if(typeof answer!=="string" || item.type==="single_choice" && answer!=="" && !item.options.includes(answer) || item.type==="true_false" && answer!=="" && !["true","false"].includes(answer.toLowerCase())) {
      return res.status(400).json({error:{code:"INVALID_ANSWER",message:"Answer format does not match the question"},requestId:req.requestId});
    }
  }
  const attempts=await AssessmentAttempt.countDocuments({studentId:req.user.sub,courseId:String(course._id),quizId:String(quizItem._id)});
  if(attempts>=quizItem.attemptLimit) return res.status(409).json({error:{code:"ATTEMPT_LIMIT_REACHED",message:"No quiz attempts remain"},requestId:req.requestId});
  let score=0,maxScore=0,needsReview=false;
  const savedAnswers=questions.map(item=>{
    maxScore+=item.points;
    const answer=body.answers[String(item._id)] ?? null;
    const grade=gradeQuestion(item,answer);
    score+=grade.points;
    if(!grade.reviewed) needsReview=true;
    return { questionId:String(item._id),answer,pointsEarned:grade.points,reviewed:grade.reviewed };
  });
  let attempt;
  try {
    attempt=await AssessmentAttempt.create({
      studentId:req.user.sub,courseId:String(course._id),quizId:String(quizItem._id),
      attemptNumber:attempts+1,answers:savedAnswers,score,maxScore,status:needsReview?"pending_review":"submitted"
    });
  } catch(error) {
    if(error?.code===11000) return res.status(409).json({error:{code:"ATTEMPT_CONFLICT",message:"Another quiz attempt was submitted at the same time. Refresh your attempts and try again."},requestId:req.requestId});
    throw error;
  }
  const questionResults=questions.map(item=>{
    const result=gradeQuestion(item,body.answers[String(item._id)]);
    return {
      questionId:String(item._id),
      correct:item.type==="short_answer"?null:result.points>0,
      ...(quizItem.showAnswers?{explanation:item.explanation}: {}),
      ...(quizItem.showAnswers?{correctAnswers:item.correctAnswers}: {})
    };
  });
  res.status(201).json({ attempt:safeAttempt(attempt), percentage:maxScore?Math.round(score/maxScore*100):0, passed:!needsReview && (score/maxScore*100)>=quizItem.passingScore, needsReview, questionResults });
}));

router.get("/:id/quizzes/:quizId/attempts/me", authenticate, allowRoles("student"), asyncHandler(async(req,res)=>{
  const course=await courseForRequest(req,{requirePublished:true});
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Published course not found"},requestId:req.requestId});
  const enrollment=await enrollmentForCourse(req,String(course._id));
  if(enrollment.unavailable) return res.status(503).json({error:{code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"},requestId:req.requestId});
  if(!enrollment.enrolled) return res.status(403).json({error:{code:"NOT_ENROLLED",message:"Active enrollment is required"},requestId:req.requestId});
  const attempts=await AssessmentAttempt.find({studentId:req.user.sub,courseId:req.params.id,quizId:req.params.quizId}).sort({createdAt:-1}).limit(20);
  res.json({attempts:attempts.map(safeAttempt)});
}));

router.get("/:id/attempts/pending", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  const course=await courseForRequest(req);
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  const attempts=await AssessmentAttempt.find({courseId:String(course._id),status:"pending_review"}).sort({createdAt:1}).limit(100);
  const pending=attempts.map(attempt=>{
    const value=object(attempt);
    const quizItem=course.quizzes.id(value.quizId);
    return {
      attempt:safeAttempt(attempt),
      quizId:value.quizId,
      quizTitle:quizItem?.title||"Unavailable quiz",
      questions:(value.answers||[]).map(answer=>{
        const questionItem=quizItem?.questions.id(answer.questionId);
        return {
          questionId:answer.questionId,
          prompt:questionItem?.prompt||"This question is no longer available.",
          answer:answer.answer,
          pointsPossible:questionItem?.points||0,
          gradingRubric:questionItem?.gradingRubric||"",
          reviewable:questionItem?.type==="short_answer"
        };
      })
    };
  });
  res.json({attempts:pending});
}));

router.patch("/:id/quizzes/:quizId/attempts/:attemptId/review", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id) || !parseObjectId(req.params.attemptId)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid course or attempt ID"},requestId:req.requestId});
  const course=await courseForRequest(req);
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  const quizItem=course.quizzes.id(req.params.quizId);
  if(!quizItem) return res.status(404).json({error:{code:"NOT_FOUND",message:"Quiz not found"},requestId:req.requestId});
  const input=z.object({grades:z.array(z.object({
    questionId:z.string().regex(/^[a-f\d]{24}$/i),
    pointsEarned:z.number().int().min(0),
    feedback:z.string().max(2000).optional()
  }).strict()).min(1).max(100)}).strict().parse(req.body);
  if(new Set(input.grades.map(item=>item.questionId)).size!==input.grades.length) {
    return res.status(400).json({error:{code:"INVALID_GRADE",message:"A question can only be graded once per submission"},requestId:req.requestId});
  }
  const attempt=await AssessmentAttempt.findOne({_id:req.params.attemptId,courseId:String(course._id),quizId:String(quizItem._id),status:"pending_review"});
  if(!attempt) return res.status(404).json({error:{code:"NOT_FOUND",message:"Pending assessment attempt not found"},requestId:req.requestId});
  const gradeMap=new Map(input.grades.map(item=>[item.questionId,item]));
  let score=0;
  for(const answer of attempt.answers) {
    const questionItem=quizItem.questions.id(answer.questionId);
    if(!questionItem) return res.status(409).json({error:{code:"QUESTION_REMOVED",message:"Attempt references a question that no longer exists"},requestId:req.requestId});
    const grade=gradeMap.get(answer.questionId);
    if(grade) {
      if(questionItem.type!=="short_answer" || grade.pointsEarned>questionItem.points) {
        return res.status(400).json({error:{code:"INVALID_GRADE",message:"Grade exceeds question points or changes an automatically graded answer"},requestId:req.requestId});
      }
      answer.pointsEarned=grade.pointsEarned;
      answer.feedback=grade.feedback || "";
      answer.reviewed=true;
    }
    score+=answer.pointsEarned;
  }
  if(input.grades.some(item=>!attempt.answers.some(answer=>answer.questionId===item.questionId))) {
    return res.status(400).json({error:{code:"INVALID_GRADE",message:"A grade references a question outside this attempt"},requestId:req.requestId});
  }
  attempt.score=score;
  attempt.status=attempt.answers.some(answer=>!answer.reviewed)?"pending_review":"reviewed";
  await attempt.save();
  res.json({attempt:safeAttempt(attempt),percentage:attempt.maxScore?Math.round(score/attempt.maxScore*100):0,passed:attempt.status==="reviewed" && score/attempt.maxScore*100>=quizItem.passingScore});
}));

router.get("/:id/quizzes/:quizId", authenticate, asyncHandler(async(req,res)=>{
  const course=await courseForRequest(req,{requirePublished:true});
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Published course not found"},requestId:req.requestId});
  const quizItem=course.quizzes.id(req.params.quizId);
  if(!quizItem || !quizItem.published) return res.status(404).json({error:{code:"NOT_FOUND",message:"Published quiz not found"},requestId:req.requestId});
  const enrollment=await enrollmentForCourse(req,String(course._id));
  if(enrollment.unavailable) return res.status(503).json({error:{code:"ENROLLMENT_CHECK_FAILED",message:"Unable to verify enrollment"},requestId:req.requestId});
  if(!enrollment.enrolled && req.user.role!=="admin") return res.status(403).json({error:{code:"NOT_ENROLLED",message:"Active enrollment is required"},requestId:req.requestId});
  const { questions,...metadata }=quizItem.toObject();
  res.json({quiz:{...metadata,questions:questions.map(({correctAnswers,gradingRubric,...item})=>item)}});
}));

router.get("/:id", optionalAuthenticate, asyncHandler(async(req,res)=>{
  const cacheVersion=req.user?null:await courseCache.version();
  const cacheKey=cacheVersion===null?null:courseCache.key(cacheVersion,"detail",{id:req.params.id});
  if(cacheKey) {
    const cached=await courseCache.get(cacheKey);
    if(cached!==undefined) return res.json(cached);
  }
  const byId=parseObjectId(req.params.id);
  const course=byId?await Course.findById(req.params.id):await Course.findOne({slug:req.params.id});
  const owner=course && (req.user?.sub===course.instructorId || req.user?.role==="admin");
  if(!course || (!course.published && !owner)) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found"},requestId:req.requestId});
  const response={course:owner?courseView(course,true):publicCourse(course)};
  if(cacheKey && course.published) await courseCache.set(cacheKey,response);
  res.json(response);
}));

router.patch("/:id", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid course ID"},requestId:req.requestId});
  const {migrateLegacyLessons=false,...data}=courseUpdate.parse(req.body);
  const filter=req.user.role==="admin"?{_id:req.params.id}:{_id:req.params.id,instructorId:req.user.sub};
  const existing=await Course.findOne(filter);
  if(!existing) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  if(data.archived===true && data.published===true) return res.status(400).json({error:{code:"INVALID_COURSE_STATE",message:"An archived course cannot be published"},requestId:req.requestId});
  if(data.published===true && existing.archived) return res.status(409).json({error:{code:"COURSE_ARCHIVED",message:"Archived courses cannot be published"},requestId:req.requestId});
  if(data.modules) {
    const result=reconcileModules(data.modules,existing,migrateLegacyLessons);
    if(result.error) return res.status(400).json({error:{code:"INVALID_COURSE_CONTENT",message:result.error},requestId:req.requestId});
    Object.assign(data,result);
  }
  if(data.archived===true) data.published=false;
  const contentChanged=["learningObjectives","lessons","modules"].some(key=>Object.hasOwn(data,key));
  const remainsPublished=data.published??existing.published;
  if(remainsPublished && (data.published===true || contentChanged) && data.archived!==true) {
    const candidate={...object(existing),...data};
    const issues=publicationIssues(candidate);
    if(issues.length) return res.status(422).json({error:{code:"COURSE_NOT_READY",message:"Course needs more content before it can be published",details:issues},requestId:req.requestId});
  }
  const course=await Course.findOneAndUpdate(filter,{$set:data},{new:true,runValidators:true});
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  await courseCache.invalidate();
  res.json({course:courseView(course,true)});
}));

router.delete("/:id", authenticate, allowRoles("instructor","admin"), asyncHandler(async(req,res)=>{
  if(!parseObjectId(req.params.id)) return res.status(400).json({error:{code:"INVALID_ID",message:"Invalid course ID"},requestId:req.requestId});
  const filter=req.user.role==="admin"?{_id:req.params.id}:{_id:req.params.id,instructorId:req.user.sub};
  const course=await Course.findOneAndUpdate(filter,{$set:{published:false,archived:true}},{new:true});
  if(!course) return res.status(404).json({error:{code:"NOT_FOUND",message:"Course not found or not owned by you"},requestId:req.requestId});
  await courseCache.invalidate();
  res.status(204).end();
}));

export default router;
