import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Copy, Eye, FileUp, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { Empty, Notice, Spinner } from "../components/UI";
import { courseApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import "./CourseStudio.css";

const blankCourse = () => ({
  title:"",description:"",category:"",level:"beginner",learningObjectives:[],tags:[],
  prerequisites:[],estimatedMinutes:60,language:"en",thumbnailUrl:"",modules:[],quizzes:[]
});
const blankModule = order => ({ title:"",description:"",order,published:true,lessons:[] });
const blankLesson = order => ({ title:"",description:"",learningObjectives:[],content:"",contentFormat:"markdown",estimatedMinutes:10,videoUrl:"",resources:[],order,published:true });
const blankQuestion = order => ({ prompt:"",type:"single_choice",options:["",""],correctAnswers:[],explanation:"",points:1,order });
const asLines = value => value.join("\n");
const fromLines = value => value.split("\n").map(item=>item.trim()).filter(Boolean);

export default function CourseStudio() {
  const { user }=useAuth();
  const [courses,setCourses]=useState([]);
  const [filter,setFilter]=useState({search:"",status:"active"});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [editing,setEditing]=useState(null);
  const [reviewing,setReviewing]=useState(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const [form,setForm]=useState(blankCourse);
  const [busy,setBusy]=useState(false);
  const [importFile,setImportFile]=useState(null);
  const [importResult,setImportResult]=useState(null);
  const [importBusy,setImportBusy]=useState(false);

  async function load() {
    setLoading(true);
    try {
      const result=await courseApi.mine({search:filter.search,status:filter.status==="all"?"all":filter.status});
      setCourses(result.courses||[]);
      setError("");
    } catch(error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{load()},[filter.search,filter.status]);

  function openEditor(course) {
    setEditorOpen(true);
    setEditing(course||null);
    const modules=(course?.modules||[]).filter(item=>!item.archived).map(module=>({
      _id:module._id,title:module.title,description:module.description||"",order:module.order,
      published:module.published!==false,
      lessons:(module.lessons||[]).filter(item=>!item.archived).map(lesson=>({
        _id:lesson._id,title:lesson.title,description:lesson.description||"",learningObjectives:lesson.learningObjectives||[],
        content:lesson.content||"",contentFormat:lesson.contentFormat||"markdown",estimatedMinutes:lesson.estimatedMinutes||10,
        videoUrl:lesson.videoUrl||"",resources:(lesson.resources||[]).map(resource=>({title:resource.title,url:resource.url,type:resource.type||"link"})),
        order:lesson.order,published:lesson.published!==false
      }))
    }));
    const legacyLessons=(course?.lessons||[]).filter(lesson=>!lesson.moduleId&&!lesson.archived);
    if(legacyLessons.length) modules.push({
      title:"Existing lessons",
      description:"Lessons created before modules were introduced.",
      order:modules.length,
      published:true,
      lessons:legacyLessons.map(lesson=>({
        _id:lesson._id,title:lesson.title,description:lesson.description||"",learningObjectives:lesson.learningObjectives||[],
        content:lesson.content||"",contentFormat:lesson.contentFormat||"markdown",estimatedMinutes:lesson.estimatedMinutes||10,
        videoUrl:lesson.videoUrl||"",resources:(lesson.resources||[]).map(resource=>({title:resource.title,url:resource.url,type:resource.type||"link"})),
        order:lesson.order,published:lesson.published!==false
      }))
    });
    setForm(course?{
      ...blankCourse(),
      ...course,
      learningObjectives:course.learningObjectives||[],
      tags:course.tags||[],
      prerequisites:course.prerequisites||[],
      modules,
      quizzes:(course.quizzes||[]).filter(item=>!item.archived).map(quiz=>({
        _id:quiz._id,title:quiz.title,instructions:quiz.instructions||"",moduleId:quiz.moduleId||null,lessonId:quiz.lessonId||null,
        passingScore:quiz.passingScore??70,attemptLimit:quiz.attemptLimit??3,showAnswers:quiz.showAnswers!==false,published:quiz.published===true,
        questions:(quiz.questions||[]).map(question=>({
          _id:question._id,prompt:question.prompt,type:question.type,options:question.options||[],
          correctAnswers:question.correctAnswers||[],explanation:question.explanation||"",gradingRubric:question.gradingRubric||"",
          points:question.points||1,order:question.order
        }))
      }))
    }:blankCourse());
    setError("");
  }

  function updateModule(index,changes) {
    setForm(current=>({...current,modules:current.modules.map((item,i)=>i===index?{...item,...changes}:item)}));
  }
  function updateLesson(moduleIndex,lessonIndex,changes) {
    const modules=form.modules.map((module,index)=>index===moduleIndex?{
      ...module,
      lessons:module.lessons.map((lesson,itemIndex)=>itemIndex===lessonIndex?{...lesson,...changes}:lesson)
    }:module);
    setForm({...form,modules});
  }
  function moveItem(list,index,direction) {
    const next=[...list];
    const target=index+direction;
    if(target<0||target>=next.length)return next;
    [next[index],next[target]]=[next[target],next[index]];
    return next.map((item,order)=>({...item,order}));
  }

  async function saveCourse(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data={
      title:form.title.trim(),description:form.description.trim(),category:form.category.trim(),
      level:form.level,learningObjectives:form.learningObjectives,tags:form.tags,
      prerequisites:form.prerequisites,estimatedMinutes:Number(form.estimatedMinutes),
      language:form.language.trim(),thumbnailUrl:form.thumbnailUrl||"",
      published:editing?.published===true,
      ...(editing?.lessons?.some(lesson=>!lesson.moduleId&&!lesson.archived)?{migrateLegacyLessons:true}:{}),
      modules:form.modules.map((module,order)=>({...module,order,lessons:module.lessons.map((lesson,lessonOrder)=>({...lesson,order:lessonOrder}))})),
      quizzes:form.quizzes.map((quiz,order)=>({...quiz,order,questions:quiz.questions.map((question,questionOrder)=>({...question,order:questionOrder}))}))
    };
    try {
      if(editing) await courseApi.update(editing._id,data);
      else await courseApi.create(data);
      setSuccess(editing?.published?"Course updates saved and remain published.":editing?"Course saved as a draft.":"Course created as a draft. Add your content and publish when ready.");
      setEditing(null);
      setEditorOpen(false);
      await load();
    } catch(error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish(course) {
    setError("");
    try {
      await courseApi.update(course._id,{published:!course.published});
      setSuccess(course.published?"Course unpublished.":"Course published and available in the course library.");
      await load();
    } catch(error) {
      setError(error.message);
    }
  }

  async function archive(course) {
    if(!window.confirm(`Archive "${course.title}"? Existing student progress will be preserved.`))return;
    try {
      await courseApi.remove(course._id);
      setSuccess("Course archived. Student progress was preserved.");
      await load();
    } catch(error) {
      setError(error.message);
    }
  }

  async function duplicate(course) {
    try {
      await courseApi.duplicate(course._id);
      setSuccess("Course duplicated as a draft.");
      await load();
    } catch(error) {
      setError(error.message);
    }
  }

  async function restore(course) {
    setError("");
    try {
      await courseApi.update(course._id,{archived:false});
      setSuccess("Course restored as a draft.");
      await load();
    } catch(error) {
      setError(error.message);
    }
  }

  async function previewImport() {
    if(!importFile)return;
    setImportBusy(true);
    setError("");
    setImportResult(null);
    try {
      const parsed=JSON.parse(await importFile.text());
      const courses=Array.isArray(parsed)?parsed:Array.isArray(parsed.courses)?parsed.courses:[parsed];
      setImportResult(await courseApi.importCourses(courses,true));
    } catch(error) {
      if(error.payload?.errors) setImportResult({valid:0,imported:0,errors:error.payload.errors});
      setError(error instanceof SyntaxError?"The selected file is not valid JSON.":error.message);
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if(!importFile||!importResult?.valid||importResult.errors?.length)return;
    if(!window.confirm(`Import ${importResult.valid} course(s) as drafts? Existing import keys will never be overwritten.`))return;
    setImportBusy(true);
    try {
      const parsed=JSON.parse(await importFile.text());
      const courses=Array.isArray(parsed)?parsed:Array.isArray(parsed.courses)?parsed.courses:[parsed];
      const result=await courseApi.importCourses(courses,false);
      setImportResult(result);
      setSuccess(`${result.imported} course(s) imported as drafts.`);
      await load();
    } catch(error) {
      setError(error.message);
    } finally {
      setImportBusy(false);
    }
  }

  if(editorOpen) return <Layout>
    <div className="studio-heading"><div><span className="eyebrow">INSTRUCTOR WORKSPACE</span><h1>{editing?"Edit course":"Create a course"}<em>.</em></h1><p>Build a structured course with modules, lessons, and assessments.</p></div><button className="btn outline" type="button" onClick={()=>{setEditing(null);setForm(blankCourse());setEditorOpen(false)}}>Close editor</button></div>
    {error&&<Notice type="error">{error}</Notice>}
    {editing?.published&&<Notice type="info">This course is live. Saving content updates the published version immediately.</Notice>}
    <form className="panel studio-form" onSubmit={saveCourse}>
      <h2>Course details</h2>
      <label>Title<input className="text-input" value={form.title} onChange={event=>setForm({...form,title:event.target.value})} minLength={3} maxLength={160} required/></label>
      <label>Description<textarea className="text-input" rows="4" value={form.description} onChange={event=>setForm({...form,description:event.target.value})} maxLength={5000} required/></label>
      <div className="studio-grid">
        <label>Category<input className="text-input" value={form.category} onChange={event=>setForm({...form,category:event.target.value})} maxLength={80} required/></label>
        <label>Difficulty<select className="text-input" value={form.level} onChange={event=>setForm({...form,level:event.target.value})}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
        <label>Estimated minutes<input className="text-input" type="number" min="1" max="100000" value={form.estimatedMinutes} onChange={event=>setForm({...form,estimatedMinutes:event.target.value})} required/></label>
        <label>Language<input className="text-input" value={form.language} onChange={event=>setForm({...form,language:event.target.value})} maxLength={40}/></label>
        <label>Cover image URL<input className="text-input" type="url" value={form.thumbnailUrl} onChange={event=>setForm({...form,thumbnailUrl:event.target.value})}/></label>
      </div>
      <label>Learning objectives<textarea className="text-input" rows="3" placeholder="One learning objective per line" value={asLines(form.learningObjectives)} onChange={event=>setForm({...form,learningObjectives:fromLines(event.target.value)})}/></label>
      <label>Prerequisites<textarea className="text-input" rows="2" placeholder="One prerequisite per line" value={asLines(form.prerequisites)} onChange={event=>setForm({...form,prerequisites:fromLines(event.target.value)})}/></label>
      <label>Tags<input className="text-input" placeholder="Separate tags with commas" value={form.tags.join(", ")} onChange={event=>setForm({...form,tags:fromLines(event.target.value.replaceAll(",","\n"))})}/></label>

      <div className="studio-section-heading"><div><h2>Modules and lessons</h2><p>Lessons stay linked to their IDs when reordered or moved.</p></div><button className="btn outline" type="button" onClick={()=>setForm({...form,modules:[...form.modules,blankModule(form.modules.length)]})}><Plus size={15}/> Add module</button></div>
      {form.modules.map((module,moduleIndex)=><section className="studio-module" key={module._id||moduleIndex}>
        <div className="studio-card-heading"><b>Module {moduleIndex+1}</b><div><button className="icon-btn" type="button" aria-label="Move module up" onClick={()=>setForm({...form,modules:moveItem(form.modules,moduleIndex,-1)})}><ArrowUp size={15}/></button><button className="icon-btn" type="button" aria-label="Move module down" onClick={()=>setForm({...form,modules:moveItem(form.modules,moduleIndex,1)})}><ArrowDown size={15}/></button><button className="icon-btn danger" type="button" aria-label="Remove module" onClick={()=>setForm({...form,modules:form.modules.filter((_,i)=>i!==moduleIndex)})}><Trash2 size={15}/></button></div></div>
        <label className="studio-check"><input type="checkbox" checked={module.published!==false} onChange={event=>updateModule(moduleIndex,{published:event.target.checked})}/> Published module</label>
        <label>Module title<input className="text-input" value={module.title} onChange={event=>updateModule(moduleIndex,{title:event.target.value})} maxLength={160} required/></label>
        <label>Module description<textarea className="text-input" rows="2" value={module.description} onChange={event=>updateModule(moduleIndex,{description:event.target.value})} maxLength={2000}/></label>
        {module.lessons.map((lesson,lessonIndex)=><article className="studio-lesson" key={lesson._id||lessonIndex}>
          <div className="studio-card-heading"><b>Lesson {lessonIndex+1}</b><div><button className="icon-btn" type="button" aria-label="Move lesson up" onClick={()=>updateModule(moduleIndex,{lessons:moveItem(module.lessons,lessonIndex,-1)})}><ArrowUp size={14}/></button><button className="icon-btn" type="button" aria-label="Move lesson down" onClick={()=>updateModule(moduleIndex,{lessons:moveItem(module.lessons,lessonIndex,1)})}><ArrowDown size={14}/></button><button className="icon-btn danger" type="button" aria-label="Remove lesson" onClick={()=>updateModule(moduleIndex,{lessons:module.lessons.filter((_,i)=>i!==lessonIndex)})}><Trash2 size={14}/></button></div></div>
          <label className="studio-check"><input type="checkbox" checked={lesson.published!==false} onChange={event=>updateLesson(moduleIndex,lessonIndex,{published:event.target.checked})}/> Published lesson</label>
          <label>Lesson title<input className="text-input" value={lesson.title} onChange={event=>updateLesson(moduleIndex,lessonIndex,{title:event.target.value})} maxLength={160} required/></label>
          <label>Summary<textarea className="text-input" rows="2" value={lesson.description} onChange={event=>updateLesson(moduleIndex,lessonIndex,{description:event.target.value})} maxLength={2000}/></label>
          <label>Lesson objectives<textarea className="text-input" rows="2" placeholder="One objective per line" value={asLines(lesson.learningObjectives)} onChange={event=>updateLesson(moduleIndex,lessonIndex,{learningObjectives:fromLines(event.target.value)})}/></label>
          <div className="studio-grid"><label>Format<select className="text-input" value={lesson.contentFormat} onChange={event=>updateLesson(moduleIndex,lessonIndex,{contentFormat:event.target.value})}><option value="markdown">Markdown</option><option value="text">Plain text</option></select></label><label>Estimated minutes<input className="text-input" type="number" min="1" max="1440" value={lesson.estimatedMinutes} onChange={event=>updateLesson(moduleIndex,lessonIndex,{estimatedMinutes:Number(event.target.value)})}/></label><label>Video URL<input className="text-input" type="url" value={lesson.videoUrl||""} onChange={event=>updateLesson(moduleIndex,lessonIndex,{videoUrl:event.target.value})}/></label></div>
          <label>Full lesson content<textarea className="text-input studio-content" rows="12" value={lesson.content} onChange={event=>updateLesson(moduleIndex,lessonIndex,{content:event.target.value})} maxLength={100000} placeholder={"# Heading\n\nWrite the complete lesson. Markdown, lists, tables, links, quotes and fenced code blocks are supported."}/></label>
          <label>Learning resources<textarea className="text-input" rows="2" placeholder="One HTTPS URL per line" value={(lesson.resources||[]).map(item=>item.url).join("\n")} onChange={event=>updateLesson(moduleIndex,lessonIndex,{resources:fromLines(event.target.value).map(url=>({title:url,type:"link",url}))})}/></label>
        </article>)}
        <button className="btn outline small" type="button" onClick={()=>updateModule(moduleIndex,{lessons:[...module.lessons,blankLesson(module.lessons.length)]})}><Plus size={14}/> Add lesson</button>
      </section>)}

      <div className="studio-section-heading"><div><h2>Quizzes and practice</h2><p>Correct answers stay private; short answers require instructor review.</p></div><button className="btn outline" type="button" onClick={()=>setForm({...form,quizzes:[...form.quizzes,{title:"",instructions:"",questions:[],passingScore:70,attemptLimit:3,published:false}]})}><Plus size={15}/> Add quiz</button></div>
      {form.quizzes.map((quiz,quizIndex)=><section className="studio-module" key={quiz._id||quizIndex}>
        <div className="studio-card-heading"><b>Quiz {quizIndex+1}</b><button className="icon-btn danger" type="button" aria-label="Remove quiz" onClick={()=>setForm({...form,quizzes:form.quizzes.filter((_,i)=>i!==quizIndex)})}><Trash2 size={15}/></button></div>
        <label>Quiz title<input className="text-input" value={quiz.title} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,title:event.target.value}:item)})} required/></label>
        <label>Instructions<textarea className="text-input" rows="2" value={quiz.instructions} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,instructions:event.target.value}:item)})}/></label>
        <div className="studio-grid"><label>Pass score (%)<input className="text-input" type="number" min="0" max="100" value={quiz.passingScore} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,passingScore:Number(event.target.value)}:item)})}/></label><label>Attempt limit<input className="text-input" type="number" min="1" max="20" value={quiz.attemptLimit} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,attemptLimit:Number(event.target.value)}:item)})}/></label><label className="studio-check"><input type="checkbox" checked={quiz.published} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,published:event.target.checked}:item)})}/> Published</label><label className="studio-check"><input type="checkbox" checked={quiz.showAnswers!==false} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,showAnswers:event.target.checked}:item)})}/> Show correct answers after grading</label></div>
        {quiz.questions.map((question,questionIndex)=><article className="studio-lesson" key={question._id||questionIndex}>
          <div className="studio-card-heading"><b>Question {questionIndex+1}</b><button className="icon-btn danger" type="button" aria-label="Remove question" onClick={()=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.filter((_,q)=>q!==questionIndex)}:item)})}><Trash2 size={14}/></button></div>
          <label>Prompt<textarea className="text-input" rows="2" value={question.prompt} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,prompt:event.target.value}:q)}:item)})} required/></label>
          <div className="studio-grid"><label>Question type<select className="text-input" value={question.type} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,type:event.target.value}:q)}:item)})}><option value="single_choice">Single choice</option><option value="multiple_select">Multiple select</option><option value="true_false">True or false</option><option value="fill_blank">Fill in the blank</option><option value="short_answer">Short answer (manual review)</option></select></label><label>Points<input className="text-input" type="number" min="1" max="100" value={question.points} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,points:Number(event.target.value)}:q)}:item)})}/></label></div>
          {["single_choice","multiple_select"].includes(question.type)&&<label>Options<textarea className="text-input" rows="3" value={asLines(question.options)} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,options:fromLines(event.target.value)}:q)}:item)})} required/></label>}
          {question.type==="true_false"&&<label>Correct answer<select className="text-input" value={question.correctAnswers[0]||"true"} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,correctAnswers:[event.target.value]}:q)}:item)})}><option value="true">True</option><option value="false">False</option></select></label>}
          {["single_choice","multiple_select","fill_blank"].includes(question.type)&&<label>Accepted answers<textarea className="text-input" rows="2" value={asLines(question.correctAnswers)} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,correctAnswers:fromLines(event.target.value)}:q)}:item)})} required/></label>}
          {question.type==="short_answer"&&<label>Instructor grading rubric<textarea className="text-input" rows="3" value={question.gradingRubric||""} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,gradingRubric:event.target.value}:q)}:item)})} required/></label>}
          <label>Explanation after grading<textarea className="text-input" rows="2" value={question.explanation} onChange={event=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:item.questions.map((q,index)=>index===questionIndex?{...q,explanation:event.target.value}:q)}:item)})}/></label>
        </article>)}
        <button className="btn outline small" type="button" onClick={()=>setForm({...form,quizzes:form.quizzes.map((item,i)=>i===quizIndex?{...item,questions:[...item.questions,blankQuestion(item.questions.length)]}:item)})}><Plus size={14}/> Add question</button>
      </section>)}
      <div className="studio-actions">{editing?<Link className="btn ghost" to={`/courses/${editing._id}`}>Preview</Link>:<span className="fineprint">Save this draft before previewing it.</span>}<button className="btn primary" disabled={busy}><Save size={15}/>{busy?"Saving...":editing?"Save changes":"Save as draft"}</button></div>
    </form>
  </Layout>;

  if(reviewing) return <ReviewQueue course={reviewing} onClose={()=>setReviewing(null)}/>;

  return <Layout>
    <div className="studio-heading"><div><span className="eyebrow">INSTRUCTOR WORKSPACE</span><h1>Course studio<em>.</em></h1><p>Create, organize, preview, and publish your learning content.</p></div><button className="btn primary" onClick={()=>openEditor()}><Plus size={16}/> Create course</button></div>
    {error&&<Notice type="error">{error}</Notice>}
    {success&&<Notice type="success">{success}</Notice>}
    <div className="studio-tabs"><label>Search<input className="text-input" value={filter.search} onChange={event=>setFilter({...filter,search:event.target.value})} placeholder="Search your courses"/></label><label>Status<select className="text-input" value={filter.status} onChange={event=>setFilter({...filter,status:event.target.value})}><option value="active">Active courses</option><option value="published">Published</option><option value="draft">Drafts</option><option value="archived">Archived</option><option value="all">All statuses</option></select></label></div>
    {user?.role==="admin"&&<section className="panel import-panel"><div><span className="eyebrow">ADMIN IMPORT</span><h2>Import courses from JSON</h2><p>Preview validates the file without saving. Import creates drafts and never overwrites a matching import key.</p></div><label className="btn outline"><FileUp size={15}/> Choose JSON file<input type="file" accept=".json,application/json" onChange={event=>{setImportFile(event.target.files?.[0]||null);setImportResult(null)}} hidden/></label>{importFile&&<div className="import-selected"><span>{importFile.name}</span><button className="btn outline small" onClick={previewImport} disabled={importBusy}>{importBusy?"Validating...":"Validate preview"}</button></div>}{importResult&&<div className="import-result"><b>{importResult.valid} valid · {importResult.errors?.length||0} errors · {importResult.imported||0} imported</b>{importResult.errors?.map((item,index)=><p key={index}>Course {item.course} · {item.path||"course"}: {item.message}</p>)}{importResult.valid>0&&!importResult.errors?.length&&<button className="btn primary small" onClick={confirmImport} disabled={importBusy}>{importBusy?"Importing...":"Import courses"}</button>}</div>}</section>}
    {loading?<Spinner label="Loading your courses..."/>:courses.length===0?<Empty title="Your course studio is ready" text="Create your first course and start shaping a learning experience."/>:<div className="studio-course-list">{courses.map(course=><article className="panel studio-course" key={course._id}><span className="studio-course-icon"><BookOpen/></span><div className="studio-course-main"><h2>{course.title}</h2><p>{course.category} · {course.modules?.length||0} modules · {course.lessons?.length||0} lessons</p><small>Updated {course.updatedAt?new Date(course.updatedAt).toLocaleDateString():"recently"}</small></div><span className={`status ${course.archived?"draft":course.published?"active":"draft"}`}>{course.archived?"Archived":course.published?"Published":"Draft"}</span><div className="studio-course-actions">{!course.archived&&<Link className="icon-btn" to={`/courses/${course._id}`} aria-label="Preview course"><Eye size={16}/></Link>}{course.quizzes?.some(quiz=>quiz.questions?.some(question=>question.type==="short_answer"))&&<button className="btn outline small" onClick={()=>setReviewing(course)}>Review responses</button>}<button className="icon-btn" onClick={()=>openEditor(course)} aria-label="Edit course"><Save size={16}/></button><button className="icon-btn" onClick={()=>duplicate(course)} aria-label="Duplicate course"><Copy size={16}/></button>{course.archived?<button className="btn outline small" onClick={()=>restore(course)}>Restore</button>:<><button className="btn outline small" onClick={()=>publish(course)}>{course.published?"Unpublish":"Publish"}</button><button className="icon-btn danger" onClick={()=>archive(course)} aria-label="Archive course"><Trash2 size={16}/></button></>}</div></article>)}</div>}
  </Layout>;
}

function ReviewQueue({course,onClose}) {
  const [attempts,setAttempts]=useState([]);
  const [grades,setGrades]=useState({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load() {
    setLoading(true);
    try {
      const response=await courseApi.pendingAssessments(course._id);
      setAttempts(response.attempts||[]);
      setError("");
    } catch(error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(()=>{load()},[course._id]);

  function updateGrade(attemptId,questionId,changes) {
    const key=`${attemptId}:${questionId}`;
    setGrades(current=>({...current,[key]:{...current[key],...changes}}));
  }
  async function submitReview(item) {
    setBusy(item.attempt._id);
    setError("");
    try {
      const gradeItems=item.questions.filter(question=>question.reviewable).map(question=>{
        const values=grades[`${item.attempt._id}:${question.questionId}`]||{};
        return {
          questionId:question.questionId,
          pointsEarned:Number(values.pointsEarned??0),
          feedback:values.feedback||""
        };
      });
      await courseApi.reviewAssessment(course._id,item.quizId,item.attempt._id,gradeItems);
      setSuccess("Assessment reviewed and score saved.");
      await load();
    } catch(error) {
      setError(error.message);
    } finally {
      setBusy("");
    }
  }

  return <Layout>
    <div className="studio-heading">
      <div><span className="eyebrow">INSTRUCTOR WORKSPACE</span><h1>Assessment review<em>.</em></h1><p>{course.title}</p></div>
      <button className="btn outline" onClick={onClose}>Back to courses</button>
    </div>
    {error&&<Notice type="error">{error}</Notice>}
    {success&&<Notice type="success" onClose={()=>setSuccess("")}>{success}</Notice>}
    {loading?<Spinner label="Loading responses..."/>:attempts.length===0?<Empty title="No responses waiting for review" text="Short-answer submissions will appear here when students complete your quizzes."/>:
      <div className="review-queue">{attempts.map(item=><article className="panel review-card" key={item.attempt._id}>
        <div className="review-card-heading"><div><h2>{item.quizTitle}</h2><small>Submitted {new Date(item.attempt.createdAt).toLocaleString()}</small></div><span>{item.attempt.answers.length} answers</span></div>
        {item.questions.filter(question=>question.reviewable).map(question=>{
          const values=grades[`${item.attempt._id}:${question.questionId}`]||{};
          return <section className="review-answer" key={question.questionId}>
            <h3>{question.prompt}</h3>
            <blockquote>{question.answer||"No answer provided."}</blockquote>
            {question.gradingRubric&&<p><b>Rubric:</b> {question.gradingRubric}</p>}
            <div className="studio-grid">
              <label>Points earned (maximum {question.pointsPossible})
                <input className="text-input" type="number" min="0" max={question.pointsPossible} step="1" required
                  value={values.pointsEarned??0} onChange={event=>updateGrade(item.attempt._id,question.questionId,{pointsEarned:event.target.value})}/>
              </label>
              <label>Feedback
                <textarea className="text-input" rows="2" maxLength="2000" value={values.feedback||""}
                  onChange={event=>updateGrade(item.attempt._id,question.questionId,{feedback:event.target.value})}/>
              </label>
            </div>
          </section>;
        })}
        <button className="btn primary" disabled={busy===item.attempt._id||!item.questions.some(question=>question.reviewable)} onClick={()=>submitReview(item)}>
          {busy===item.attempt._id?"Saving review...":"Save review"}
        </button>
      </article>)}</div>}
  </Layout>;
}
