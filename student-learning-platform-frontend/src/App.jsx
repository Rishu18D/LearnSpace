import { Component } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { Landing, Login, Register } from "./pages/PublicPages";
import { Analytics, Courses, Dashboard, MyLearning, Notifications, Profile } from "./pages/LearningPages";
import CourseStudio from "./pages/CourseStudio";
import CourseLearning from "./pages/CourseLearning";
import CourseOverview from "./pages/CourseOverview";

class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="not-found" role="alert">
          <h1>We hit an unexpected error.</h1>
          <p>Reload the page to try again. Any work that has not been saved may be lost.</p>
          <button className="btn primary" type="button" onClick={() => window.location.reload()}>Reload page</button>
          <Link className="back-home" to="/">Back to home</Link>
        </main>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <main className="not-found">
      <b>404</b>
      <h1>This page wandered off.</h1>
      <p>That link doesn&apos;t lead to a learning path we can find.</p>
      <Link className="btn primary" to="/">Back to home</Link>
    </main>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseOverview />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-learning" element={<MyLearning />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/courses/:id/learn" element={<CourseLearning />} />
        </Route>
        <Route element={<ProtectedRoute roles={["instructor", "admin"]} />}>
          <Route path="/manage-courses" element={<CourseStudio />} />
          <Route path="/analytics" element={<Analytics />} />
        </Route>
        <Route path="/home" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppErrorBoundary>
  );
}
