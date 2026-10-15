/** @module register-tests Verify four-field validation, persistence and non-transactional failure UX. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { getSession, setSession, authenticate } from '../utils/auth';

const values = { 'Display Name': ' Riley ', Username: ' RILEY ', Password: ' demo ', 'Confirm Password': ' demo ' };
const writer = { userId: 'w', username: 'riley', displayName: 'Riley', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/** Expose the current route without product side effects.
 * @returns {import('react').ReactElement} Accessible pathname output.
 */
function Location() {
  return (
    <output aria-label="Location">
      {useLocation().pathname}
    </output>
  );
}

/** Mount the real registration page at its declared route.
 * @param {object|null} [session=null] Initial caller-owned identity.
 * @returns {Function} Observer for App state changes.
 */
function mount(session = null) {
  const changed = vi.fn();
  render(
    <MemoryRouter initialEntries={['/register']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/register" element={<RegisterPage session={session} onSessionChange={changed} />} />
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
  return changed;
}

/** Fill labeled form controls without submitting until requested by each test.
 * @param {object} [entries=values] Label/value pairs, allowing omitted values.
 */
async function fill(entries = values) {
  for (const [label, value] of Object.entries(entries)) {
    if (value) await userEvent.type(screen.getByLabelText(label, { exact: true }), value);
  }
}

/** Explicitly activate the registration submit button. */
async function submit() {
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

it('renders four required labeled fields, no role selector and demo disclosure without writes', () => {
  const changed = mount();
  expect(screen.getByRole('heading', { name: 'Register' })).toBeInTheDocument();
  for (const label of Object.keys(values)) {
    expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-required', 'true');
  }
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByText(/Passwords are stored in plaintext/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'WriteSpace' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(localStorage.length).toBe(0);
  expect(changed).not.toHaveBeenCalled();
});

it.each(Object.keys(values))('associates the required %s error, focuses summary and never writes', async (label) => {
  const changed = mount();
  await fill({ ...values, [label]: ' ' });
  await submit();
  expect(screen.getByText('Please complete all four fields.')).toHaveFocus();
  expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText(label, { exact: true })).toHaveAccessibleDescription('This field is required.');
  expect(localStorage.getItem('writespace_users')).toBeNull();
  expect(getSession()).toBeNull();
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
  expect(changed).not.toHaveBeenCalled();
});

it('shows all four missing errors on an empty submission', async () => {
  mount();
  await submit();
  expect(screen.getAllByText('This field is required.')).toHaveLength(4);
  expect(localStorage.length).toBe(0);
});

it('associates mismatching exact passwords with confirmation and leaves storage untouched', async () => {
  mount();
  await fill({ ...values, 'Confirm Password': 'demo' });
  await submit();
  expect(screen.getByLabelText('Confirm Password')).toHaveAccessibleDescription('Passwords must match.');
  expect(screen.getAllByText('Passwords must match.')).toHaveLength(2);
  expect(localStorage.length).toBe(0);
});

it.each(['admin', ' AdMiN ', ' riley '])('rejects reserved or duplicate %s with username error', async (username) => {
  localStorage.setItem('writespace_users', '[{"id":"existing","username":"RILEY"}]');
  mount();
  const before = localStorage.getItem('writespace_users');
  await fill({ ...values, Username: username });
  await submit();
  expect(screen.getByLabelText('Username')).toHaveAccessibleDescription('Username is already taken.');
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(getSession()).toBeNull();
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
});

it('persists a writer UUID, ISO timestamp, exact password and canonical session before navigating', async () => {
  const changed = mount();
  await fill();
  expect(localStorage.length).toBe(0);
  await submit();
  const users = JSON.parse(localStorage.getItem('writespace_users'));
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ username: 'RILEY', displayName: 'Riley', role: 'user', password: ' demo ' });
  expect(users[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(new Date(users[0].createdAt).toISOString()).toBe(users[0].createdAt);
  expect(getSession()).toEqual({ userId: users[0].id, username: 'RILEY', displayName: 'Riley', role: 'user' });
  expect(changed).toHaveBeenCalledWith(getSession());
  expect(screen.getByLabelText('Location').textContent).toBe('/blogs');
  expect(screen.queryByRole('heading', { name: 'Register' })).not.toBeInTheDocument();
});

it.each(['setItem', 'property'])('reports first-write %s failure with no success and retains inputs', async (failure) => {
  const changed = mount();
  await fill();
  const fault = failure === 'property'
    ? vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('private'); })
    : vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private'); });
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByLabelText('Username')).toHaveValue(' RILEY ');
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
  expect(changed).not.toHaveBeenCalled();
  fault.mockRestore();
  expect(localStorage.getItem('writespace_users')).toBeNull();
  expect(getSession()).toBeNull();
});

it('explains account retained after session-write failure and offers real sign-in navigation', async () => {
  const changed = mount();
  await fill();
  const original = Storage.prototype.setItem;
  const fault = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === 'writespace_session') throw new Error('private');
    original.call(this, key, value);
  });
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('Your account was saved, but sign-in failed.');
  expect(screen.getByRole('alert')).toHaveTextContent('you can sign in');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(JSON.parse(localStorage.getItem('writespace_users'))).toHaveLength(1);
  expect(getSession()).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
  fault.mockRestore();
  await userEvent.click(screen.getByRole('link', { name: 'Sign in' }));
  expect(screen.getByLabelText('Location').textContent).toBe('/login');
  expect(authenticate('riley', ' demo ').ok).toBe(true);
  expect(getSession().userId).toBe(JSON.parse(localStorage.getItem('writespace_users'))[0].id);
});

it('reports missing UUID support without saving or navigating', async () => {
  mount();
  await fill();
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('private'); });
  await submit();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to create a local account.');
  expect(localStorage.length).toBe(0);
  expect(screen.getByLabelText('Location').textContent).toBe('/register');
});

it.each([[writer, '/blogs'], [admin, '/admin']])('redirects existing $role without registration', (session, home) => {
  setSession(session);
  const changed = mount(session);
  expect(screen.queryByRole('heading', { name: 'Register' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Location').textContent).toBe(home);
  expect(localStorage.getItem('writespace_users')).toBeNull();
  expect(getSession()).toEqual(session);
  expect(changed).not.toHaveBeenCalled();
});
