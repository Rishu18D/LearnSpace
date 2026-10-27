import { AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, Info } from "lucide-react";
import { Link } from "react-router-dom";

export function Logo() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark" aria-hidden="true"><BookOpen size={20} /></span>
      <span>learn<span>space</span></span>
    </Link>
  );
}

export function Spinner({ label = "Loading..." }) {
  return <div className="loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function Notice({ type = "info", children, onClose }) {
  const Icon = type === "error" ? AlertCircle : type === "success" ? CheckCircle2 : Info;
  return (
    <div className={`notice ${type}`} role={type === "error" ? "alert" : "status"} aria-live={type === "error" ? "assertive" : "polite"}>
      <Icon size={18} aria-hidden="true" />
      <span>{children}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss notification">×</button>}
    </div>
  );
}

export function Empty({ title = "Nothing here yet", text = "Your activity will appear here.", action, to = "/courses" }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true"><BookOpen size={25} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <Link className="btn primary" to={to}>{action}<ArrowUpRight size={16} /></Link>}
    </div>
  );
}

export function CourseCard({ course, index = 0, enrolled = false }) {
  const colors = ["art-purple", "art-peach", "art-mint", "art-blue", "art-lilac"];
  const coursePath = `/courses/${course._id || course.slug}`;
  return (
    <article className="course-card">
      <Link className={`course-art ${colors[index % colors.length]}`} to={coursePath} aria-label={`View ${course.title}`}>
        <span aria-hidden="true">{["✳", "⌘", "◈", "∑", "✦"][index % 5]}</span>
        <small>{course.category || "Learning path"}</small>
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
      <div className="course-body">
        <div className="meta"><span className={`level ${course.level || "beginner"}`}>{course.level || "beginner"}</span><small>{course.category}</small></div>
        <h3><Link to={coursePath}>{course.title}</Link></h3>
        <p>{course.description}</p>
        <div className="card-foot">
          <span><BookOpen size={14} aria-hidden="true" />{course.lessons?.length || 0} lessons</span>
          <span>{enrolled ? "Enrolled" : "Self-paced"}</span>
        </div>
      </div>
    </article>
  );
}
