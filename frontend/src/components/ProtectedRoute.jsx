/** @module ProtectedRoute Apply local role redirects without writing session data. */
import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { canAccessRoute } from '../utils/auth';

/** Render children or replace history with the matrix's redirect.
 * @param {{session?: object|null, children: import('react').ReactNode}} props Guarded content.
 * @returns {import('react').ReactElement} Content or redirect.
 */
export function ProtectedRoute({ session = null, children }) {
  const { pathname } = useLocation();
  const decision = canAccessRoute(pathname, session);
  return decision.allowed ? children : <Navigate to={decision.redirectTo} replace />;
}

ProtectedRoute.propTypes = {
  session: PropTypes.shape({
    userId: PropTypes.string,
    username: PropTypes.string,
    displayName: PropTypes.string,
    role: PropTypes.string,
  }),
  children: PropTypes.node.isRequired,
};
