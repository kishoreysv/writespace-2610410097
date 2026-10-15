/** @module blog-card-tests Actual card links, excerpt boundaries and safe malformed display. */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { BlogCard } from './BlogCard';

/** Mount an actual card without introducing a second router.
 * @param {object|null} post Post fixture.
 * @param {number} index Accent position.
 */
function mount(post, index = 0) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BlogCard post={post} index={index} />
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
