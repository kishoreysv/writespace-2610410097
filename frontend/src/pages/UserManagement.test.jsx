/** @module user-management-tests Exercise real form validation, account persistence and protection/failure states. */
import { StrictMode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import UserManagement from './UserManagement';
import App from '../App';
import { authenticate, getSession, setSession } from '../utils/auth';
import { getUsers, saveUsers } from '../utils/storage';

const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const account = { id: 'writer', displayName: 'Writer', username: 'writer', password: 'never-listed-demo', role: 'user', createdAt: '2025-01-01T00:00:00.000Z' };
const draft = { displayName: ' New Person ', username: ' NewPerson ', password: ' exact-demo ', role: 'user' };
const labels = { displayName: 'Display Name', username: 'Username', password: 'Password', role: 'Role' };

/** Seed real identity and users, returning stored bytes for no-write assertions.
 * @param {Array} users Initial stored entries.
 * @param {object} session Initial identity.
 * @returns {string} Exact serialized accounts.
 */
function seed(users = [account], session = admin) {
  setSession(session);
  saveUsers(users);
  return localStorage.getItem('writespace_users');
}

/** Mount with router links and optionally the full single-layout App.
 * @param {object} options Identity and App selection.
 * @returns {object} RTL view.
 */
function mount({ session = admin, app = false } = {}) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/users']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {app ? <App /> : <UserManagement session={session} />}
      </MemoryRouter>
    </StrictMode>,
  );
}

/** Fill the actual four native controls with synthetic disposable credentials.
 * @param {object} values Draft fields, including invalid values for component validation.
 */
function fill(values = draft) {
  for (const [name, label] of Object.entries(labels)) {
    const field = name === 'role' ? screen.getByRole('combobox', { name: label }) : screen.getByLabelText(label);
    fireEvent.change(field, { target: { value: values[name] } });
  }
}

it('shows exactly four associated required fields, role labels, synthetic protected admin and password-free listing', () => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const confirm = vi.spyOn(window, 'confirm');
  mount({ app: true });
  for (const label of Object.values(labels)) {
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(label)).toBeRequired();
  }
  expect(screen.getAllByRole('textbox')).toHaveLength(2);
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(screen.getAllByRole('option').map((option) => [option.textContent.trim(), option.value])).toEqual([
    ['Admin', 'admin'], ['user', 'user'],
  ]);
  const list = screen.getByRole('list', { name: 'Accounts' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(within(list).getByRole('button', { name: 'Delete admin' })).toBeDisabled();
  expect(within(list).getByRole('button', { name: 'Delete admin' })).toHaveAttribute('title', 'Default admin cannot be deleted.');
  expect(within(list).getByText('Created: Unknown date')).toBeInTheDocument();
  expect(within(list).getByRole('img', { name: 'Admin avatar' })).toBeInTheDocument();
  expect(list.innerHTML).not.toContain(account.password);
  expect(getUsers()).toEqual([account]);
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(setter).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

it.each(['user', 'admin'])('creates %s only after save, refreshes public list, resets draft and preserves admin session', async (role) => {
  seed();
  mount();
  fill({ ...draft, role });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getByRole('status')).toHaveTextContent('User created successfully.');
  const saved = getUsers()[1];
  expect(saved).toMatchObject({ displayName: 'New Person', username: 'NewPerson', password: draft.password, role });
  expect(saved.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);
  expect(getUsers()[0]).toEqual(account);
  expect(getSession()).toEqual(admin);
  expect(screen.getByRole('heading', { name: 'New Person' })).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(screen.getByLabelText('Display Name')).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('user');
  expect(screen.getByRole('list', { name: 'Accounts' }).innerHTML).not.toContain(draft.password);
  expect(authenticate(saved.username, saved.password)).toMatchObject({ ok: true, role });
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'another' } });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it.each(['displayName', 'username', 'password', 'role'])('missing %s blocks save and exposes an associated field error', async (field) => {
  const before = seed();
  mount();
  fill({ ...draft, [field]: '' });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  const control = screen.getByLabelText(labels[field]);
  expect(control).toHaveAttribute('aria-invalid', 'true');
  expect(control).toHaveAttribute('aria-describedby', `account-${field}-error`);
  expect(document.getElementById(`account-${field}-error`)).toHaveTextContent('This field is required.');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['displayName', 'username', 'password'])('whitespace-only %s produces no save', async (field) => {
  const before = seed();
  mount();
  fill({ ...draft, [field]: ' \t ' });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getByLabelText(labels[field])).toHaveAttribute('aria-invalid', 'true');
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['writer', ' WRITER ', 'admin', ' AdMiN '])('duplicate/reserved username %s is associated with username and does not expose password', async (username) => {
  const before = seed();
  mount();
  fill({ ...draft, username });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-describedby', 'account-username-error');
  expect(document.getElementById('account-username-error')).toHaveTextContent('Username is already taken.');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Accounts' }).innerHTML).not.toContain(draft.password);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('a duplicate added after mount is rejected, then a corrected username clears errors and saves', async () => {
  seed();
  mount();
  saveUsers([account, { ...account, id: 'later', username: 'NewPerson' }]);
  fill();
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Username is already taken.');
  expect(getUsers()).toHaveLength(2);
  fill({ ...draft, username: 'unique' });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('User created successfully.');
  expect(getUsers()).toHaveLength(3);
  expect(screen.getByRole('list', { name: 'Accounts' }).children).toHaveLength(4);
});

it('failed create retains draft/list, shows an actionable failure and never reports success', async () => {
  const before = seed();
  mount();
  fill();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByLabelText('Username')).toHaveValue(draft.username);
  expect(screen.getByLabelText('Password')).toHaveValue(draft.password);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'New Person' })).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('UUID failure is an alert and retains unsaved values and stored list', async () => {
  const before = seed();
  mount();
  fill();
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unsupported'); });
  await userEvent.click(screen.getByRole('button', { name: 'Create User' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to create a local account.');
  expect(screen.getByLabelText('Username')).toHaveValue(draft.username);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['create', 'delete'])('stale admin session rejects explicit %s without data or success changes', async (action) => {
  const before = seed();
  mount();
  fill();
  setSession(writer);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: action === 'create' ? 'Create User' : 'Delete writer' }));
  expect(screen.getByRole('alert')).toHaveTextContent('not authorized to manage accounts');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('eligible delete cancellation leaves stored and rendered users unchanged and announces no success', async () => {
  const before = seed();
  mount();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await userEvent.click(screen.getByRole('button', { name: 'Delete writer' }));
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(screen.getByRole('heading', { name: 'Writer' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('confirmed delete requeries fresh users, preserves later additions and announces saved removal', async () => {
  seed();
  mount();
  const later = { ...account, id: 'later', username: 'later', displayName: 'Later' };
  saveUsers([account, later]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Delete writer' }));
  expect(getUsers()).toEqual([later]);
  expect(screen.queryByRole('heading', { name: 'Writer' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Account deleted successfully.');
});

it('failed delete keeps row visible and stored, then clears failure after successful deletion', async () => {
  const before = seed();
  mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Delete writer' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('heading', { name: 'Writer' })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  setter.mockRestore();
  await userEvent.click(screen.getByRole('button', { name: 'Delete writer' }));
  expect(getUsers()).toEqual([]);
  expect(screen.getByText('No stored accounts yet.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['missing', 'reserved', 'ambiguous'])('handler-time target %s rejects removal and does not refresh as success', async (change) => {
  seed();
  mount();
  if (change === 'missing') saveUsers([]);
  if (change === 'reserved') saveUsers([{ ...account, username: 'ADMIN' }]);
  if (change === 'ambiguous') saveUsers([account, account]);
  const before = localStorage.getItem('writespace_users');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Delete writer' }));
  expect(screen.getByRole('alert')).toHaveTextContent(change === 'missing' ? 'Account not found.' : change === 'reserved' ? 'Default admin cannot be deleted.' : 'Invalid account.');
  expect(screen.getByRole('heading', { name: 'Writer' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('fixed and current created-admin controls cannot trigger confirmation or deletion', async () => {
  const current = { userId: 'local', username: 'local', displayName: 'Local', role: 'admin' };
  const row = { ...account, id: 'local', username: 'local', displayName: 'Local', role: 'admin' };
  const before = seed([row], current);
  mount({ session: current });
  const confirm = vi.spyOn(window, 'confirm');
  for (const username of ['admin', 'local']) {
    const button = screen.getByRole('button', { name: `Delete ${username}` });
    expect(button).toBeDisabled();
    await userEvent.click(button);
  }
  expect(confirm).not.toHaveBeenCalled();
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['{bad', '{}', 'null', '[null,false,[]]'])('malformed stored users %s show fixed admin and safe empty state without repairing', (raw) => {
  setSession(admin);
  localStorage.setItem('writespace_users', raw);
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  mount();
  expect(screen.getByText('No stored accounts yet.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete admin' })).toBeDisabled();
  expect(localStorage.getItem('writespace_users')).toBe(raw);
  expect(setter).not.toHaveBeenCalled();
});

it('malformed account fields render safe fallbacks, not objects or password values', () => {
  seed([{}, { id: 1, displayName: {}, username: [], role: {}, password: 'secret-demo' }]);
  mount();
  expect(screen.getAllByText('Unknown account')).toHaveLength(2);
  expect(screen.getAllByText('Unknown role')).toHaveLength(2);
  expect(document.body.textContent).not.toContain('secret-demo');
});

it('unavailable account storage shows fixed admin and no stored accounts without crashing', () => {
  seed();
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  mount();
  expect(screen.getByText('No stored accounts yet.')).toBeInTheDocument();
});

it.each([writer, null, { role: 'admin' }])('non-admin direct page identity %s exposes no management form or listing', (session) => {
  seed();
  mount({ session });
  expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('real App Back to Dashboard link returns to guarded dashboard without a second Navbar', async () => {
  seed();
  mount({ app: true });
  await userEvent.click(screen.getByRole('link', { name: 'Back to Dashboard' }));
  expect(screen.getByRole('heading', { name: 'Admin Dashboard' })).toBeInTheDocument();
  expect(screen.getAllByRole('banner')).toHaveLength(1);
});
