/** @module PublicNavbar Public links with nullable, caller-owned session state. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { safeText } from '../utils/presentation';

/** Render desktop/mobile navigation without session mutations.
 * @param {{session?: object|null}} props Validated session supplied by the identity slice.
 * @returns {import('react').ReactElement} Public header.
 */
export function PublicNavbar({ session = null }) {
  const [open, setOpen] = useState(false);
  const home = session?.role === 'Admin' ? '/admin' : '/blogs';

  /** Close disclosure after a user activates a navigation link. */
  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="border-b border-slate-100 bg-white shadow-sm">
      <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <Link to="/" className="font-display text-2xl font-bold text-primary-600" onClick={closeMenu}>
          WriteSpace
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="public-navigation"
          className="button-secondary md:hidden"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close menu' : 'Open menu'}
        </button>
        <nav
          id="public-navigation"
          aria-label="Public navigation"
          className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-3 md:flex md:w-auto md:flex-row md:items-center md:gap-6`}
        >
          {session ? (
            <>
              <span className="flex items-center gap-3">
                <Avatar role={session.role} />
                <span className="font-semibold">
                  {safeText(session.displayName, 'Local account')}
                </span>
              </span>
              <Link to={home} className="button-primary" onClick={closeMenu}>
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="font-semibold text-primary-600" onClick={closeMenu}>
                Login
              </Link>
              <Link to="/register" className="button-primary" onClick={closeMenu}>
                Get Started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

PublicNavbar.propTypes = {
  session: PropTypes.shape({
    role: PropTypes.oneOf(['Admin', 'user']).isRequired,
    displayName: PropTypes.string,
    userId: PropTypes.string,
    username: PropTypes.string,
  }),
};
