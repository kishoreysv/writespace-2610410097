/** @module RegisterPage Four-field browser-local writer registration with honest partial failures. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { registerWriter } from '../utils/auth';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { PublicNavbar } from '../components/PublicNavbar';

const fields = [
  { name: 'displayName', label: 'Display Name', type: 'text', autoComplete: 'nickname' },
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', label: 'Confirm Password', type: 'password', autoComplete: 'new-password' },
];

/** Present required fields and update App only after both local writes succeed.
 * @param {{session?: object|null, onSessionChange: Function}} props Current identity and setter.
 * @returns {import('react').ReactElement} Guest-only registration form.
 */
export default function RegisterPage({ session = null, onSessionChange }) {
  const [values, setValues] = useState({ displayName: '', username: '', password: '', confirmPassword: '' });
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  /** Focus the error summary, including non-transactional session failures. */
  useEffect(() => {
    if (result && !result.ok) document.getElementById('register-error')?.focus();
  }, [result]);

  /** Validate and perform registration only after explicit form activation.
   * @param {import('react').FormEvent} event Submit activation.
   */
  function handleSubmit(event) {
    event.preventDefault();
    const next = registerWriter(values);
    setResult(next);
    if (next.ok) {
      onSessionChange(next.session);
      navigate(next.navigateTo, { replace: true });
    }
  }

  /** Update one controlled field without normalizing exact passwords.
   * @param {import('react').ChangeEvent<HTMLInputElement>} event Input change.
   */
  function handleChange(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }

  return (
    <ProtectedRoute session={session}>
      <PublicNavbar />
      <main id="main-content" className="mx-auto max-w-lg px-6 py-12 md:py-20">
        <Link to="/" className="mb-6 inline-block font-semibold text-primary-700">
          Back to Home
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8" aria-labelledby="register-title">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary-700">
            Make space for your words
          </p>
          <h1 id="register-title" className="mb-4 text-4xl font-bold">
            Register
          </h1>
          <p id="register-warning" className="mb-6 text-slate-600">
            Browser-local demo only. Passwords are stored in plaintext. Do not use a real password or sensitive data. Your account stays in this browser, with no cloud backup or sync.
          </p>
          <form noValidate onSubmit={handleSubmit} aria-describedby="register-warning" className="space-y-5">
            {result && !result.ok && (
              <p id="register-error" role="alert" tabIndex={-1} className="rounded-xl bg-red-50 p-4 text-red-700">
                {result.error}
              </p>
            )}
            {fields.map((field) => (
              <div key={field.name}>
                <label htmlFor={`register-${field.name}`} className="mb-2 block font-semibold">
                  {field.label}
                </label>
                <input
                  id={`register-${field.name}`}
                  name={field.name}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  required
                  aria-required="true"
                  aria-invalid={Boolean(result?.fieldErrors?.[field.name])}
                  aria-describedby={result?.fieldErrors?.[field.name] ? `register-${field.name}-error` : undefined}
                  value={values[field.name]}
                  onChange={handleChange}
                  className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3"
                />
                {result?.fieldErrors?.[field.name] && (
                  <p id={`register-${field.name}-error`} role="alert" className="mt-2 text-red-700">
                    {result.fieldErrors[field.name]}
                  </p>
                )}
              </div>
            ))}
            <button type="submit" className="button-primary w-full">
              Create account
            </button>
          </form>
          <p className="mt-6 text-slate-600">
            Already have a local account?{' '}
            <Link to="/login" className="font-semibold text-primary-700">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </ProtectedRoute>
  );
}

RegisterPage.propTypes = {
  session: ProtectedRoute.propTypes.session,
  onSessionChange: PropTypes.func.isRequired,
};
