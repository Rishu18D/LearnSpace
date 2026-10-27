import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./UI";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const links = [
    ["/dashboard", "Overview", LayoutDashboard],
    ["/courses", "Explore courses", Compass],
    ["/my-learning", "My learning", BookOpen],
    ["/notifications", "Notifications", Bell],
    ["/profile", "My profile", UserRound],
    ...(user?.role === "instructor" || user?.role === "admin"
      ? [["/manage-courses", "Manage courses", GraduationCap], ["/analytics", "Analytics", ChartNoAxesCombined]]
      : [])
  ];
  const initials = (user?.name || user?.email || "LS")
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function signout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation menu" />}
      <aside className={`sidebar ${open ? "open" : ""}`} id="primary-navigation">
        <div className="side-logo"><Logo /></div>
        <small className="side-label">WORKSPACE</small>
        <nav aria-label="Workspace navigation">
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon size={18} aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="tip"><b>✦ Small steps, big growth.</b><p>A little learning every day adds up.</p></div>
          <div className="side-user">
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span><b>{user?.name || "Learner"}</b><small>{user?.role || "student"}</small></span>
            <button type="button" title="Sign out" aria-label="Sign out" onClick={signout}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open navigation menu" aria-controls="primary-navigation" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={21} />
          </button>
          <span>Workspace <b>/</b> Learning</span>
          <button className="avatar" type="button" aria-label="Open your profile" onClick={() => navigate("/profile")}>{initials}</button>
        </header>
        <main className="content" id="main-content">{children ?? <Outlet />}</main>
        <footer>© {new Date().getFullYear()} Learnspace <span>Built for curious minds ✦</span></footer>
      </div>
    </div>
  );
}
