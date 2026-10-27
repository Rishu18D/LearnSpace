import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Layout from "../components/Layout";
import { Notice, Spinner } from "../components/UI";
import { courseApi, enrollmentApi, progressApi } from "../lib/api";
import "./CourseLearning.css";

export default function CourseLearning() {
  const { id }=useParams();
  const [course,setCourse]=useState(null);
  const [lessons,setLessons]=useState([]);
  const [enrolled,setEnrolled]=useState(false);
  const [progress,setProgress]=useState([]);
  const [currentId,setCurrentId]=useState("");
  const [quizzes,setQuizzes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  useEffect(()=>{
    let live=true;
    Promise.all([courseApi.get(id),enrollmentApi.mine(),progressApi.course(id)])
      .then(([courseResult,enrollmentResult,progressResult])=>{
        if(!live)return;
        const data=courseResult.course;
        const moduleLessons=(data.modules||[]).flatMap(module=>(module.lessons||[]).map(lesson=>({...lesson,moduleId:module._id,moduleTitle:module.title})));
        const items=moduleLessons.length?moduleLessons:(data.lessons||[]);
        setCourse(data);
        setLessons(items);
        setProgress(progressResult.progress||[]);
        setEnrolled((enrollmentResult.enrollments||[]).some(item=>item.courseId===data._id&&item.status==="active"));
        const last=(progressResult.progress||[]).filter(item=>item.lastAccessedAt).sort((a,b)=>new Date(b.lastAccessedAt)-new Date(a.lastAccessedAt))[0];
        const resumableLesson=items.find(item=>String(item._id)===String(last?.lessonId));
        setCurrentId(String(resumableLesson?._id||items[0]?._id||""));
      })
      .catch(error=>live&&setError(error.message))
      .finally(()=>live&&setLoading(false));
    return()=>{live=false};
  },[id]);

  const currentIndex=lessons.findIndex(item=>String(item._id)===String(currentId));
  const currentLesson=lessons[currentIndex];
  const completedIds=useMemo(()=>new Set(progress.filter(item=>item.completed).map(item=>String(item.lessonId))),[progress]);
  const percent=lessons.length?Math.round(lessons.filter(item=>completedIds.has(String(item._id))).length/lessons.length*100):0;

  async function selectLesson(lesson) {
    setCurrentId(String(lesson._id));
    setError("");
    if(!enrolled)return;
    try {
      const response=await progressApi.access(course._id,lesson._id);
      setProgress(items=>[...items.filter(item=>item.lessonId!==response.progress.lessonId),response.progress]);
    } catch(error) {
      setError(error.message);
    }
  }

  async function completeLesson() {
    if(!currentLesson||!enrolled)return;
    setBusy(true);
    setError("");
    try {
      const result=await progressApi.complete(currentLesson._id,course._id);
      setProgress(items=>[...items.filter(item=>item.lessonId!==result.progress.lessonId),result.progress]);
      setSuccess("Lesson completed. Your progress is saved.");
    } catch(error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  if(loading)return <Layout><Spinner label="Opening your course..."/></Layout>;
  if(!course)return <Layout><Notice type="error">{error||"Course not found."}</Notice><Link className="inline-link" to="/courses">Back to courses</Link></Layout>;
  if(!enrolled)return <Layout><Link className="back-link" to={`/courses/${course._id}`}>← Back to course details</Link><Notice type="info"><LockKeyhole size={16}/> Enroll in this course to track progress and access assessments.</Notice><section className="learn-empty"><h1>{course.title}</h1><p>{course.description}</p><Link className="btn primary" to={`/courses/${course._id}`}>View course and enroll</Link></section></Layout>;

  return <Layout>
    <div className="learn-header"><Link className="back-link" to={`/courses/${course._id}`}>← Course overview</Link><div><span className="eyebrow">YOUR LEARNING PATH</span><h1>{course.title}<em>.</em></h1><p>{lessons.filter(item=>completedIds.has(String(item._id))).length} of {lessons.length} lessons complete</p></div><div className="learn-progress"><div className="track"><i style={{width:`${percent}%`}}/></div><b>{percent}%</b></div></div>
    {error&&<Notice type="error">{error}</Notice>}
    {success&&<Notice type="success" onClose={()=>setSuccess("")}>{success}</Notice>}
    <div className="learn-layout">
      <aside className="learn-outline"><h2>Course outline</h2>
        {(course.modules||[]).length?course.modules.filter(module=>!module.archived).map(module=><section key={module._id}><h3>{module.title}</h3>{(module.lessons||[]).filter(lesson=>!lesson.archived).map(lesson=><button key={lesson._id} className={`learn-outline-item ${String(lesson._id)===String(currentId)?"selected":""}`} onClick={()=>selectLesson(lesson)}><span>{completedIds.has(String(lesson._id))?<CheckCircle2 size={16}/>:<BookOpen size={15}/>}</span>{lesson.title}</button>)}</section>):lessons.map(lesson=><button key={lesson._id} className={`learn-outline-item ${String(lesson._id)===String(currentId)?"selected":""}`} onClick={()=>selectLesson(lesson)}><span>{completedIds.has(String(lesson._id))?<CheckCircle2 size={16}/>:<BookOpen size={15}/>}</span>{lesson.title}</button>)}
        {(course.quizzes||[]).map(quiz=><button key={quiz._id} className="learn-outline-item quiz-outline" onClick={()=>setQuizzes(items=>items.some(item=>item._id===quiz._id)?items:[...items,quiz])}><span>Q</span>{quiz.title}</button>)}
      </aside>
      <main className="learn-content">
        {currentLesson?<article className="lesson-reader"><div className="lesson-reader-meta"><span>{currentLesson.moduleTitle||"Course lesson"}</span><span><Clock3 size={14}/>{currentLesson.estimatedMinutes||10} min</span></div><h2>{currentLesson.title}</h2>{currentLesson.description&&<p className="lesson-reader-summary">{currentLesson.description}</p>}{currentLesson.learningObjectives?.length>0&&<section className="lesson-objectives"><b>By the end of this lesson, you can:</b><ul>{currentLesson.learningObjectives.map(item=><li key={item}>{item}</li>)}</ul></section>}{currentLesson.videoUrl&&<p><a href={currentLesson.videoUrl} target="_blank" rel="noreferrer">Watch lesson video</a></p>}{currentLesson.contentFormat==="text"?<div className="markdown-body plain-content">{currentLesson.content}</div>:<div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{currentLesson.content||""}</ReactMarkdown></div>}{currentLesson.resources?.length>0&&<section className="lesson-resources"><h3>Resources</h3>{currentLesson.resources.map(resource=><a key={resource._id||resource.url} href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a>)}</section>}<div className="lesson-controls"><button className="btn outline" disabled={currentIndex<=0} onClick={()=>selectLesson(lessons[currentIndex-1])}><ArrowLeft size={15}/> Previous</button>{completedIds.has(String(currentLesson._id))?<span className="learn-completed"><CheckCircle2 size={17}/> Completed</span>:<button className="btn primary" disabled={busy} onClick={completeLesson}>{busy?"Saving...":"Mark lesson complete"} <CheckCircle2 size={16}/></button>}<button className="btn outline" disabled={currentIndex<0||currentIndex>=lessons.length-1} onClick={()=>selectLesson(lessons[currentIndex+1])}>Next <ArrowRight size={15}/></button></div></article>:<div className="learn-empty"><h2>No lessons are published yet.</h2><p>Check back when your instructor has published the course lessons.</p></div>}
      </main>
    </div>
    {quizzes.map(quiz=><QuizPanel key={quiz._id} courseId={course._id} quiz={quiz} onClose={()=>setQuizzes(items=>items.filter(item=>item._id!==quiz._id))}/>)}
  </Layout>;
}

function QuizPanel({courseId,quiz,onClose}) {
  const [data,setData]=useState(null);
  const [answers,setAnswers]=useState({});
  const [result,setResult]=useState(null);
  const [attempts,setAttempts]=useState([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(true);
  useEffect(()=>{
    let live=true;
    Promise.all([courseApi.quiz(courseId,quiz._id),courseApi.quizAttempts(courseId,quiz._id)])
      .then(([quizResponse,attemptResponse])=>{
        if(!live)return;
        setData(quizResponse.quiz);
        setAttempts(attemptResponse.attempts||[]);
      })
      .catch(error=>live&&setError(error.message))
      .finally(()=>live&&setBusy(false));
    return()=>{live=false};
  },[courseId,quiz._id]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await courseApi.submitQuiz(courseId,quiz._id,answers));
      const attemptResponse=await courseApi.quizAttempts(courseId,quiz._id);
      setAttempts(attemptResponse.attempts||[]);
    } catch(error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const setAnswer=(id,value)=>setAnswers(current=>({...current,[id]:value}));
  return <div className="quiz-overlay">
    <section className="quiz-panel" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
      <div className="quiz-heading">
        <div><span className="eyebrow">ASSESSMENT</span><h2 id="quiz-title">{data?.title||quiz.title}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close quiz">×</button>
      </div>
      {error&&<Notice type="error">{error}</Notice>}
      {busy&&!data?<Spinner label="Loading assessment..."/>:data&&!result?<>
        <section className="quiz-history" aria-label="Previous quiz attempts">
          <b>Attempts remaining: {Math.max(0,data.attemptLimit-attempts.length)} of {data.attemptLimit}</b>
          {attempts.length>0&&<ul>{attempts.map(attempt=><li key={attempt._id}>
            Attempt {attempt.attemptNumber} · {attempt.status==="pending_review"?"Awaiting instructor review":`${attempt.score}/${attempt.maxScore} points`}
          </li>)}</ul>}
        </section>
        <form onSubmit={submit}>
          {data.instructions&&<p>{data.instructions}</p>}
          {data.questions.map((question,index)=><fieldset className="quiz-question" key={question._id}>
            <legend>{index+1}. {question.prompt} <small>{question.points} pts</small></legend>
            {question.type==="single_choice"&&(question.options||[]).map(option=><label className="quiz-option" key={option}>
              <input type="radio" name={question._id} checked={answers[question._id]===option} onChange={()=>setAnswer(question._id,option)}/>{option}
            </label>)}
            {question.type==="multiple_select"&&(question.options||[]).map(option=><label className="quiz-option" key={option}>
              <input type="checkbox" checked={(answers[question._id]||[]).includes(option)} onChange={event=>setAnswer(question._id,event.target.checked?[...(answers[question._id]||[]),option]:(answers[question._id]||[]).filter(item=>item!==option))}/>{option}
            </label>)}
            {question.type==="true_false"&&<select className="text-input" value={answers[question._id]||""} onChange={event=>setAnswer(question._id,event.target.value)}>
              <option value="">Select answer</option><option value="true">True</option><option value="false">False</option>
            </select>}
            {["fill_blank","short_answer"].includes(question.type)&&<textarea className="text-input" rows={question.type==="short_answer"?4:2} value={answers[question._id]||""} onChange={event=>setAnswer(question._id,event.target.value)} required/>}
          </fieldset>)}
          <button className="btn primary" disabled={busy||attempts.length>=data.attemptLimit}>{busy?"Submitting...":"Submit answers"}</button>
        </form>
      </>:result&&<section className="quiz-result">
        <h3>{result.needsReview?"Submitted for instructor review":`Score: ${result.percentage}%`}</h3>
        {!result.needsReview&&<p>{result.passed?"You passed.":"Keep practicing and try again when attempts remain."}</p>}
        {result.questionResults?.map((item,index)=><article key={item.questionId}>
          <b>Question {index+1}: {item.correct===null?"Awaiting review":item.correct?"Correct":"Not quite"}</b>
          {item.explanation&&<p>{item.explanation}</p>}
          {item.correct===false&&item.correctAnswers&&<small>Correct answer: {item.correctAnswers.join(", ")}</small>}
        </article>)}
        <h4>Attempt history</h4>
        <ul className="quiz-history-list">{attempts.map(attempt=><li key={attempt._id}>
          Attempt {attempt.attemptNumber} · {attempt.status==="pending_review"?"Awaiting instructor review":`${attempt.score}/${attempt.maxScore} points`}
        </li>)}</ul>
      </section>}
    </section>
  </div>;
}
