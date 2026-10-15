/** @module login-tests Verify labeled sign-in, exact failures, persisted roles and explicit navigation. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { getSession, setSession } from '../utils/auth';

const writer = { userId: 'w', username: 'riley', displayName: 'Riley', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/** Observe route changes without triggering any operation.
 * @returns {import('react').ReactElement} Accessible pathname output.
 */
function Location() {
  return (
    <output aria-label="Location">
      {useLocation().pathname}
    </output>
  );
}

/** Mount the real page under its route, with a callback observing successful App updates.
 * @param {object|null} [session=null] Caller-owned session.
 * @returns {Function} App session-change observer.
 */
function mount(session = null) {
  const onSessionChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage session={session} onSessionChange={onSessionChange} />} />
        <Route
          path="*"
          element={
            <p>
              Route destination
            </p>
          }
        />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
  return onSessionChange;
}

/** Fill and submit labeled credentials using explicit user actions.
 * @param {string} username Submitted username.
 * @param {string} password Submitted exact password.
 */
async function submit(username, password) {
  if (username) await userEvent.type(screen.getByLabelText('Username'), username);
  if (password) await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
}

it('renders exactly two required fields, demo warning, matching admin hint and reusable Home links inertly', () => {
  const changed = mount();
  expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-required', 'true');
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getByText(/Passwords are stored in plaintext/)).toBeInTheDocument();
  expect(screen.getByText('Demo administrator: username admin / password admin.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'WriteSpace' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register');
  expect(localStorage.length).toBe(0);
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Location').textContent).toBe('/login');
});

it.each([['', ''], [' ', 'bad'], ['missing', 'private-secret'], ['admin', 'ADMIN']])(
  'shows the exact focused invalid error for %j without echoing password', async (username, password) => {
    const changed = mount();
    await submit(username, password);
    const error = screen.getByRole('alert');
    expect(error.textContent).toBe('Invalid username or password.');
    expect(error).toHaveFocus();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Invalid username or password.');
    expect(getSession()).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Location').textContent).toBe('/login');
  },
);

it.each(['user', 'admin'])('persists local %s and navigates only after explicit sign-in', async (role) => {
  localStorage.setItem('writespace_users', JSON.stringify([{ id: 'w', username: 'riley', displayName: 'Riley', role, password: ' demo ' }]));
  const changed = mount();
  await submit(' RILEY ', ' demo ');
  expect(getSession()).toEqual({ ...writer, role });
  expect(changed).toHaveBeenCalledWith(getSession());
  expect(screen.getByLabelText('Location').textContent).toBe(role === 'admin' ? '/admin' : '/blogs');
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument();
});

it('persists the exact fixed admin identity and routes to admin', async () => {
  const changed = mount();
  await submit(' AdMiN ', 'admin');
  expect(getSession()).toEqual(admin);
  expect(changed).toHaveBeenCalledWith(admin);
  expect(screen.getByLabelText('Location').textContent).toBe('/admin');
});

it.each(['setItem', 'property'])('retains the form and prior persisted state on %s failure', async (failure) => {
  setSession(writer);
  const changed = mount();
  const fault = failure === 'property'
    ? vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('private'); })
    : vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private'); });
  await submit('admin', 'admin');
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByLabelText('Location').textContent).toBe('/login');
  expect(changed).not.toHaveBeenCalled();
  fault.mockRestore();
  expect(getSession()).toEqual(writer);
});

it.each([[writer, '/blogs'], [admin, '/admin']])('redirects signed-in $role without invoking form mutation', (session, home) => {
  setSession(session);
  const changed = mount(session);
  expect(screen.getByLabelText('Location').textContent).toBe(home);
  expect(screen.queryByRole('heading', { name: 'Login' })).not.toBeInTheDocument();
  expect(getSession()).toEqual(session);
  expect(changed).not.toHaveBeenCalled();
});

it('supports explicit registration and Home navigation without session writes', async () => {
  mount();
  await userEvent.click(screen.getByRole('link', { name: 'Create an account' }));
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
  expect(getSession()).toBeNull();
});
