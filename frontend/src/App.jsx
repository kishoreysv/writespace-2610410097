/** @module App Compose discovery, identity, guarded reading, authoring and administration; main.jsx owns the router. */
import { useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Home from './pages/Home';
import ReadBlog from './pages/ReadBlog';
import WriteBlog from './pages/WriteBlog';
import EditBlog from './pages/EditBlog';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { getSession } from './utils/auth';

/** Explain unmatched routes without pretending an unbuilt feature exists.
 * @returns {import('react').ReactElement} Useful not-found destination.
 */
function NotFound() {
  const location = useLocation();
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="mb-5 font-display text-4xl font-bold">
        Page not found
      </h1>
      <p className="mb-3 text-lg text-slate-600">
        The requested page is not available. Return home to explore WriteSpace.
      </p>
      <p className="mb-8 break-words text-slate-600">
        Requested path: {location.pathname}
      </p>
      <Link to="/" className="button-primary">
        Back to Home
      </Link>
    </main>
  );
}

/** Restore validated identity before rendering routes, without a guest flash.
 * @returns {import('react').ReactElement} Implemented routes and guarded catch-all.
 */
export default function App() {
  const [session, setSession] = useState(getSession);
  // Discovery's existing presentation interface uses "Admin"; stored identity does not.
  const landingSession = session?.role === 'admin' ? { ...session, role: 'Admin' } : session;
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route
          path="/"
          element={<LandingPage session={landingSession} onSessionChange={setSession} />}
        />
        <Route
          path="/login"
          element={<LoginPage session={session} onSessionChange={setSession} />}
        />
        <Route
          path="/register"
          element={<RegisterPage session={session} onSessionChange={setSession} />}
        />
        <Route
          path="/blogs"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/blog/:id"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <ReadBlog session={session} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/write"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <WriteBlog session={session} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit/:id"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <EditBlog session={session} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <AdminDashboard session={session} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <UserManagement session={session} />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute session={session}>
              <Navbar session={session} onSessionChange={setSession} />
              <NotFound />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
