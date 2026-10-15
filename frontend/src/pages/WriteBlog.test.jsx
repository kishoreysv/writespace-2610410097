/** @module write-tests Verify the real create service, persistence and guarded route composition. */
import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import WriteBlog from './WriteBlog';
import App from '../App';
import { getPosts, savePosts } from '../utils/storage';
import { setSession } from '../utils/auth';

const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };

/** Mount a real write route and explicit destination, or the full App layout.
 * @param {object} options Identity and App selection.
 * @returns {object} RTL view.
 */
function mount({ session = writer, app = false, strict = false } = {}) {
  const content = (
    <MemoryRouter initialEntries={['/write']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {app ? <App /> : (
        <Routes>
          <Route path="/write" element={<WriteBlog session={session} />} />
          <Route path="/blog/:id" element={<h1>Saved reader</h1>} />
          <Route path="/blogs" element={<h1>Blogs destination</h1>} />
        </Routes>
      )}
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

/** Fill the public form controls without touching product state.
 * @param {string} title Draft title.
 * @param {string} content Draft content.
 */
function fill(title = 'A beginning', content = ' First\n\nSecond line ') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: title } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: content } });
}

it.each(['user', 'admin'])('saves a real %s post with persisted authorship before navigating to its reader', async (role) => {
  const session = { ...writer, role };
  setSession(session);
  mount({ session, app: true });
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  fill();
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  const posts = getPosts();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ title: 'A beginning', content: ' First\n\nSecond line ', authorId: 'writer', authorName: 'Writer' });
  expect(screen.getByRole('heading', { name: 'A beginning' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `/edit/${posts[0].id}`);
  expect(screen.getAllByRole('banner')).toHaveLength(1);
});

it.each([
  ['', '', ['Title', 'Content']], ['', 'Body', ['Title']], ['Title', '', ['Content']],
  [' \t', 'Body', ['Title']], ['Title', ' \n', ['Content']],
])('blocks invalid fields %s / %s without a write or navigation', async (title, content, invalidFields) => {
  setSession(writer);
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  mount();
  fill(title, content);
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  for (const name of invalidFields) expect(screen.getByText(`${name} is required.`)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Write a Post' })).toBeInTheDocument();
  expect(getPosts()).toEqual([]);
  expect(setter).not.toHaveBeenCalled();
});

it('write storage failure shows an actionable alert, retains the draft and stays on the form', async () => {
  setSession(writer);
  savePosts([{ id: 'existing', title: 'Existing' }]);
  const before = localStorage.getItem('writespace_posts');
  mount();
  fill();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A beginning');
  expect(screen.queryByText('Saved reader')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('UUID generation failure is an inline error with no successful navigation', async () => {
  setSession(writer);
  mount();
  fill();
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('unsupported'); });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('alert')).toHaveTextContent('supported browser');
  expect(getPosts()).toEqual([]);
  expect(screen.getByRole('heading', { name: 'Write a Post' })).toBeInTheDocument();
});

it.each(['changed', 'cleared', 'malformed'])('handler rejects %s stored identity after the page loads without saving', async (change) => {
  setSession(writer);
  mount();
  fill();
  if (change === 'changed') setSession({ ...writer, userId: 'other', username: 'other' });
  if (change === 'cleared') localStorage.removeItem('writespace_session');
  if (change === 'malformed') localStorage.setItem('writespace_session', '{}');
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  expect(getPosts()).toEqual([]);
});

it('missing supplied identity cannot create a post even when storage is signed in', async () => {
  setSession(writer);
  mount({ session: null });
  fill();
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  expect(getPosts()).toEqual([]);
});

it('Cancel leaves both existing records and the unsaved draft unpersisted', async () => {
  setSession(writer);
  savePosts([{ id: 'existing', title: 'Existing' }]);
  const before = localStorage.getItem('writespace_posts');
  mount();
  fill();
  await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(screen.getByText('Blogs destination')).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each([null, '{}', '{bad', '{"role":"Admin"}'])('App guards guest/malformed direct write entry %s', (raw) => {
  if (raw) localStorage.setItem('writespace_session', raw);
  mount({ app: true });
  expect(screen.getByRole('heading', { name: 'Login', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save Post' })).not.toBeInTheDocument();
  expect(getPosts()).toEqual([]);
});

it('StrictMode mount remains inert with one Navbar and no network or storage writes', () => {
  setSession(writer);
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  mount({ app: true, strict: true });
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Save Post' })).toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(xhr).not.toHaveBeenCalled();
  expect(getPosts()).toEqual([]);
});
