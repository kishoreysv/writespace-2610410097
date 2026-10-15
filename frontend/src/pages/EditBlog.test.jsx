/** @module edit-tests Exercise real ownership guards, text-only persistence and failed/stale saves. */
import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import EditBlog from './EditBlog';
import App from '../App';
import { getPosts, savePosts } from '../utils/storage';
import { setSession } from '../utils/auth';

const owner = { userId: 'owner', username: 'owner', displayName: 'Owner', role: 'user' };
const other = { userId: 'other', username: 'other', displayName: 'Other', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const original = { id: 'one', title: 'Original', content: 'Original\nbody', authorId: 'owner', authorName: 'Owner', createdAt: '2025-01-02T10:00:00.000Z' };

/** Seed browser-local identity and complete post, preserving the real boundary.
 * @param {object} session Actor.
 * @param {Array} posts Records.
 * @returns {string} Persisted bytes.
 */
function seed(session = owner, posts = [original]) {
  setSession(session);
  savePosts(posts);
  return localStorage.getItem('writespace_posts');
}

/** Mount a params route and observable destinations or real App composition.
 * @param {object} options Identity, initial path and layout selection.
 * @returns {object} RTL view.
 */
function mount({ session = owner, path = '/edit/one', app = false, strict = false } = {}) {
  const content = (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {app ? <App /> : (
        <Routes>
          <Route path="/edit/:id" element={<EditBlog session={session} />} />
          <Route path="/missing-param" element={<EditBlog session={session} />} />
          <Route path="/blogs" element={<h1>Blogs destination</h1>} />
          <Route path="/blog/:id" element={<h1>Saved reader</h1>} />
        </Routes>
      )}
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

it.each([owner, admin])('prefills and saves as $role, preserving original metadata and unrelated records', async (session) => {
  const unrelated = { ...original, id: 'two', title: 'Unrelated', authorId: 'other' };
  seed(session, [original, unrelated]);
  mount({ session, app: true });
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Original');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Original\nbody');
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Revised' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: ' Revised\nbody ' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(getPosts()).toEqual([{ ...original, title: 'Revised', content: ' Revised\nbody ' }, unrelated]);
  expect(screen.getByRole('heading', { name: 'Revised' })).toBeInTheDocument();
  expect(screen.getByText('Jan 02, 2025')).toBeInTheDocument();
  expect(screen.getAllByRole('banner')).toHaveLength(1);
});

it.each([other, null, { ...owner, role: 'admin' }, { ...owner, username: 'forged' }])('initial unauthorized identity %s redirects to blogs with no form or writes', (session) => {
  const before = seed(session === other ? other : owner);
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  mount({ session });
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it.each([
  ['/edit/unknown', [original]], ['/edit/ONE', [original]], ['/edit/%20', [{ ...original, id: ' ' }]],
  ['/missing-param', [original]], ['/edit/one', [null, false, [], { id: 1 }]], ['/edit/one', []],
])('missing target %s shows exact recovery rather than an edit form', async (path, posts) => {
  const before = seed(owner, posts);
  mount({ path });
  expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  await userEvent.click(screen.getByRole('link', { name: 'Back to Blogs' }));
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
});

it.each(['{bad', '{}', 'null'])('unreadable posts %s show missing state without repairing storage', (raw) => {
  setSession(owner);
  localStorage.setItem('writespace_posts', raw);
  mount();
  expect(screen.getByText('Post not found')).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(raw);
});

it('unavailable post storage shows a safe missing state', () => {
  seed();
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  mount();
  expect(screen.getByText('Post not found')).toBeInTheDocument();
});

it.each([
  ['', 'Body', 'Title'], ['Title', '', 'Content'], [' \t', 'Body', 'Title'], ['Title', ' \n', 'Content'],
])('invalid replacement %s / %s keeps the original persisted post and form', async (title, content, invalid) => {
  const before = seed();
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: title } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: content } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByText(`${invalid} is required.`)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Edit Post' })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('write failure is an inline alert without navigating or losing the edited draft', async () => {
  const before = seed();
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Unsaved revision' } });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Unsaved revision');
  expect(screen.queryByText('Saved reader')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each(['ownership', 'session', 'cleared', 'malformed'])('handler rejects changed %s after prefill and redirects without writes', async (change) => {
  seed();
  mount();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Original');
  if (change === 'ownership') savePosts([{ ...original, authorId: 'other' }]);
  if (change === 'session') setSession(other);
  if (change === 'cleared') localStorage.removeItem('writespace_session');
  if (change === 'malformed') localStorage.setItem('writespace_session', '{}');
  const before = localStorage.getItem('writespace_posts');
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(setter).not.toHaveBeenCalled();
});

it('handler-time removed target replaces the form with Post not found and recovery', async () => {
  seed();
  mount();
  savePosts([]);
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Blogs' })).toHaveAttribute('href', '/blogs');
  expect(getPosts()).toEqual([]);
});

it('handler reuses fresh metadata and preserves posts added after prefill', async () => {
  seed();
  mount();
  const fresh = { ...original, authorName: 'Fresh author name', createdAt: '2026-01-02T00:00:00.000Z' };
  const added = { ...original, id: 'later' };
  savePosts([fresh, added]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Revised' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByText('Saved reader')).toBeInTheDocument();
  expect(getPosts()).toEqual([{ ...fresh, title: 'Revised' }, added]);
});

it('Cancel returns to blogs without saving edited text', async () => {
  const before = seed();
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Discard this' } });
  await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(screen.getByText('Blogs destination')).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('malformed display fields are safe in the form but invalid stored metadata cannot be saved', async () => {
  const before = seed(owner, [{ ...original, title: {}, content: null }]);
  mount();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'New' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: 'Body' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Invalid post.');
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('changed route params refresh the prefilled form without stale draft/errors', async () => {
  seed(owner, [original, { ...original, id: 'two', title: 'Second', content: 'Second body' }]);
  render(
    <MemoryRouter initialEntries={['/edit/one']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Link to="/edit/two">
        Next draft
      </Link>
      <Routes>
        <Route path="/edit/:id" element={<EditBlog session={owner} />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: '' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(screen.getByText('Title is required.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Next draft' }));
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Second');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Second body');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('StrictMode owner mount is inert with one Navbar and no product network calls', () => {
  const before = seed();
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  mount({ app: true, strict: true });
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(xhr).not.toHaveBeenCalled();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('App guest direct edit entry redirects to Login without exposing draft text', () => {
  savePosts([original]);
  mount({ app: true });
  expect(screen.getByRole('heading', { name: 'Login', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Content' })).not.toBeInTheDocument();
  expect(getPosts()).toEqual([original]);
});
