/** @module UserManagement Create and remove browser-local accounts only through explicit admin actions. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { UserRow } from '../components/UserRow';
import { isValidSession } from '../utils/auth';
import { createAccount, removeAccount } from '../utils/accounts';
import { getUsers } from '../utils/storage';

const emptyForm = { displayName: '', username: '', password: '', role: 'user' };
const fields = { displayName: 'Display Name', username: 'Username', password: 'Password', role: 'Role' };
const fixedAdmin = { id: 'admin', displayName: 'Admin', username: 'admin', role: 'admin' };

/** Show public metadata and a four-field creation form with associated errors.
 * @param {{session?: object|null}} props App-owned identity, rechecked by every mutation.
 * @returns {import('react').ReactElement} Administrator form and protected account list.
 */
export default function UserManagement({ session = null }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /** Load accounts without persisting the synthetic administrator or repairing storage. */
  useEffect(() => {
    setUsers(getUsers());
  }, []);

  /** Update only the named local draft field and clear obsolete success feedback.
   * @param {import('react').ChangeEvent} event Native input/select change.
   */
  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
    setSuccess('');
  }

  /** Validate and save through the account service before announcing success or refreshing.
   * @param {import('react').FormEvent} event Explicit form submission.
   */
  function handleCreate(event) {
    event.preventDefault();
    setSuccess('');
    const result = createAccount(session, form);
    setFieldErrors(result.fieldErrors || {});
    setError(result.error || '');
    if (result.ok) {
      setUsers(getUsers());
      setForm({ ...emptyForm });
      setSuccess('User created successfully.');
    }
  }

  /** Confirm an eligible deletion and leave the rendered list intact for cancellation or failure.
   * @param {string} id Exact target account ID, protected again in the service.
   */
  function handleDelete(id) {
    setSuccess('');
    const result = removeAccount(session, id, window.confirm('Delete this account? This cannot be undone.'));
    if (result.ok) {
      setUsers(getUsers());
      setError('');
      setSuccess('Account deleted successfully.');
    } else if (result.error) {
      setError(result.error);
    }
  }

  if (!isValidSession(session) || session.role !== 'admin') {
    return (
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold">
          Administrator access required
        </h1>
      </main>
    );
  }
  const rows = users.filter((account) => account && typeof account === 'object' && !Array.isArray(account));

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Link to="/admin" className="button-secondary mb-6">
        Back to Dashboard
      </Link>
      <h1 className="font-display text-4xl font-bold text-slate-800">
        Manage Users
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        Demo accounts stay in this browser with plaintext passwords. Never use a real or reused password.
      </p>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-3">
        <section aria-labelledby="create-user" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="create-user" className="mb-6 font-display text-2xl font-semibold text-slate-800">
            Create User
          </h2>
          <form noValidate onSubmit={handleCreate} className="space-y-5">
            {Object.entries(fields).map(([name, label]) => (
              <div key={name}>
                <label htmlFor={`account-${name}`} className="mb-2 block font-semibold text-slate-700">
                  {label}
                </label>
                {name === 'role' ? (
                  <select
                    id={`account-${name}`}
                    name={name}
                    value={form[name]}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors[name])}
                    aria-describedby={fieldErrors[name] ? `account-${name}-error` : undefined}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  >
                    <option value="admin">
                      Admin
                    </option>
                    <option value="user">
                      user
                    </option>
                  </select>
                ) : (
                  <input
                    id={`account-${name}`}
                    name={name}
                    type={name === 'password' ? 'password' : 'text'}
                    autoComplete={name === 'password' ? 'new-password' : 'off'}
                    value={form[name]}
                    onChange={handleChange}
                    required
                    aria-required="true"
                    aria-invalid={Boolean(fieldErrors[name])}
                    aria-describedby={fieldErrors[name] ? `account-${name}-error` : undefined}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3"
                  />
                )}
                {fieldErrors[name] && (
                  <p id={`account-${name}-error`} role="alert" className="mt-2 text-sm text-red-700">
                    {fieldErrors[name]}
                  </p>
                )}
              </div>
            ))}
            <button type="submit" className="button-primary w-full">
              Create User
            </button>
          </form>
        </section>
        <section aria-labelledby="account-list" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <h2 id="account-list" className="font-display text-2xl font-semibold text-slate-800">
            Accounts
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The fixed admin is shown for clarity, but is not a stored account. Its creation date is unknown.
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-green-800">
              {success}
            </p>
          )}
          {!rows.length && (
            <p className="mt-4 text-slate-600">
              No stored accounts yet.
            </p>
          )}
          <ul aria-label="Accounts">
            <UserRow account={fixedAdmin} currentUserId={session.userId} onDelete={handleDelete} />
            {rows.map((account, index) => (
              <UserRow key={`${account.id}-${index}`} account={account} currentUserId={session.userId} onDelete={handleDelete} />
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

UserManagement.propTypes = { session: ProtectedRoute.propTypes.session };
