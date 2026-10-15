/** @module Avatar Static upstream role avatars; emojis are an explicit visual exception. */
import PropTypes from 'prop-types';

/** Return static role JSX; unknown roles use the non-admin book treatment.
 * @param {string} role Local role, Admin or user.
 * @returns {import('react').ReactElement} Accessible role span.
 */
export function getAvatar(role) {
  const admin = role === 'Admin';
  return (
    <span
      role="img"
      aria-label={admin ? 'Admin avatar' : 'Writer avatar'}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${admin ? 'bg-violet-600' : 'bg-indigo-500'}`}
    >
      {admin ? '👑' : '📚'}
    </span>
  );
}

/** Render a role avatar using the shared helper.
 * @param {{role?: string}} props Component props.
 * @returns {import('react').ReactElement} Role avatar.
 */
export function Avatar({ role = 'user' }) {
  return getAvatar(role);
}

Avatar.propTypes = { role: PropTypes.string };
