import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Layout from "../components/Layout";
import { Notice, Spinner } from "../components/UI";
import { courseApi, enrollmentApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./CourseLearning.css";

export default function CourseOverview() {
  const { id }=useParams();
  const { isAuthenticated,user }=useAuth();
  const navigate=useNavigate();
  const [course,setCourse]=useState(null);
  const [enrollment,setEnrollment]=useState(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  useEffect(()=>{
    let live=true;
    Promise.all([
      courseApi.get(id),
      isAuthenticated?enrollmentApi.mine():Promise.resolve({enrollments:[]})
    ]).then(([courseResult,enrollmentResult])=>{
      if(!live)return;
      setCourse(courseResult.course);
      setEnrollment((enrollmentResult.enrollments||[]).find(item=>item.courseId===courseResult.course._id&&item.status==="active")||null);
    }).catch(error=>live&&setError(error.message)).finally(()=>live&&setLoading(false));
    return()=>{live=false};
  },[id,isAuthenticated]);

  async function enroll() {
    if(!isAuthenticated) {
      navigate("/login",{state:{from:{pathname:`/courses/${id}`}}});
      return;
    }
    if(user?.role!=="student")return;
    setBusy(true);setError("");
    try {
      const result=await enrollmentApi.enroll(course._id);
      setEnrollment(result.enrollment);
    } catch(error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  if(loading)return <Layout><Spinner label="Loading course..."/></Layout>;
  if(!course)return <Layout><Notice type="error">{error||"Course not found."}</Notice><Link to="/courses" className="inline-link">← Back to courses</Link></Layout>;
  const modules=(course.modules||[]).filter(module=>!module.archived);
  const lessons=modules.length?modules.flatMap(module=>(module.lessons||[]).filter(lesson=>!lesson.archived).map(lesson=>({...lesson,moduleTitle:module.title}))):(course.lessons||[]);
  return <Layout>
    <Link to="/courses" className="back-link">← Back to course library</Link>
    {error&&<Notice type="error">{error}</Notice>}
    <section className="detail-hero"><div><div className="meta"><span className={`level ${course.level}`}>{course.level}</span><small>{course.category}</small></div><h1>{course.title}<em>.</em></h1><p>{course.description}</p><div className="detail-meta"><span><BookOpen size={15}/>{lessons.length} lessons</span><span><GraduationCap size={15}/>{Math.ceil((course.estimatedMinutes||60)/60)}h estimated</span></div>{enrollment?<Link className="btn primary big" to={`/courses/${course._id}/learn`}>Continue learning <ArrowRight size={17}/></Link>:user?.role==="student"||!isAuthenticated?<button className="btn primary big" onClick={enroll} disabled={busy}>{busy?"Enrolling...":"Enroll to track progress"} <ArrowRight size={17}/></button>:<p className="fineprint">Instructor preview · You cannot enroll using a teacher account.</p>}</div><div className="detail-art">✳<small>A NEW SKILL, IN REACH</small></div></section>
    {course.learningObjectives?.length>0&&<section><div className="section-head"><div><span className="eyebrow">LEARNING OBJECTIVES</span><h2>What you'll learn</h2></div></div><ul className="course-objectives">{course.learningObjectives.map(item=><li key={item}>{item}</li>)}</ul></section>}
    {course.prerequisites?.length>0&&<section><div className="section-head"><div><span className="eyebrow">BEFORE YOU BEGIN</span><h2>Prerequisites</h2></div></div><ul className="course-objectives">{course.prerequisites.map(item=><li key={item}>{item}</li>)}</ul></section>}
    <div className="section-head"><div><span className="eyebrow">COURSE ROADMAP</span><h2>Lessons & curriculum</h2></div></div>
    {lessons.length?modules.length?modules.map(module=><section className="overview-module" key={module._id}><h3>{module.title}</h3>{module.description&&<p>{module.description}</p>}{(module.lessons||[]).filter(lesson=>!lesson.archived).map((lesson,index)=><article className="overview-lesson" key={lesson._id}><span className="lesson-num">{String(index+1).padStart(2,"0")}</span><div className="lesson-reading"><h4>{lesson.title}</h4>{lesson.description&&<p>{lesson.description}</p>}{lesson.learningObjectives?.length>0&&<ul>{lesson.learningObjectives.map(objective=><li key={objective}>{objective}</li>)}</ul>}{lesson.contentFormat==="text"?<div className="markdown-body plain-content">{lesson.content}</div>:<div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.content||""}</ReactMarkdown></div>}{lesson.videoUrl&&<a href={lesson.videoUrl} target="_blank" rel="noreferrer">Watch lesson video</a>}{lesson.resources?.map(resource=><p key={resource.url}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a></p>)}</div>{enrollment&&<CheckCircle2 size={18} className="lesson-unlocked"/>}</article>)}</section>):lessons.map((lesson,index)=><article className="overview-lesson" key={lesson._id}><span className="lesson-num">{String(index+1).padStart(2,"0")}</span><div className="lesson-reading"><h4>{lesson.title}</h4>{lesson.description&&<p>{lesson.description}</p>}<div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.content||""}</ReactMarkdown></div></div></article>):<div className="learn-empty"><h3>Course content is being prepared</h3><p>The instructor has not added any lessons yet.</p></div>}
  </Layout>;
}
