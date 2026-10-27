import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Compass,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  TrendingUp,
  UserRound
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo, Notice } from "../components/UI";
import { authApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="public-nav wrap">
        <Logo />
        <nav aria-label="Main navigation">
          <a href="#features">Why Learnspace</a>
          <Link to="/courses">Explore courses</Link>
        </nav>
        <div>
          <Link className="btn ghost" to="/login">Log in</Link>
          <Link className="btn primary" to="/register">Get started <ArrowRight size={16} /></Link>
        </div>
      </header>
      <main id="main-content">
        <section className="hero wrap">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> YOUR SPACE TO GROW</span>
            <h1>Make room for<br /><em>what&apos;s next.</em></h1>
            <p>A calmer, clearer place to learn new skills, keep your momentum, and turn curiosity into progress.</p>
            <div className="hero-actions">
              <Link className="btn primary big" to="/register">Start learning <ArrowRight size={17} /></Link>
              <Link className="btn ghost big" to="/courses">Browse courses</Link>
            </div>
            <div className="hero-proof">
              <span aria-hidden="true">✦</span>
              <div><b>Your learning journey</b><small>One lesson at a time.</small></div>
            </div>
          </div>
          <div className="hero-visual" role="img" aria-label="Illustration of a sample Learnspace learning dashboard">
            <div className="mock" aria-hidden="true">
              <div className="mock-top">● ● ● <small>LEARNING DASHBOARD PREVIEW</small></div>
              <span className="eyebrow">MONDAY, YOUR WAY</span>
              <h2>A little progress<br />goes a long way.</h2>
              <div className="mock-progress">
                <div><span>Weekly goal</span><b>4 of 5 lessons</b></div>
                <div className="track"><i style={{ width: "80%" }} /></div>
                <small>Illustrative progress preview</small>
              </div>
              <div className="mock-row">
                <span className="mock-icon"><BookOpen /></span>
                <div><b>Foundations of web</b><small>Continue where you left off</small></div>
                <ArrowRight />
              </div>
              <div className="mock-row">
                <span className="mock-icon peach"><TrendingUp /></span>
                <div><b>Think in data</b><small>Next in your learning path</small></div>
                <ArrowRight />
              </div>
            </div>
            <div className="float-note" aria-hidden="true"><b>✓ Progress saved</b><small>You&apos;re moving forward</small></div>
          </div>
        </section>
        <section className="features" id="features">
          <div className="wrap">
            <span className="eyebrow">LEARNING, MADE HUMAN</span>
            <h2>Less noise. More <em>forward motion.</em></h2>
            <p>Everything you need to make your learning time count.</p>
            <div className="feature-grid">
              {[
                [Compass, "Find your next skill", "Explore a growing catalogue of focused, self-paced courses."],
                [TrendingUp, "See your progress", "Keep track of completed lessons and learning momentum."],
                [BookOpen, "Learn on your terms", "Build a learning routine that fits the way you work."]
              ].map(([Icon, title, description]) => (
                <article key={title}>
                  <span><Icon size={22} /></span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="cta wrap">
          <div>
            <span className="eyebrow">YOUR FUTURE IS BUILT DAILY</span>
            <h2>Start with one good lesson.</h2>
            <p>Make your next hour a little more meaningful.</p>
          </div>
          <Link className="btn light big" to="/register">Create your free account <ArrowRight size={17} /></Link>
        </section>
      </main>
      <footer className="public-footer wrap">
        <Logo />
        <span>© {new Date().getFullYear()} Learnspace. Keep growing.</span>
      </footer>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div className="auth">
      <a className="skip-link" href="#main-content">Skip to sign in form</a>
      <aside>
        <Logo />
        <div>
          <span className="eyebrow">YOUR SPACE TO GROW</span>
          <h1>Progress is built<br />one <em>step at a time.</em></h1>
          <p>Find a rhythm that works for you. Learn something today that your future self will thank you for.</p>
          <ol>
            <li>01 &nbsp; Choose a course</li>
            <li>02 &nbsp; Learn at your pace</li>
            <li>03 &nbsp; Track your progress</li>
          </ol>
        </div>
        <small>© {new Date().getFullYear()} Learnspace · Made for lifelong learners</small>
      </aside>
      <main id="main-content">
        <div className="auth-mobile"><Logo /></div>
        <section className="auth-card">{children}<Link className="back-home" to="/">← Back to home</Link></section>
      </main>
    </div>
  );
}

export function Login() {
  const { saveSession, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await authApi.login({ email: email.trim(), password });
      saveSession(session);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <span className="eyebrow">WELCOME BACK</span>
      <h2>Good to see you.</h2>
      <p className="auth-sub">Pick up where your curiosity left off.</p>
      {error && <Notice type="error">{error}</Notice>}
      <form onSubmit={submit} className="form">
        <label htmlFor="login-email">Email address</label>
        <div className="field">
          <Mail size={17} aria-hidden="true" />
          <input id="login-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required />
        </div>
        <div className="label-row"><label htmlFor="login-password">Password</label></div>
        <p className="auth-note">Forgot your password? Contact your platform administrator; self-service password recovery is not available yet.</p>
        <div className="field">
          <LockKeyhole size={17} aria-hidden="true" />
          <input id="login-password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button className="btn primary full big" disabled={busy}>{busy ? "Signing you in..." : "Log in to Learnspace"} <ArrowRight size={17} /></button>
      </form>
      <p className="auth-switch">New to Learnspace? <Link to="/register">Create an account</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const { saveSession, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState("student");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Your passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      const session = await authApi.register({ name: name.trim(), email: email.trim(), password, role });
      saveSession(session);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <span className="eyebrow">YOUR NEXT CHAPTER</span>
      <h2>Create your account.</h2>
      <p className="auth-sub">Join Learnspace to learn or teach.</p>
      {error && <Notice type="error">{error}</Notice>}
      <form onSubmit={submit} className="form">
        <label htmlFor="register-name">Full name</label>
        <div className="field">
          <UserRound size={17} aria-hidden="true" />
          <input id="register-name" autoComplete="name" placeholder="How should we call you?" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} required />
        </div>
        <label htmlFor="register-email">Email address</label>
        <div className="field">
          <Mail size={17} aria-hidden="true" />
          <input id="register-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} required />
        </div>
        <label htmlFor="register-role">Account type</label>
        <select id="register-role" className="text-input" value={role} onChange={event => setRole(event.target.value)}>
          <option value="student">Student — explore and learn</option>
          <option value="instructor">Teacher — create and publish courses</option>
        </select>
        <label htmlFor="register-password">Password <small>10 characters minimum</small></label>
        <div className="field">
          <LockKeyhole size={17} aria-hidden="true" />
          <input id="register-password" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Create a strong password" value={password} onChange={event => setPassword(event.target.value)} minLength={10} maxLength={72} required />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <label htmlFor="register-confirm">Confirm password</label>
        <div className="field">
          <LockKeyhole size={17} aria-hidden="true" />
          <input id="register-confirm" type={show ? "text" : "password"} autoComplete="new-password" placeholder="Enter password again" value={confirm} onChange={event => setConfirm(event.target.value)} maxLength={72} required />
        </div>
        <button className="btn primary full big" disabled={busy}>{busy ? "Creating account..." : role === "instructor" ? "Create teacher account" : "Create student account"} <ArrowRight size={17} /></button>
        <small className="legal">{role === "instructor" ? "Teacher accounts can create, publish, and manage courses." : "Student accounts can explore courses and track learning progress."}</small>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthShell>
  );
}
