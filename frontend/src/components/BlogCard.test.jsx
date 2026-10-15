/** @module blog-card-tests Actual card links, excerpt boundaries and safe malformed display. */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { BlogCard } from './BlogCard';
import { resolveAuthorRole } from '../utils/presentation';

/** Mount an actual card without introducing a second router.
 * @param {object|null} post Post fixture.
 * @param {number} index Accent position.
 * @param {string|undefined} authorRole Caller-resolved display role, or the default.
 * @returns {object} RTL mount handle.
 */
function mount(post, index = 0, authorRole = undefined) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BlogCard post={post} index={index} authorRole={authorRole} />
    </MemoryRouter>,
  );
}

/** Exact first 120 characters, author, date and encoded route appear. */
it('renders a real preview with capped text and author metadata', () => {
  mount({ id: 'a/b', title: 'A small beginning', content: 'x'.repeat(121), authorName: 'Riley', createdAt: '2025-01-02' });
  expect(screen.getByRole('link', { name: 'A small beginning' })).toHaveAttribute('href', '/blog/a%2Fb');
  expect(screen.getByText('x'.repeat(120))).toBeInTheDocument();
  expect(screen.queryByText('x'.repeat(121))).not.toBeInTheDocument();
  expect(screen.getByText('Jan 02, 2025')).toBeInTheDocument();
  expect(screen.getByText('Riley')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Writer avatar' })).toBeInTheDocument();
});

/** Caller-resolved roles drive exact source avatars without component storage reads. */
it.each([
  ['admin', 'Admin avatar'], ['created-admin', 'Admin avatar'],
  ['writer', 'Writer avatar'], ['unknown', 'Writer avatar'], ['deleted-admin', 'Writer avatar'],
])('renders the resolved avatar for %s without accessing storage', (authorId, label) => {
  const post = { id: 'one', title: 'Role post', authorId, authorName: 'Admin' };
  const users = [{ id: 'created-admin', role: 'admin' }, { id: 'writer', role: 'user' }];
  const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('Cards must not read storage');
  });
  mount(post, 0, resolveAuthorRole(post, users));
  const avatar = screen.getByRole('img', { name: label });
  const admin = label === 'Admin avatar';
  expect(avatar).toHaveTextContent(admin ? '👑' : '📚');
  expect(avatar).toHaveClass(admin ? 'bg-violet-600' : 'bg-indigo-500');
  expect(getter).not.toHaveBeenCalled();
});

/** Optional roles default conservatively, regardless of stored-looking author names. */
it('defaults to a writer avatar when no caller role is supplied', () => {
  mount({ id: 'one', authorId: 'created-admin', authorName: 'Admin' });
  const avatar = screen.getByRole('img', { name: 'Writer avatar' });
  expect(avatar).toHaveTextContent('📚');
  expect(avatar).toHaveClass('bg-indigo-500');
});

/** Short/exact-boundary content is never padded with invented ellipses. */
it.each(['', 'short', 'x'.repeat(120)])('preserves content of length %s', (content) => {
  const { container } = mount({ id: 'one', title: 'Title', content });
  expect(container.querySelectorAll('article > p')[1].textContent).toBe(content);
});

/** Stored markup is text and never becomes executable HTML. */
it('escapes malicious title and content', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const { container } = mount({ id: 'safe', title: payload, content: '<script>alert(1)</script>' });
  expect(screen.getByRole('link', { name: payload })).toBeInTheDocument();
  expect(container.querySelector('script, img')).toBeNull();
});

/** Missing and malformed fields do not create dead reader links or object children. */
it.each([null, {}, { id: 2, title: {}, content: [], authorName: {}, createdAt: 'bad' }])('handles malformed post %s', (post) => {
  mount(post);
  expect(screen.getByText('Untitled post')).toBeInTheDocument();
  expect(screen.getByText('Unknown author')).toBeInTheDocument();
  expect(screen.getByText('Unknown date')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

/** Accent cycle repeats and invalid indices use the first accent. */
it.each([
  [0, 'border-indigo-500'], [1, 'border-violet-500'], [2, 'border-pink-500'],
  [3, 'border-teal-500'], [4, 'border-indigo-500'], [-1, 'border-indigo-500'],
  [1.5, 'border-indigo-500'], [NaN, 'border-indigo-500'],
])('uses safe accent for index %s', (index, accent) => {
  mount({ title: 'Title' }, index);
  expect(screen.getByRole('article')).toHaveClass(accent);
});
