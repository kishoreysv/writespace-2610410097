/** @module guard-tests Verify every role redirect and App's synchronous identity wiring. */
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { setSession, getSession } from '../utils/auth';
import App from '../App';

const writer = { userId: 'w', username: 'writer', displayName: 'Writer', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

/** Expose the current pathname without modifying navigation.
 * @returns {import('react').ReactElement} Accessible location output.
 */
function Location() {
  return (
    <output aria-label="Location">
      {useLocation().pathname}
    </output>
  );
}

/** Mount one guarded route and an honest redirect observer.
 * @param {string} path Initial entry and guarded route.
 * @param {object|null} session Expected local identity.
 */
function mountGuard(path, session) {
  render(
    <MemoryRouter initialEntries={[path]} future={future}>
      <Routes>
        <Route
          path={path}
          element={
            <ProtectedRoute session={session}>
              <h1>
                Guarded content
              </h1>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <h1>
              Redirect destination
            </h1>
          }
        />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

for (const [role, session] of [['guest', null], ['user', writer], ['admin', admin]]) {
  it.each(['/', '/login', '/register', '/blogs', '/blog/x', '/write', '/edit/x', '/admin', '/users'])(
    role + ' follows the route matrix at %s', (path) => {
      mountGuard(path, session);
      let destination = path;
      if (session && ['/login', '/register'].includes(path)) destination = role === 'admin' ? '/admin' : '/blogs';
      else if (!session && !['/', '/login', '/register'].includes(path)) destination = '/login';
      else if (role === 'user' && ['/admin', '/users'].includes(path)) destination = '/blogs';
      expect(screen.getByLabelText('Location').textContent).toBe(destination);
      expect(screen.getByRole('heading').textContent).toBe(destination === path ? 'Guarded content' : 'Redirect destination');
      expect(localStorage.getItem('writespace_session')).toBeNull();
    },
  );
}

it('fails closed for malformed identity and allows unknown paths to not-found', () => {
  mountGuard('/admin', { ...admin, displayName: '' });
  expect(screen.getByLabelText('Location')).toHaveTextContent('/login');
  cleanup();
  mountGuard('/unknown', null);
  expect(screen.getByRole('heading', { name: 'Guarded content' })).toBeInTheDocument();
});

/** Mount the real App in the test-owned router.
 * @param {string} path Initial entry.
 */
function mountApp(path) {
  render(
    <MemoryRouter initialEntries={[path]} future={future}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}

it.each([[writer, '/blogs'], [admin, '/admin']])('restores $role before rendering guest-only login', (session, home) => {
  setSession(session);
  mountApp('/login');
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Location').textContent).toBe(home);
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Account navigation' })).toBeInTheDocument();
  expect(getSession()).toEqual(session);
});

it.each([[writer, '/blogs'], [admin, '/admin']])('preserves the landing presentation role-home link for $role', (session, home) => {
  setSession(session);
  mountApp('/');
  expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', home);
  expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', '/blogs');
  expect(screen.getByRole('img', { name: session.role === 'admin' ? 'Admin avatar' : 'Writer avatar' })).toBeInTheDocument();
  expect(getSession()).toEqual(session);
});

it('guards guest preview, supports auth screen Home links, and does not repair malformed session', async () => {
  localStorage.setItem('writespace_session', '{bad');
  mountApp('/blog/preview');
  expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  expect(screen.getByLabelText('Location').textContent).toBe('/login');
  await userEvent.click(screen.getByRole('link', { name: 'Back to Home' }));
  expect(screen.getByRole('heading', { name: 'WriteSpace', level: 1 })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_session')).toBe('{bad');
});

it('unknown guest routes retain navigation and a useful Home recovery link', async () => {
  mountApp('/unknown');
  expect(screen.getByText('Requested path: /unknown')).toBeInTheDocument();
  expect(screen.queryByText(/discovery-only/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'WriteSpace' }));
  expect(screen.getByLabelText('Location').textContent).toBe('/');
});
