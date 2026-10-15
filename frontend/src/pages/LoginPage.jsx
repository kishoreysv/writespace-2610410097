/** @module LoginPage Explicit browser-local demo sign-in, never a network identity service. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { authenticate } from '../utils/auth';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicNavbar } from '../components/PublicNavbar';

/** Present a labeled form and navigate only after the session write succeeds.
 * @param {{session?: object|null, onSessionChange: Function}} props Current identity and App setter.
 * @returns {import('react').ReactElement} Guest-only sign-in form.
 */
export default function LoginPage({ session = null, onSessionChange }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  /** Focus the announced error after a failed explicit submission. */
  useEffect(() => {
    if (result && !result.ok) document.getElementById('login-error')?.focus();
  }, [result]);

  /** Submit exact password and normalized username to the local boundary.
   * @param {import('react').FormEvent} event Explicit form submission.
   */
  function handleSubmit(event) {
    event.preventDefault();
    const next = authenticate(username, password);
    setResult(next);
    if (next.ok) {
      onSessionChange(next.session);
      navigate(next.navigateTo, { replace: true });
    }
  }

  const failed = Boolean(result && !result.ok);
  return (
    <ProtectedRoute session={session}>
      <PublicNavbar />
      <main id="main-content" className="mx-auto max-w-lg px-6 py-12 md:py-20">
        <Link to="/" className="mb-6 inline-block font-semibold text-primary-700">
          Back to Home
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8" aria-labelledby="login-title">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary-700">
            Your local writing space
          </p>
          <h1 id="login-title" className="mb-4 text-4xl font-bold">
            Login
          </h1>
          <p id="login-warning" className="mb-6 text-slate-600">
            Browser-local demo only. Passwords are stored in plaintext. Do not use a real password or sensitive data. Nothing is synced or sent to a server.
          </p>
          <p className="mb-6 rounded-xl bg-slate-100 p-4 text-slate-700">
            Demo administrator: username admin / password admin.
          </p>
          <form noValidate onSubmit={handleSubmit} aria-describedby="login-warning" className="space-y-5">
            {failed && (
              <p id="login-error" role="alert" tabIndex={-1} className="rounded-xl bg-red-50 p-4 text-red-700">
                {result.error}
              </p>
            )}
            <div>
              <label htmlFor="login-username" className="mb-2 block font-semibold">
                Username
              </label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                required
                aria-required="true"
                aria-invalid={failed}
                aria-describedby={failed ? 'login-error' : undefined}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block font-semibold">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-required="true"
                aria-invalid={failed}
                aria-describedby={failed ? 'login-error' : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </div>
            <button type="submit" className="button-primary w-full">
              Login
            </button>
          </form>
          <p className="mt-6 text-slate-600">
            New here?{' '}
            <Link to="/register" className="font-semibold text-primary-700">
              Create an account
            </Link>
          </p>
        </section>
      </main>
    </ProtectedRoute>
  );
}

LoginPage.propTypes = {
  session: ProtectedRoute.propTypes.session,
  onSessionChange: PropTypes.func.isRequired,
};
