import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Compass, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { CourseCard, Empty, Notice, Spinner } from "../components/UI";
import { courseApi, enrollmentApi, notificationApi, progressApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { getPublishedLessons } from "../lib/courseContent";

function Heading({ kicker, title, subtitle, action }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{kicker}</span>
        <h1>{title}<em>.</em></h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Section({ title, kicker, link, linkText }) {
  return (
    <div className="section-head">
      <div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>
      {link && <Link to={link} className="inline-link">{linkText} <ArrowRight size={15} /></Link>}
    </div>
  );
}

function Stat({ icon: Icon, label, value, foot }) {
  return (
    <article className="stat">
      <span className="stat-icon"><Icon size={19} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{foot}</p>
    </article>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState({
    courses: [],
    enrollments: [],
    summary: null,
    progress: 0,
    unread: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      const results = await Promise.allSettled([
        courseApi.list({ limit: 3 }),
        enrollmentApi.summary(),
        enrollmentApi.mine({ status: "active", limit: 4 }),
        enrollmentApi.mine({ status: "completed", limit: 4 }),
        progressApi.mine(),
        notificationApi.list({ limit: 1 })
      ]);
      if (!live) return;

      const [courseResult, summaryResult, activeResult, completedResult, progressResult, notificationResult] = results;
      const enrollments = [
        ...(activeResult.status === "fulfilled" ? activeResult.value.enrollments || [] : []),
        ...(completedResult.status === "fulfilled" ? completedResult.value.enrollments || [] : [])
      ].sort((a, b) => new Date(b.completedAt || b.enrolledAt || b.createdAt) - new Date(a.completedAt || a.enrolledAt || a.createdAt));
      const courseResults = await Promise.allSettled(enrollments.map(item => courseApi.get(item.courseId)));
      if (!live) return;
      const coursesById = {};
      courseResults.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value?.course) {
          coursesById[String(enrollments[index].courseId)] = result.value.course;
        }
      });
      const completedLessons = new Map();
      if (progressResult.status === "fulfilled") {
        (progressResult.value.progress || []).filter(item => item.completed).forEach(item => {
          const courseId = String(item.courseId);
          if (!completedLessons.has(courseId)) completedLessons.set(courseId, new Set());
          completedLessons.get(courseId).add(String(item.lessonId));
        });
      }
      const completionCandidates = enrollments.filter(enrollment => {
        if (enrollment.status !== "active") return false;
        const lessons = getPublishedLessons(coursesById[String(enrollment.courseId)]);
        const done = completedLessons.get(String(enrollment.courseId)) || new Set();
        return lessons.length > 0 && lessons.every(lesson => done.has(String(lesson._id)));
      });
      const completionResults = await Promise.allSettled(
        completionCandidates.map(enrollment => enrollmentApi.complete(enrollment._id))
      );
      if (!live) return;
      const completedEnrollmentMap = new Map();
      completionResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          completedEnrollmentMap.set(String(completionCandidates[index]._id), result.value.enrollment);
        }
      });
      const refreshedEnrollments = enrollments.map(enrollment => ({
        ...enrollment,
        ...(completedEnrollmentMap.get(String(enrollment._id)) || {})
      }));
      const statusSummary = summaryResult.status === "fulfilled" ? summaryResult.value.summary : null;
      if (statusSummary && completedEnrollmentMap.size) {
        statusSummary.active = Math.max(0, statusSummary.active - completedEnrollmentMap.size);
        statusSummary.completed += completedEnrollmentMap.size;
      }

      setData({
        courses: courseResult.status === "fulfilled" ? courseResult.value.courses || [] : [],
        summary: statusSummary,
        enrollments: refreshedEnrollments.map(enrollment => ({
          ...enrollment,
          course: coursesById[String(enrollment.courseId)] || null
        })),
        progress: progressResult.status === "fulfilled" ? progressResult.value.completedLessons || 0 : null,
        unread: notificationResult.status === "fulfilled" ? notificationResult.value.unread || 0 : null
      });
      if (results.every(result => result.status === "rejected")) {
        setError("Overview data could not be loaded. Check your connection and try again.");
      }
      setLoading(false);
    }

    load();
    return () => { live = false; };
  }, [retry]);

  const activeCount = data.summary?.active ?? data.enrollments.filter(item => item.status === "active").length;
  const name = (user?.name || "learner").trim().split(/\s+/)[0] || "learner";

  return (
    <Layout>
      <Heading
        kicker="YOUR LEARNING OVERVIEW"
        title={`Good ${greeting()}, ${name}`}
        subtitle="Every small step counts. Here's where your learning stands."
        action={<Link className="btn primary" to="/courses"><Compass size={16} /> Explore courses</Link>}
      />
      {error && <><Notice type="error">{error}</Notice><button className="btn outline" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
      {loading ? <Spinner label="Gathering your learning overview..." /> : (
        <>
          <div className="stats">
            <Stat icon={BookOpen} label="Active courses" value={activeCount} foot="Your current learning paths" />
            <Stat icon={CheckCircle2} label="Lessons completed" value={data.progress ?? "—"} foot="Every lesson moves you forward" />
            <Stat icon={Flame} label="Unread updates" value={data.unread ?? "—"} foot="Keep up with your activity" />
          </div>
          <Section title="Your learning" kicker="PICK UP THE PACE" link="/my-learning" linkText="View all" />
          {data.enrollments.length === 0 ? (
            <div className="soft-empty">
              <BookOpen />
              <div><b>Your learning space is ready.</b><p>Enroll in a course to start building progress.</p></div>
              <Link className="btn outline" to="/courses">Find a course <ArrowRight size={15} /></Link>
            </div>
          ) : (
            <div className="rows">
              {data.enrollments.slice(0, 4).map(enrollment => {
                const course = enrollment.course;
                const status = enrollment.status;
                return (
                  <div className="simple-row" key={enrollment._id}>
                    <span className="row-icon"><BookOpen /></span>
                    <div>
                      <b>{course?.title || "Course details unavailable"}</b>
                      <small>{status === "completed" ? "Completed" : "Enrolled"} {new Date(enrollment.completedAt || enrollment.enrolledAt || enrollment.createdAt).toLocaleDateString()}</small>
                    </div>
                    <span className={`status ${status}`}>{status === "active" ? "In progress" : status === "completed" ? "Completed" : "Cancelled"}</span>
                    <Link aria-label={`View ${course?.title || "course"} in My learning`} to="/my-learning"><ArrowRight size={16} /></Link>
                  </div>
                );
              })}
            </div>
          )}
          <Section title="Explore something new" kicker="CURATED FOR YOUR CURIOSITY" link="/courses" linkText="All courses" />
          {data.courses.length
            ? <div className="course-grid">{data.courses.map((course, index) => <CourseCard key={course._id} course={course} index={index} />)}</div>
            : <Empty title="Your next course is waiting" text="Published courses will appear here." action="Browse courses" />}
          <div className="quote"><span>✦</span><div><b>Consistency beats intensity.</b><p>You don't need a perfect study session. Just begin with the next small step.</p></div></div>
        </>
      )}
    </Layout>
  );
}
