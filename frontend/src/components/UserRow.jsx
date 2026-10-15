/** @module UserRow Display public account metadata only, with protected deletion controls. */
import PropTypes from 'prop-types';
import { Avatar } from './Avatar';
import { formatDate, safeText } from '../utils/presentation';

/** Render one account without reading or rendering any credential field.
 * @param {{account?: object, currentUserId?: string, onDelete: Function}} props Public metadata and explicit action.
 * @returns {import('react').ReactElement} Account list item with an accessible Delete action.
 */
export function UserRow({ account = {}, currentUserId = '', onDelete }) {
  const entry = account || {};
  const id = safeText(entry.id);
  const username = safeText(entry.username, 'Unknown username');
  const fixed = id === 'admin' || username.trim().toLowerCase() === 'admin';
  const current = Boolean(id && id === currentUserId);
  const reason = fixed ? 'Default admin cannot be deleted.' : current ? 'Your current account cannot be deleted.' : '';
  const admin = entry.role === 'admin';

  /** Forward only eligible explicit actions; the service repeats all protection checks. */
  function handleDelete() {
    if (id && !reason) onDelete(id);
  }

  return (
    <li className="flex flex-col gap-4 border-b border-slate-100 py-5 last:border-0 sm:flex-row sm:items-center">
      <Avatar role={admin ? 'Admin' : 'user'} />
      <div className="min-w-0 flex-1">
        <h3 className="break-words font-display text-xl font-semibold text-slate-800">
          {safeText(entry.displayName, 'Unknown account')}
        </h3>
        <p className="break-words text-slate-600">
          @{username}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Created: {formatDate(entry.createdAt)}
        </p>
      </div>
      <span className={admin ? 'rounded-full bg-violet-50 px-3 py-1 text-violet-700' : 'rounded-full bg-indigo-50 px-3 py-1 text-indigo-700'}>
        {admin ? 'Admin' : entry.role === 'user' ? 'user' : 'Unknown role'}
      </span>
      <button
        type="button"
        className="button-secondary text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={Boolean(reason) || !id}
        title={reason || undefined}
        aria-label={`Delete ${username}`}
        onClick={handleDelete}
      >
        Delete
      </button>
    </li>
  );
}

UserRow.propTypes = {
  account: PropTypes.object,
  currentUserId: PropTypes.string,
  onDelete: PropTypes.func.isRequired,
};
