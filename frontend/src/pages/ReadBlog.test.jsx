/** @module reader-tests Verify exact local lookup, escaped full text, recovery and route guards. */
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import ReadBlog from './ReadBlog';
import App from '../App';
import { savePosts } from '../utils/storage';

const writer = { userId: 'riley', username: 'riley', displayName: 'Riley', role: 'user' };

/** Mount the reader with a real params route, or exercise App composition.
 * @param {object} options Entry path, App selection and StrictMode.
 * @returns {object} RTL view.
 */
function mount({ path = '/blog/one', app = false, strict = false } = {}) {
  const content = (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {app ? <App /> : (
        <Routes>
          <Route path="/blog/:id" element={<ReadBlog />} />
          <Route path="/missing-param" element={<ReadBlog />} />
        </Routes>
      )}
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

it('renders the exact requested post with full whitespace-preserving content and metadata', () => {
  const content = '  First line\n\nSecond\tline  ' + 'Beyond the excerpt. '.repeat(30);
  savePosts([
    { id: 'other', title: 'Other post', content: 'Not selected' },
    { id: 'one', title: 'Selected post', content, authorId: 'riley', authorName: 'Riley', createdAt: '2025-01-02T23:59:00Z' },
  ]);
  const { container } = mount();
  expect(screen.getByRole('heading', { level: 1, name: 'Selected post' })).toBeInTheDocument();
  expect(screen.queryByText('Not selected')).not.toBeInTheDocument();
  expect(screen.getByText('Riley')).toBeInTheDocument();
  expect(screen.getByText('Jan 02, 2025')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Writer avatar' })).toBeInTheDocument();
  const body = container.querySelector('.whitespace-pre-wrap');
  expect(body.textContent).toBe(content);
  expect(body.textContent.length).toBeGreaterThan(120);
  expect(screen.getByRole('link', { name: 'Back to Blogs' })).toHaveAttribute('href', '/blogs');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it.each([
  ['admin', 'Admin avatar'], ['riley', 'Writer avatar'], [undefined, 'Writer avatar'],
])('uses author identity %s for display-only avatar adaptation', (authorId, label) => {
  savePosts([{ id: 'one', title: 'Avatar post', authorId, authorName: 'Admin' }]);
  mount();
  expect(screen.getByRole('img', { name: label })).toBeInTheDocument();
});

it('escapes script and image markup across title, author and full content', () => {
  const title = '<script>window.readerXss = true</script>';
  const content = '<img src=x onerror="window.readerXss=true">\n<script>alert(1)</script>';
  const authorName = '<b>Author</b>';
  savePosts([{ id: 'one', title, content, authorName }]);
  const { container } = mount();
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.getByText(authorName)).toBeInTheDocument();
  expect(container.querySelector('.whitespace-pre-wrap').textContent).toBe(content);
  expect(container.querySelector('script, img, b')).toBeNull();
  expect(window.readerXss).toBeUndefined();
});

it.each([
  {}, { title: {}, content: {}, authorName: [], createdAt: {} },
  { title: null, content: 9, authorName: false, createdAt: 'invalid' },
])('keeps matching records with malformed display fields safe: %s', (fields) => {
  savePosts([null, false, 1, [], { id: 'one', ...fields }]);
  const { container } = mount();
  expect(screen.getByRole('heading', { name: 'Untitled post' })).toBeInTheDocument();
  expect(screen.getByText('Unknown author')).toBeInTheDocument();
  expect(screen.getByText('Unknown date')).toBeInTheDocument();
  expect(container.querySelector('.whitespace-pre-wrap').textContent).toBe('');
});

it.each([
  ['/blog/unknown', [{ id: 'one', title: 'Exists' }]],
  ['/blog/ONE', [{ id: 'one', title: 'Case sensitive' }]],
  ['/blog/1', [{ id: 1, title: 'Do not coerce' }]],
  ['/blog/%20', [{ id: ' ', title: 'Blank ID' }]],
  ['/missing-param', [{ title: 'Missing ID' }]],
  ['/blog/one', [null, 4, false, [], { id: {} }, { id: null }]],
  ['/blog/one', []],
])('shows exact Post not found and collection recovery for %s', (path, posts) => {
  savePosts(posts);
  mount({ path });
  expect(screen.getByRole('heading', { name: 'Post not found', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Blogs' })).toHaveAttribute('href', '/blogs');
});

it.each(['{bad', '{}', 'null'])('does not repair unreadable posts %s', (raw) => {
  window.localStorage.setItem('writespace_posts', raw);
  mount();
  expect(screen.getByText('Post not found', { exact: true })).toBeInTheDocument();
  expect(window.localStorage.getItem('writespace_posts')).toBe(raw);
});

it('handles unavailable storage with the exact missing state', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  mount();
  expect(screen.getByText('Post not found')).toBeInTheDocument();
});

it('resolves changed params without stale content or another mount', async () => {
  savePosts([{ id: 'one', title: 'First', content: 'First body' }, { id: 'two', title: 'Second', content: 'Second body' }]);
  render(
    <MemoryRouter initialEntries={['/blog/one']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Link to="/blog/two">
        Next post
      </Link>
      <Routes>
        <Route path="/blog/:id" element={<ReadBlog />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('First body')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Next post' }));
  expect(screen.getByText('Second body')).toBeInTheDocument();
  expect(screen.queryByText('First body')).not.toBeInTheDocument();
});

it.each(['user', 'admin'])('renders one navbar, no mutation controls and stays inert in StrictMode for %s', (role) => {
  savePosts([{ id: 'one', title: 'Inert reader', content: 'Read only', authorId: 'riley' }]);
  window.localStorage.setItem('writespace_session', JSON.stringify({ ...writer, role }));
  const before = { ...window.localStorage };
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const remover = vi.spyOn(Storage.prototype, 'removeItem');
  const clear = vi.spyOn(Storage.prototype, 'clear');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  mount({ app: true, strict: true });
  expect(screen.getByText('Read only')).toBeInTheDocument();
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /edit|delete/i })).not.toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(xhr).not.toHaveBeenCalled();
  expect({ ...window.localStorage }).toEqual(before);
});

it('guards guest direct reader entry and never displays stored content', () => {
  savePosts([{ id: 'one', title: 'Private title', content: 'Private body' }]);
  mount({ app: true });
  expect(screen.getByRole('heading', { name: 'Login', exact: true })).toBeInTheDocument();
  expect(screen.queryByText('Private body')).not.toBeInTheDocument();
});

it('recovers from an unknown ID through the real back link to stored collection content', async () => {
  window.localStorage.setItem('writespace_session', JSON.stringify(writer));
  savePosts([{ id: 'one', title: 'Available post', content: 'Available excerpt' }]);
  mount({ app: true, path: '/blog/unknown' });
  expect(screen.getByText('Post not found', { exact: true })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Back to Blogs' }));
  expect(screen.getByRole('link', { name: 'Available post' })).toBeInTheDocument();
  expect(screen.getByText('Available excerpt')).toBeInTheDocument();
});

it('leaves unmatched route behavior unchanged', () => {
  mount({ app: true, path: '/unknown' });
  expect(screen.getByText('Requested path: /unknown')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
});
