/** @module dashboard-tests Verify counters, recent previews, guarded wiring and real post mutation outcomes. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import App from '../App';
import { setSession } from '../utils/auth';
import { getPosts, savePosts, saveUsers } from '../utils/storage';

const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const writer = { userId: 'writer', username: 'writer', displayName: 'Writer', role: 'user' };
const post = { id: 'one', title: 'Writer story', content: 'A writer story body', authorId: 'writer', authorName: 'Writer', createdAt: '2025-01-01T00:00:00.000Z' };
const account = { id: 'writer', username: 'writer', displayName: 'Writer', password: 'demo-only', role: 'user', createdAt: post.createdAt };

/** Seed complete records through the real boundary before mounting.
 * @param {Array} posts Initial posts.
 * @param {Array} users Initial accounts.
 * @returns {string} Exact persisted posts for no-write assertions.
 */
function seed(posts = [post], users = [account]) {
  setSession(admin);
  savePosts(posts);
  saveUsers(users);
  return localStorage.getItem('writespace_posts');
}

/** Mount the real App or a page with observable linked destinations.
 * @param {object} options Session, initial route and App selection.
 * @returns {object} RTL view.
 */
function mount({ session = admin, path = '/admin', app = false } = {}) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {app ? <App /> : (
          <Routes>
            <Route path="/admin" element={<AdminDashboard session={session} />} />
            <Route path="/write" element={<h1>Write destination</h1>} />
            <Route path="/users" element={<h1>Users destination</h1>} />
            <Route path="/blogs" element={<h1>Blogs destination</h1>} />
            <Route path="/edit/:id" element={<h1>Edit destination</h1>} />
          </Routes>
        )}
      </MemoryRouter>
    </StrictMode>,
  );
}

it('shows four exact metrics with distinct explanatory formulas and no render-time mutation', () => {
  const before = seed([post, null, { ...post, createdAt: 'bad' }], [account, { ...account, id: 'a', role: 'admin' }, null]);
  const usersBefore = localStorage.getItem('writespace_users');
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const confirm = vi.spyOn(window, 'confirm');
  mount({ app: true });
  for (const [label, value] of [['Total Posts', '1'], ['Total Users', '3'], ['Total Admins', '2'], ['Total users', '1']]) {
    expect(within(screen.getByRole('region', { name: label, exact: true })).getByText(value)).toBeInTheDocument();
  }
  expect(screen.getByText('Stored writer-role (user) accounts only.')).toBeInTheDocument();
  expect(screen.getByText('Stored admin-role accounts plus the fixed admin.')).toBeInTheDocument();
  expect(screen.getByText('All stored account entries; excludes the fixed admin.')).toBeInTheDocument();
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText(post.content)).toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(localStorage.getItem('writespace_users')).toBe(usersBefore);
});

it('caps actual BlogCards at five newest complete posts while counting all seven valid posts', () => {
  const posts = Array.from({ length: 7 }, (_, index) => ({ ...post, id: `p${index}`, title: `Story ${index}`, createdAt: `2025-01-0${index + 1}T00:00:00.000Z` }));
  const before = seed([...posts, null, {}, { ...post, title: ' ' }]);
  mount();
  expect(screen.getAllByRole('article')).toHaveLength(5);
  expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
    'Story 6', 'Story 5', 'Story 4', 'Story 3', 'Story 2',
  ]);
  expect(within(screen.getByRole('region', { name: 'Total Posts' })).getByText('7')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Story 1', exact: true })).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each([0, 1, 4, 5])('renders all %s available valid posts up to the cap', (count) => {
  seed(Array.from({ length: count }, (_, index) => ({ ...post, id: `p${index}` })));
  mount();
  expect(screen.queryAllByRole('article')).toHaveLength(count);
  if (!count) expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
});

it.each(['{bad', '{}', 'null', '[null,false,{},[]]'])('malformed lists %s give safe empty state without repair', (raw) => {
  setSession(admin);
  localStorage.setItem('writespace_posts', raw);
  localStorage.setItem('writespace_users', raw);
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  mount();
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Total Admins' })).getByText('1')).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(raw);
  expect(localStorage.getItem('writespace_users')).toBe(raw);
  expect(setter).not.toHaveBeenCalled();
});

it('unavailable storage shows empty data without crashing or attempting repairs', () => {
  seed();
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  mount();
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
});

it.each([['Write New Post', 'Write destination'], ['Manage Users', 'Users destination'], ['All Blogs', 'Blogs destination'],
  ['Edit Writer story', 'Edit destination']])('explicit %s link reaches %s without data changes', async (label, destination) => {
  const before = seed();
  mount();
  await userEvent.click(screen.getByRole('link', { name: label }));
  expect(screen.getByRole('heading', { name: destination })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('cancelled post deletion leaves persisted and displayed state unchanged', async () => {
  const before = seed();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(screen.getByRole('link', { name: 'Writer story', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('admin deletes another author post, requerying fresh records and updating counters only after save', async () => {
  seed();
  mount();
  const added = { ...post, id: 'later', title: 'Later writer post' };
  savePosts([post, added]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(getPosts()).toEqual([added]);
  expect(screen.queryByRole('link', { name: 'Writer story', exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Later writer post', exact: true })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Total Posts' })).getByText('1')).toBeInTheDocument();
});

it('successful final deletion shows the empty state and zero posts', async () => {
  seed();
  mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(getPosts()).toEqual([]);
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Total Posts' })).getByText('0')).toBeInTheDocument();
});

it('failed post write leaves list/count unchanged, reports an alert and clears it after a later successful delete', async () => {
  const before = seed();
  mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(localStorage.getItem('writespace_posts')).toBe(before);
  expect(screen.getByRole('link', { name: 'Writer story', exact: true })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Total Posts' })).getByText('1')).toBeInTheDocument();
  setter.mockRestore();
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(getPosts()).toEqual([]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['session', 'missing', 'invalid', 'ambiguous'])('handler-time %s change rejects deletion and leaves displayed list as-is', async (change) => {
  seed();
  mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  if (change === 'session') setSession(writer);
  if (change === 'missing') savePosts([]);
  if (change === 'invalid') savePosts([{ ...post, title: '' }]);
  if (change === 'ambiguous') savePosts([post, post]);
  const before = localStorage.getItem('writespace_posts');
  await userEvent.click(screen.getByRole('button', { name: 'Delete Writer story' }));
  expect(screen.getByRole('alert')).toHaveTextContent(change === 'session' ? 'not authorized' : change === 'missing' ? 'Post not found' : 'Invalid post');
  expect(screen.getByRole('link', { name: 'Writer story', exact: true })).toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it.each([writer, null, { role: 'admin' }])('direct non-admin page rendering %s never offers admin controls', (session) => {
  seed();
  mount({ session });
  expect(screen.getByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('Total Posts')).not.toBeInTheDocument();
});

it.each([['/admin', writer, 'All Blogs'], ['/admin', null, 'Login'], ['/users', writer, 'All Blogs'],
  ['/users', null, 'Login']])('App guards initial entry %s for %s', (path, session, heading) => {
  seed();
  if (session) setSession(session);
  else localStorage.removeItem('writespace_session');
  const before = localStorage.getItem('writespace_posts');
  mount({ path, app: true });
  expect(screen.getByRole('heading', { name: heading, exact: true })).toBeInTheDocument();
  expect(screen.queryByText('Create User')).not.toBeInTheDocument();
  expect(screen.queryByText('Total Posts')).not.toBeInTheDocument();
  expect(localStorage.getItem('writespace_posts')).toBe(before);
});

it('App wires admin Edit to the real authoring override with a single navbar', async () => {
  seed();
  mount({ app: true });
  await userEvent.click(screen.getByRole('link', { name: 'Edit Writer story' }));
  expect(screen.getByRole('heading', { name: 'Edit Post' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(post.title);
  expect(screen.getAllByRole('banner')).toHaveLength(1);
});
