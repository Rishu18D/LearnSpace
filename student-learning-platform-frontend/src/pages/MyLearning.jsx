import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { Empty, Notice, Spinner } from "../components/UI";
import { courseApi, enrollmentApi, progressApi } from "../lib/api";
import { getPublishedLessons } from "../lib/courseContent";
import "./MyLearning.css";

const pageSize = 20;
const filters = [
  ["active", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["all", "All courses"]
];

function PageHeading({ title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">YOUR PERSONAL LEARNING PATH</span>
        <h1>{title}<em>.</em></h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function statusLabel(status) {
  return status === "active" ? "In progress" : status;
}

export default function MyLearning() {
  const [filter, setFilter] = useState("active");
  const [items, setItems] = useState([]);
  const [courses, setCourses] = useState({});
  const [progress, setProgress] = useState({});
  const [progressAvailable, setProgressAvailable] = useState(true);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [partialError, setPartialError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    let live = true;
    requestGeneration.current += 1;

    async function load() {
      setLoading(true);
      setLoadingMore(false);
      setItems([]);
      setCourses({});
      setSummary(null);
      setTotal(0);
      setPage(1);
      setPages(1);
      setError("");
      setPartialError("");
      try {
        const params = { page: 1, limit: pageSize };
        if (filter !== "all") params.status = filter;
        const result = await enrollmentApi.mine(params);
        if (!live) return;

        const enrollments = Array.isArray(result.enrollments) ? result.enrollments : [];
        setTotal(result.pagination?.total ?? enrollments.length);
        setPage(1);
        setPages(result.pagination?.pages ?? 1);

        const settled = await Promise.allSettled([
          progressApi.mine(),
          enrollmentApi.summary(),
          ...enrollments.map(enrollment => courseApi.get(enrollment.courseId))
        ]);
        if (!live) return;

        const messages = [];
        let nextProgress = {};
        const progressResult = settled[0];
        if (progressResult.status === "fulfilled" && Array.isArray(progressResult.value.progress)) {
          progressResult.value.progress.forEach(entry => {
            if (!entry.completed) return;
            const courseId = String(entry.courseId);
            if (!nextProgress[courseId]) nextProgress[courseId] = new Set();
            nextProgress[courseId].add(String(entry.lessonId));
          });
          setProgress(nextProgress);
          setProgressAvailable(true);
        } else {
          setProgress({});
          setProgressAvailable(false);
          messages.push("Learning progress could not be loaded.");
        }

        const summaryResult = settled[1];
        if (summaryResult.status === "fulfilled") {
          setSummary(summaryResult.value.summary);
        } else {
          setSummary(null);
          messages.push("Course totals could not be loaded.");
        }

        const nextCourses = {};
        settled.slice(2).forEach((courseResult, index) => {
          if (courseResult.status === "fulfilled" && courseResult.value?.course) {
            nextCourses[String(enrollments[index].courseId)] = courseResult.value.course;
          } else {
            messages.push("Some course details are unavailable.");
          }
        });
        const alreadyComplete = enrollments.filter(enrollment => {
          if(enrollment.status!=="active")return false;
          const course=nextCourses[String(enrollment.courseId)];
          const lessons=getPublishedLessons(course);
          const done=nextProgress[String(enrollment.courseId)]||new Set();
          return lessons.length>0&&lessons.every(lesson=>done.has(String(lesson._id)));
        });
        const completionResults=await Promise.allSettled(alreadyComplete.map(enrollment=>enrollmentApi.complete(enrollment._id)));
        const completedEnrollmentIds=new Set();
        completionResults.forEach((completion,index)=>{
          if(completion.status==="fulfilled")completedEnrollmentIds.add(String(alreadyComplete[index]._id));
          else messages.push("All lessons are complete for a course, but its enrollment status could not be updated. Refresh or try again.");
        });
        const refreshedItems=enrollments
          .filter(enrollment=>filter!=="active"||!completedEnrollmentIds.has(String(enrollment._id)))
          .map(enrollment=>completedEnrollmentIds.has(String(enrollment._id))
            ? {...enrollment,status:"completed",completedAt:completionResults[alreadyComplete.findIndex(item=>String(item._id)===String(enrollment._id))].value.enrollment.completedAt}
            : enrollment);
        setItems(refreshedItems);
        setTotal(current=>Math.max(0,current-(filter==="active"?completedEnrollmentIds.size:0)));
        if(completedEnrollmentIds.size) {
          setSummary(summaryResult=>summaryResult?{
            ...summaryResult,
            active:Math.max(0,summaryResult.active-completedEnrollmentIds.size),
            completed:summaryResult.completed+completedEnrollmentIds.size
          }:summaryResult);
        }
        setCourses(nextCourses);
        setPartialError([...new Set(messages)].join(" "));
      } catch (requestError) {
        if (live) setError(requestError.message);
      } finally {
        if (live) setLoading(false);
      }
    }

    load();
    return () => { live = false; };
  }, [filter, retry]);

  async function loadMore() {
    const generation = requestGeneration.current;
    setLoadingMore(true);
    setError("");
    try {
      const params = { page: page + 1, limit: pageSize };
      if (filter !== "all") params.status = filter;
      const result = await enrollmentApi.mine(params);
      const enrollments = Array.isArray(result.enrollments) ? result.enrollments : [];
      const settledCourses = await Promise.allSettled(enrollments.map(enrollment => courseApi.get(enrollment.courseId)));
      if (generation !== requestGeneration.current) return;
      const nextCourses = {};
      settledCourses.forEach((courseResult, index) => {
        if (courseResult.status === "fulfilled" && courseResult.value?.course) {
          nextCourses[String(enrollments[index].courseId)] = courseResult.value.course;
        }
      });
      setItems(current => [...current, ...enrollments]);
      setCourses(current => ({ ...current, ...nextCourses }));
      setTotal(result.pagination?.total ?? total);
      setPage(result.pagination?.page ?? page + 1);
      setPages(result.pagination?.pages ?? pages);
      if (settledCourses.some(courseResult => courseResult.status === "rejected")) {
        setPartialError("Some course details are unavailable.");
      }
    } catch (requestError) {
      if (generation === requestGeneration.current) setError(requestError.message);
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  async function cancelEnrollment(enrollment) {
    if (!window.confirm("Cancel this enrollment? You can enroll again later.")) return;
    setBusyId(String(enrollment._id));
    setError("");
    try {
      await enrollmentApi.cancel(enrollment._id);
      if (filter === "all") {
        setItems(current => current.map(item => item._id === enrollment._id ? { ...item, status: "cancelled" } : item));
      } else {
        setItems(current => current.filter(item => item._id !== enrollment._id));
        setTotal(current => Math.max(0, current - 1));
      }
      setSummary(current => current ? {
        ...current,
        active: Math.max(0, current.active - 1),
        cancelled: current.cancelled + 1
      } : current);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId("");
    }
  }

  const counts = {
    active: summary?.active ?? (filter === "active" ? total : null),
    completed: summary?.completed ?? (filter === "completed" ? total : null),
    cancelled: summary?.cancelled ?? (filter === "cancelled" ? total : null),
    all: summary?.total ?? (filter === "all" ? total : null)
  };

  return (
    <Layout>
      <PageHeading
        title="My learning"
        subtitle="Your courses, progress, and next steps in one place."
        action={<Link className="btn primary" to="/courses"><BookOpen size={16} /> Find a course</Link>}
      />
      <div className="tabs learning-tabs" aria-label="Filter enrollments">
        {filters.map(([value, label]) => (
          <button
            type="button"
            aria-pressed={filter === value}
            className={filter === value ? "selected" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}<small>{counts[value] ?? "—"}</small>
          </button>
        ))}
        <button className="btn outline learning-refresh" type="button" onClick={() => setRetry(value => value + 1)} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {error && <><Notice type="error">{error}</Notice><button className="btn outline" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
      {partialError && <Notice type="info">{partialError}</Notice>}
      {loading ? <Spinner label="Loading your courses and progress..." /> : error && items.length === 0 ? null : items.length === 0 ? (
        <Empty
          title={filter === "active" ? "Your learning journey starts here" : `No ${filter === "all" ? "" : `${filter} `}courses yet`}
          text={filter === "active" ? "Choose a course and make your first move." : "Your courses will appear here when you have activity in this category."}
          action="Explore courses"
        />
      ) : (
        <>
          <div className="my-list">
            {items.map(enrollment => {
              const courseId = String(enrollment.courseId);
              const course = courses[courseId];
              const completedIds = progress[courseId] || new Set();
              const lessonCount = getPublishedLessons(course).length;
              const completedCount = Math.min(completedIds.size, lessonCount);
              const percent = lessonCount ? Math.round(completedCount / lessonCount * 100) : 0;

              return (
                <article className="my-card" key={enrollment._id}>
                  <div className="my-art" aria-hidden="true"><BookOpen size={26} /></div>
                  <div className="my-info">
                    <div className="meta">
                      <span className={`level ${course?.level || "beginner"}`}>{course?.level || "Course"}</span>
                      <span className={`status ${enrollment.status}`}>{statusLabel(enrollment.status)}</span>
                    </div>
                    <h2>{course?.title || `Course ${courseId.slice(-6)}`}</h2>
                    <p>{course?.description || "Course details are currently unavailable."}</p>
                    {course && progressAvailable && (
                      <>
                        <div className="progress-label">
                          <span>{completedCount} of {lessonCount} lessons completed</span>
                          <b>{percent}%</b>
                        </div>
                        <div className="track" role="progressbar" aria-label={`${course.title} lesson progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
                          <i style={{ width: `${percent}%` }} />
                        </div>
                      </>
                    )}
                    <div className="my-actions">
                      {course && enrollment.status === "active" && (
                        <Link className="inline-link" to={`/courses/${course._id}/learn`}>Continue learning <ArrowRight size={15} /></Link>
                      )}
                      {enrollment.status === "active" && (
                        <button
                          className="text-btn danger"
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => cancelEnrollment(enrollment)}
                        >
                          {busyId === String(enrollment._id) ? "Cancelling..." : "Cancel enrollment"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {page < pages && (
            <div className="learning-more">
              <button className="btn outline" type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading..." : `Load more courses (${Math.max(0, total - items.length)} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
