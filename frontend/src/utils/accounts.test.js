/** @module accounts-tests Verify real browser-local account transitions and every rejection boundary. */
import { expect, it, vi } from 'vitest';
import { createAccount, removeAccount, getAdminCounts, getValidPosts } from './accounts';
import { authenticate, getSession, setSession } from './auth';
import { getUsers, saveUsers } from './storage';

const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const input = { displayName: ' New Name ', username: ' NewUser ', password: ' demo-exact ', role: 'user' };
const existing = { id: 'old', displayName: 'Old', username: 'old', password: 'old-demo', role: 'user', createdAt: '2025-01-01T00:00:00.000Z' };
const post = { id: 'p', title: 'Title', content: 'Body', authorId: 'old', authorName: 'Old', createdAt: '2025-01-01T00:00:00.000Z' };

/** Seed the real adapter and return immutable stored bytes for no-write assertions.
 * @param {Array} users Initial records.
 * @returns {string} Exact serialized users.
 */
function seed(users = [existing]) {
  setSession(admin);
  saveUsers(users);
  return localStorage.getItem('writespace_users');
}

it.each(['user', 'admin'])('creates a trimmed UUID/ISO $role account, preserves password exactly and authenticates', (role) => {
  seed();
  const sessionBefore = getSession();
  const result = createAccount(admin, { ...input, role });
  expect(result.ok).toBe(true);
  expect(result.account).not.toHaveProperty('password');
  const saved = getUsers()[1];
  expect(saved).toEqual({ ...result.account, password: input.password });
  expect(saved.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);
  expect(saved).toMatchObject({ displayName: 'New Name', username: 'NewUser', role });
  expect(getUsers()[0]).toEqual(existing);
  expect(getSession()).toEqual(sessionBefore);
  expect(authenticate(' newuser ', input.password)).toMatchObject({ ok: true, navigateTo: role === 'admin' ? '/admin' : '/blogs' });
  expect(getSession()).toMatchObject({ userId: saved.id, role });
  expect(getSession()).not.toHaveProperty('password');
});

it.each(['displayName', 'username', 'password', 'role'])('rejects every missing/invalid required %s with no write', (field) => {
  const before = seed();
  for (const value of [undefined, null, 12, {}, [], '', ' \t\n']) {
    const result = createAccount(admin, { ...input, [field]: value });
    expect(result).toMatchObject({ ok: false, fieldErrors: { [field]: 'This field is required.' } });
    expect(localStorage.getItem('writespace_users')).toBe(before);
  }
});

it.each([null, undefined, false, 123, [], 'input'])('rejects non-object input %s with all field errors', (value) => {
  const before = seed();
  expect(createAccount(admin, value)).toMatchObject({ ok: false, fieldErrors: {
    displayName: 'This field is required.', username: 'This field is required.', password: 'This field is required.', role: 'This field is required.',
  } });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['Admin', 'writer', 'USER', ' admin '])('rejects unsupported role %s', (role) => {
  const before = seed();
  expect(createAccount(admin, { ...input, role })).toMatchObject({ ok: false, fieldErrors: { role: 'Choose Admin or user.' } });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['old', ' OLD ', 'admin', ' AdMiN '])('rejects duplicate or reserved username %s without writes', (username) => {
  const before = seed([null, false, [], { username: {} }, existing]);
  const result = createAccount(admin, { ...input, username });
  expect(result).toMatchObject({ ok: false, fieldErrors: { username: 'Username is already taken.' } });
  expect(JSON.stringify(result)).not.toContain(input.password);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('checks duplicates added since page load and preserves malformed entries when adding a valid account', () => {
  seed([null, { username: 'NEWuser' }]);
  expect(createAccount(admin, input).ok).toBe(false);
  saveUsers([null, false, [], existing]);
  expect(createAccount(admin, input).ok).toBe(true);
  expect(getUsers().slice(0, 4)).toEqual([null, false, [], existing]);
});

it.each([null, writer, { role: 'admin' }, { ...admin, userId: 'forged' }, { ...admin, username: 'changed' },
  { ...admin, displayName: 'changed' }, { ...admin, role: 'Admin' }])('rejects unauthorized or mismatched caller %s for both mutations', (session) => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  expect(createAccount(session, input)).toMatchObject({ ok: false, error: 'You are not authorized to manage accounts.' });
  expect(removeAccount(session, existing.id, true)).toMatchObject({ ok: false, error: 'You are not authorized to manage accounts.' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it.each([null, writer, {}, { ...admin, displayName: 'Changed' }])('rejects a stale page session after current session becomes %s', (fresh) => {
  const before = seed();
  localStorage.setItem('writespace_session', JSON.stringify(fresh));
  expect(createAccount(admin, input).ok).toBe(false);
  expect(removeAccount(admin, 'old', true).ok).toBe(false);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['create', 'remove'])('rechecks identity immediately before %s save, even when it changes during users read', (action) => {
  const before = seed();
  const original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
    const value = original.call(this, key);
    if (key === 'writespace_users') localStorage.setItem('writespace_session', JSON.stringify(writer));
    return value;
  });
  const result = action === 'create' ? createAccount(admin, input) : removeAccount(admin, 'old', true);
  expect(result).toMatchObject({ ok: false, error: 'You are not authorized to manage accounts.' });
  expect(original.call(localStorage, 'writespace_users')).toBe(before);
});

it('fails generation without leaking credentials or writing users', () => {
  const before = seed();
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error(input.password); });
  const result = createAccount(admin, input);
  expect(result).toMatchObject({ ok: false, error: 'Unable to create a local account. Try again in a supported browser.' });
  expect(JSON.stringify(result)).not.toContain(input.password);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['old', 'admin'])('rejects generated ID collision %s', (id) => {
  const before = seed();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
  expect(createAccount(admin, input)).toMatchObject({ ok: false, error: 'Unable to create a unique local account. Try again.' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['create', 'remove'])('%s reports a storage write failure and preserves the original data', (action) => {
  const before = seed();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error(input.password); });
  const result = action === 'create' ? createAccount(admin, input) : removeAccount(admin, 'old', true);
  expect(result.ok).toBe(false);
  expect(result.error).toContain('Unable to save local data.');
  expect(result).not.toHaveProperty('account');
  expect(JSON.stringify(result)).not.toContain(input.password);
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each(['{bad', '{}', 'null'])('malformed users %s are not repaired by counts or missing-target deletion', (raw) => {
  setSession(admin);
  localStorage.setItem('writespace_users', raw);
  expect(getAdminCounts([], getUsers())['Total Users']).toBe(0);
  expect(removeAccount(admin, 'old', true)).toMatchObject({ ok: false, error: 'Account not found.' });
  expect(localStorage.getItem('writespace_users')).toBe(raw);
});

it('unavailable session storage denies both operations without writes', () => {
  seed();
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  expect(createAccount(admin, input).ok).toBe(false);
  expect(removeAccount(admin, 'old', true).ok).toBe(false);
});

it.each([false, undefined, null, 1, 'true'])('cancelled or nonboolean confirmation %s never writes', (confirmed) => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  expect(removeAccount(admin, 'old', confirmed)).toEqual({ ok: false, error: '' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it.each(['admin', 'reserved'])('direct calls reject fixed id or reserved username %s', (id) => {
  const before = seed([existing, { ...existing, id: 'reserved', username: ' AdMiN ' }]);
  expect(removeAccount(admin, id, true)).toMatchObject({ ok: false, error: 'Default admin cannot be deleted.' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('direct calls reject the current created-admin account while allowing another admin removal', () => {
  const current = { ...admin, userId: 'local', username: 'local', displayName: 'Local' };
  const row = { ...existing, id: 'local', username: 'local', role: 'admin' };
  const other = { ...row, id: 'other', username: 'other' };
  seed([row, other]);
  setSession(current);
  expect(removeAccount(current, 'local', true)).toMatchObject({ ok: false, error: 'Your current account cannot be deleted.' });
  expect(getUsers()).toEqual([row, other]);
  expect(removeAccount(current, 'other', true)).toEqual({ ok: true });
  expect(getUsers()).toEqual([row]);
  expect(getSession()).toEqual(current);
});

it.each([undefined, null, '', ' ', 2, 'missing', 'OLD'])('unknown target %s has no write', (id) => {
  const before = seed([null, false, [], existing]);
  expect(removeAccount(admin, id, true)).toMatchObject({ ok: false, error: 'Account not found.' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it.each([[[{ ...existing, username: null }]], [[{ ...existing, username: '' }]], [[existing, existing]]])('ambiguous or malformed target %s fails closed', (users) => {
  const before = seed(users);
  expect(removeAccount(admin, 'old', true)).toMatchObject({ ok: false, error: 'Invalid account. Unable to remove this local record.' });
  expect(localStorage.getItem('writespace_users')).toBe(before);
});

it('confirmed removal rereads fresh users, preserves unrelated entries and leaves posts/session untouched', () => {
  seed();
  localStorage.setItem('writespace_posts', JSON.stringify([post]));
  const sessionBefore = getSession();
  const fresh = { ...existing, id: 'later', username: 'later' };
  saveUsers([null, existing, fresh]);
  expect(removeAccount(admin, 'old', true)).toEqual({ ok: true });
  expect(getUsers()).toEqual([null, fresh]);
  expect(getSession()).toEqual(sessionBefore);
  expect(JSON.parse(localStorage.getItem('writespace_posts'))).toEqual([post]);
});

it('counts exact distinct populations and selects only complete posts without mutating arrays', () => {
  const posts = [post, null, {}, { ...post, title: ' ' }, { ...post, createdAt: 'bad' }, { ...post, authorName: 1 }];
  const users = [existing, { ...existing, role: 'admin' }, null, { role: 'unknown' }];
  const before = JSON.stringify({ posts, users });
  expect(getValidPosts(posts)).toEqual([post]);
  expect(getAdminCounts(posts, users)).toEqual({ 'Total Posts': 1, 'Total Users': 4, 'Total Admins': 2, 'Total users': 1 });
  expect(JSON.stringify({ posts, users })).toBe(before);
});

it.each([null, undefined, {}, '[]', 1])('invalid list inputs %s give safe empty counts with one fixed admin', (value) => {
  expect(getValidPosts(value)).toEqual([]);
  expect(getAdminCounts(value, value)).toEqual({ 'Total Posts': 0, 'Total Users': 0, 'Total Admins': 1, 'Total users': 0 });
});
