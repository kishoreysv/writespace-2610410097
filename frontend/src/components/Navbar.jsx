/** @module Navbar Local role navigation with explicitly activated logout only. */
import { startTransition, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar';
import { Avatar } from './Avatar';
import { isValidSession, logout } from '../utils/auth';

/** Render responsive role links and a keyboard-operable account disclosure.
 * @param {{session?: object|null, onSessionChange: Function}} props App-owned identity and setter.
 * @returns {import('react').ReactElement} Public or signed-in navigation.
 */
export function Navbar({ session = null, onSessionChange }) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  /** Close both disclosures after explicit link navigation. */
  function closeMenus() {
    setOpen(false);
    setAccountOpen(false);
    setError('');
  }

  /** Remove the persisted session before changing UI or location. */
  function handleLogout() {
    const result = logout();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Match the router's transition so guards never see a cleared session at the old protected path.
    startTransition(() => {
      closeMenus();
      onSessionChange(null);
      navigate(result.navigateTo);
    });
  }

  /** Close the account disclosure on Escape and restore its trigger focus.
   * @param {import('react').KeyboardEvent} event Account disclosure keyboard activation.
   */
  function handleAccountKey(event) {
    if (event.key === 'Escape') {
      setAccountOpen(false);
      event.currentTarget.querySelector('button').focus();
    }
  }

  if (!isValidSession(session)) return <PublicNavbar />;
  const admin = session.role === 'admin';
  return (
    <header className="border-b border-slate-100 bg-white shadow-sm">
      <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Link to="/" onClick={closeMenus} className="font-display text-2xl font-bold text-primary-600">
          WriteSpace
        </Link>
        <button
          type="button"
          className="button-secondary md:hidden"
          aria-expanded={open}
          aria-controls="account-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close menu' : 'Open menu'}
        </button>
        <nav
          id="account-navigation"
          aria-label="Account navigation"
          className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-4 md:flex md:w-auto md:flex-row md:items-center`}
        >
          <NavLink to="/blogs" onClick={closeMenus} className="font-semibold text-primary-700">
            All Blogs
          </NavLink>
          <NavLink to="/write" onClick={closeMenus} className="font-semibold text-primary-700">
            Write
          </NavLink>
          {admin && (
            <NavLink to="/users" onClick={closeMenus} className="font-semibold text-violet-700">
              Users
            </NavLink>
          )}
          <div className="relative" onKeyDown={handleAccountKey}>
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-full px-3 py-1 font-semibold"
              aria-expanded={accountOpen}
              aria-controls="account-actions"
              onClick={() => setAccountOpen(!accountOpen)}
            >
              <Avatar role={admin ? 'Admin' : 'user'} />
              {session.displayName}
            </button>
            {accountOpen && (
              <div
                id="account-actions"
                className={[
                  'mt-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4',
                  'md:absolute md:right-0 md:z-10 md:min-w-64 md:shadow-sm',
                ].join(' ')}
              >
                <Link to={admin ? '/admin' : '/blogs'} onClick={closeMenus} className="font-semibold text-primary-700">
                  Go to Dashboard
                </Link>
                <button type="button" onClick={handleLogout} className="button-secondary">
                  Logout
                </button>
                {error && (
                  <p role="alert" className="max-w-xs text-red-700">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

Navbar.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    username: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['user', 'admin']).isRequired,
  }),
  onSessionChange: PropTypes.func.isRequired,
};
