/** @module posts-tests Exercise real storage mutation results, validation and fresh identity/ownership boundaries. */
import { expect, it, vi } from 'vitest';
import { createPost, editPost, deletePost, validatePostFields } from './posts';
import { setSession } from './auth';
import { getPosts, savePosts } from './storage';

const owner = { userId: 'owner', username: 'owner', displayName: 'Owner', role: 'user' };
const other = { userId: 'other', username: 'other', displayName: 'Other', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const original = { id: 'one', title: 'Original', content: 'Original body', authorId: 'owner', authorName: 'Owner', createdAt: '2025-01-02T10:00:00.000Z' };

/** Seed actual local records and identity, returning bytes for unchanged-state assertions.
 * @param {object} session Expected actor.
 * @param {Array} posts Initial records.
 * @returns {string} Persisted post bytes.
 */
function seed(session = owner, posts = [original]) {
  setSession(session);
  savePosts(posts);
  return localStorage.getItem('writespace_posts');
}

/** Invoke any public mutation directly, without a route guard or hidden control.
 * @param {string} action Operation under test.
 * @param {*} session Expected identity.
 * @returns {object} Mutation result.
 */
function mutate(action, session) {
  if (action === 'create') return createPost('New', 'Body', session);
  if (action === 'edit') return editPost('one', 'New', 'Body', session);
  return deletePost('one', session, true);
}

it.each(['user', 'admin'])('creates and persists UUID/ISO/session-derived author for %s with exact text', (role) => {
  const session = role === 'admin' ? admin : owner;
  seed(session);
  const title = '  Plain <script>title</script>  ';
  const content = '  First\n\nSecond\tline  ';
  const before = Date.now();
  const result = createPost(title, content, session);
  expect(result.ok).toBe(true);
  expect(result.error).toBe('');
  expect(result.post.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(new Date(result.post.createdAt).toISOString()).toBe(result.post.createdAt);
  expect(Date.parse(result.post.createdAt)).toBeGreaterThanOrEqual(before);
  expect(result.post).toEqual({ id: result.post.id, createdAt: result.post.createdAt, title, content, authorId: session.userId, authorName: session.displayName });
  expect(result.navigateTo).toBe(`/blog/${result.post.id}`);
  expect(getPosts()).toEqual([original, result.post]);
});

it.each([
  [undefined, 'Body', ['title']], ['Title', undefined, ['content']], ['', 'Body', ['title']],
  ['Title', '', ['content']], [' \t\n', 'Body', ['title']], ['Title', ' \t\n', ['content']],
  [null, false, ['title', 'content']], [9, {}, ['title', 'content']], [[], [], ['title', 'content']],
])('rejects required/invalid text %s / %s in validation and create/edit without writes', (title, content, fields) => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const validation = validatePostFields(title, content);
  expect(validation.ok).toBe(false);
  expect(Object.keys(validation.fieldErrors)).toEqual(fields);
  for (const result of [createPost(title, content, owner), editPost('one', title, content, owner)]) {
    expect(result).toEqual(validation);
    expect(result.navigateTo).toBeUndefined();
  }
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it('has no maximum title/content length and preserves large text on create and edit', () => {
  seed();
  const title = 'T'.repeat(10000);
  const content = 'X\n'.repeat(100000);
  expect(validatePostFields(title, content)).toEqual({ ok: true, error: '' });
  const created = createPost(title, content, owner);
  expect(created.ok).toBe(true);
  expect(getPosts().find((post) => post.id === created.post.id).content).toBe(content);
  const edited = editPost('one', title, content, owner);
  expect(edited.ok).toBe(true);
  expect(getPosts().find((post) => post.id === 'one')).toEqual({ ...original, title, content });
});

it.each(['create', 'edit', 'delete'])('direct %s rejects absent, malformed, unknown-role and forged supplied identities', (action) => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  for (const session of [null, undefined, {}, [], { ...owner, role: 'Admin' }, { ...owner, userId: 'other' }, { ...owner, username: 'wrong' }, { ...owner, displayName: 'Forged' }, { ...owner, role: 'admin' }]) {
    const result = mutate(action, session);
    expect(result).toMatchObject({ ok: false, navigateTo: '/blogs' });
    expect(result.error).toMatch(/not authorized/);
    expect(result.post).toBeUndefined();
  }
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it.each(['create', 'edit', 'delete'])('direct %s rereads current session and rejects stale, cleared and malformed storage', (action) => {
  seed();
  for (const raw of [JSON.stringify(other), JSON.stringify({ ...owner, role: 'admin' }), JSON.stringify({ ...owner, displayName: 'Changed' }), '{broken', '{}', 'null', null]) {
    if (raw === null) localStorage.removeItem('writespace_session');
    else localStorage.setItem('writespace_session', raw);
    const before = localStorage.getItem('writespace_posts');
    const result = mutate(action, owner);
    expect(result).toMatchObject({ ok: false, navigateTo: '/blogs' });
    expect(localStorage.getItem('writespace_posts')).toBe(before);
  }
});

it.each(['edit', 'delete'])('direct %s rejects a freshly signed-in cross-owner user', (action) => {
  const before = seed(other);
  const result = mutate(action, other);
  expect(result).toMatchObject({ ok: false, navigateTo: '/blogs' });
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each([owner, admin])('edits as $role preserving id, authorship, original date and unrelated records', (session) => {
  const unrelated = { ...original, id: 'two', authorId: 'other' };
  seed(session, [original, unrelated]);
  const result = editPost('one', 'Revised', ' Revised\nbody ', session);
  expect(result).toEqual({ ok: true, error: '', post: { ...original, title: 'Revised', content: ' Revised\nbody ' }, navigateTo: '/blog/one' });
  expect(getPosts()).toEqual([result.post, unrelated]);
});

it.each([owner, admin])('deletes as $role only the confirmed target and persists collection destination', (session) => {
  const unrelated = { ...original, id: 'two', authorId: 'other' };
  seed(session, [unrelated, original]);
  expect(deletePost('one', session, true)).toEqual({ ok: true, error: '', navigateTo: '/blogs' });
  expect(getPosts()).toEqual([unrelated]);
});

it.each([false, undefined, null, 0, 1, 'true', {}, []])('cancel or non-boolean confirmation %s never writes or navigates', (confirmed) => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  expect(deletePost('one', owner, confirmed)).toEqual({ ok: false, error: '' });
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it.each([undefined, null, '', ' ', 1, {}, 'ONE', 'unknown'])('missing/invalid target %s gives exact missing result for edit and delete', (id) => {
  const before = seed();
  expect(editPost(id, 'New', 'Body', owner)).toEqual({ ok: false, error: 'Post not found' });
  expect(deletePost(id, owner, true)).toEqual({ ok: false, error: 'Post not found' });
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each([
  { title: null }, { title: ' ' }, { content: {} }, { content: '' }, { authorId: null },
  { authorName: [] }, { createdAt: 'bad' }, { createdAt: null },
])('malformed target %s fails closed even for admin without changing stored bytes', (fields) => {
  const before = seed(admin, [null, false, [], { ...original, ...fields }]);
  for (const result of [editPost('one', 'New', 'Body', admin), deletePost('one', admin, true)]) {
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid post/);
    expect(result.navigateTo).toBeUndefined();
  }
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('rejects ambiguous duplicate IDs and preserves both records', () => {
  const before = seed(admin, [original, { ...original, authorId: 'other' }]);
  expect(editPost('one', 'New', 'Body', admin).error).toMatch(/Invalid post/);
  expect(deletePost('one', admin, true).error).toMatch(/Invalid post/);
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('preserves malformed unrelated entries during explicit create/edit/delete', () => {
  const malformed = [null, 9, false, [], { id: {}, title: {} }];
  seed(owner, [...malformed, original]);
  const created = createPost('New', 'Body', owner);
  expect(created.ok).toBe(true);
  expect(getPosts()).toEqual([...malformed, original, created.post]);
  expect(editPost('one', 'Updated', 'Body', owner).ok).toBe(true);
  expect(getPosts().slice(0, 5)).toEqual(malformed);
  expect(deletePost('one', owner, true).ok).toBe(true);
  expect(getPosts()).toEqual([...malformed, created.post]);
});

it.each(['create', 'edit', 'delete'])('%s rereads the current stored list, not a previously loaded snapshot', (action) => {
  seed();
  const snapshot = getPosts();
  const freshTarget = { ...original, authorName: 'Fresh name', createdAt: '2026-01-01T00:00:00.000Z' };
  const added = { ...original, id: 'later' };
  savePosts([freshTarget, added]);
  const result = mutate(action, owner);
  expect(result.ok).toBe(true);
  expect(getPosts()).toContainEqual(added);
  expect(snapshot).toEqual([original]);
  if (action === 'edit') expect(result.post).toEqual({ ...freshTarget, title: 'New', content: 'Body' });
  if (action === 'delete') expect(getPosts()).toEqual([added]);
});

it.each(['edit', 'delete'])('%s rechecks changed ownership and a removed target at handler time', (action) => {
  seed();
  savePosts([{ ...original, authorId: 'other' }]);
  const before = localStorage.getItem('writespace_posts');
  expect(mutate(action, owner)).toMatchObject({ ok: false, navigateTo: '/blogs' });
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  savePosts([]);
  expect(mutate(action, owner)).toEqual({ ok: false, error: 'Post not found' });
  expect(getPosts()).toEqual([]);
});

it.each(['{bad', '{}', 'null'])('malformed stored lists %s give safe missing targets and allow explicit new posts', (raw) => {
  setSession(owner);
  localStorage.setItem('writespace_posts', raw);
  expect(editPost('one', 'New', 'Body', owner).error).toBe('Post not found');
  expect(deletePost('one', owner, true).error).toBe('Post not found');
  expect(localStorage.getItem('writespace_posts')).toBe(raw);
  const created = createPost('New', 'Body', owner);
  expect(created.ok).toBe(true);
  expect(getPosts()).toEqual([created.post]);
});

it('creates from a missing post key', () => {
  setSession(owner);
  const result = createPost('First', 'Body', owner);
  expect(result.ok).toBe(true);
  expect(getPosts()).toEqual([result.post]);
});

it.each(['create', 'edit', 'delete'])('%s storage set failure returns no success destination and preserves persisted state', (action) => {
  const before = seed();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const result = mutate(action, owner);
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Unable to save local data/);
  expect(result.post).toBeUndefined();
  expect(result.navigateTo).toBeUndefined();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each(['create', 'edit', 'delete'])('%s unavailable storage fails safely without success', (action) => {
  seed();
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  const result = mutate(action, owner);
  expect(result.ok).toBe(false);
  expect(result.post).toBeUndefined();
});

it('session getter failure rejects even while posts remain readable', () => {
  const before = seed();
  const read = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === 'writespace_session') throw new Error('denied');
    return read.call(this, key);
  });
  expect(createPost('New', 'Body', owner)).toMatchObject({ ok: false, navigateTo: '/blogs' });
  expect(editPost('one', 'New', 'Body', owner).ok).toBe(false);
  expect(deletePost('one', owner, true).ok).toBe(false);
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('post getter failure returns a safe missing target without overwriting stored bytes', () => {
  const before = seed();
  const read = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
    if (key === 'writespace_posts') throw new Error('denied');
    return read.call(this, key);
  });
  expect(editPost('one', 'New', 'Body', owner).error).toBe('Post not found');
  expect(deletePost('one', owner, true).error).toBe('Post not found');
  expect(read.call(localStorage, 'writespace_posts')).toBe(before);
});

it('UUID failure and collision return explicit errors without a write', () => {
  const before = seed();
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unsupported'); });
  expect(createPost('New', 'Body', owner).error).toMatch(/supported browser/);
  uuid.mockReturnValue('one');
  expect(createPost('New', 'Body', owner).error).toMatch(/unique local post/);
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});
