/** @module home-tests Verify real local collection data, defensive fields and guarded wiring. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Home from './Home';
import App from '../App';
import { savePosts, getPosts } from '../utils/storage';
import * as storage from '../utils/storage';

const writer = { userId: 'riley', username: 'riley', displayName: 'Riley', role: 'user' };

/** Mount collection or App at an explicit entry with optional StrictMode.
 * @param {object} options Router entry, component and StrictMode selection.
 * @returns {object} RTL view.
 */
function mount({ app = false, path = '/blogs', strict = false } = {}) {
  const content = (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {app ? <App /> : <Home />}
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{content}</StrictMode> : content);
}

it('renders every post newest-first, with exact excerpts, dates, avatars and cycling accents', () => {
  const records = [1, 5, 2, 4, 3].map((day) => ({
    id: `post-${day}`, title: `Post ${day}`, content: 'x'.repeat(120) + `Hidden ${day}`,
    authorId: 'riley', authorName: 'Riley', createdAt: `2025-01-0${day}T00:00:00Z`,
  }));
  savePosts(records);
  mount();
  const region = screen.getByRole('region', { name: 'Blog collection' });
  expect(region).toHaveClass('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');
  const cards = within(region).getAllByRole('article');
  expect(cards).toHaveLength(5);
  expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['Post 5', 'Post 4', 'Post 3', 'Post 2', 'Post 1']);
  const accents = ['border-indigo-500', 'border-violet-500', 'border-pink-500', 'border-teal-500', 'border-indigo-500'];
  cards.forEach((card, index) => {
    const day = 5 - index;
    expect(card).toHaveClass(accents[index]);
    expect(within(card).getByText('x'.repeat(120)).textContent).toHaveLength(120);
    expect(within(card).queryByText(`Hidden ${day}`, { exact: false })).not.toBeInTheDocument();
    expect(within(card).getByText(`Jan 0${day}, 2025`)).toBeInTheDocument();
    expect(within(card).getByText('Riley')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Writer avatar' })).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveAttribute('href', `/blog/post-${day}`);
  });
  expect(getPosts()).toEqual(records);
});

it('sorts a copy even when the storage boundary returns a frozen array', () => {
  const records = Object.freeze([
    Object.freeze({ id: 'old', title: 'Older', createdAt: '2025-01-01' }),
    Object.freeze({ id: 'new', title: 'Newer', createdAt: '2025-01-02' }),
  ]);
  vi.spyOn(storage, 'getPosts').mockReturnValue(records);
  mount();
  expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Newer', 'Older']);
  expect(records.map((post) => post.id)).toEqual(['old', 'new']);
});

it.each(['user', 'admin'])('shows exact empty copy and a Write link for %s with only one navbar', (role) => {
  window.localStorage.setItem('writespace_session', JSON.stringify({ ...writer, role }));
  mount({ app: true });
  expect(screen.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeInTheDocument();
  expect(within(screen.getByRole('main')).getByRole('link', { name: 'Write', exact: true })).toHaveAttribute('href', '/write');
  expect(screen.getAllByRole('banner')).toHaveLength(1);
});

it('skips non-records and safely presents malformed fields with invalid dates sorting last', () => {
  savePosts([null, false, 4, 'bad', [], { id: 'bad', title: {}, content: [], authorName: {}, createdAt: {} },
    { id: 'good', title: 'Good post', content: 'Short content', createdAt: '2025-01-01' }, {}]);
  mount();
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(3);
  expect(within(cards[0]).getByRole('link', { name: 'Good post' })).toBeInTheDocument();
  expect(within(cards[1]).getByRole('link', { name: 'Untitled post' })).toHaveAttribute('href', '/blog/bad');
  expect(within(cards[1]).getByText('Unknown date')).toBeInTheDocument();
  expect(within(cards[1]).getByText('Unknown author')).toBeInTheDocument();
  expect(within(cards[2]).queryByRole('link')).not.toBeInTheDocument();
});

it.each(['{bad', '{}', 'null', '[null, 1, false, []]'])('falls back to the exact empty state without repairing %s', (raw) => {
  window.localStorage.setItem('writespace_posts', raw);
  mount();
  expect(screen.getByText('No blogs yet. Be the first to write one!')).toBeInTheDocument();
  expect(window.localStorage.getItem('writespace_posts')).toBe(raw);
});

it('handles denied storage and reads fresh data on a later mount', () => {
  const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  const view = mount();
  expect(screen.getByText('No blogs yet. Be the first to write one!')).toBeInTheDocument();
  view.unmount();
  getter.mockRestore();
  savePosts([{ id: 'fresh', title: 'Fresh post' }]);
  mount();
  expect(screen.getByRole('link', { name: 'Fresh post' })).toBeInTheDocument();
});

it('escapes markup in title, excerpt and author rather than creating HTML', () => {
  const markup = '<img src=x onerror=alert(1)>';
  savePosts([{ id: 'safe', title: markup, content: '<script>alert(1)</script>', authorName: markup }]);
  const { container } = mount();
  expect(screen.getByRole('link', { name: markup })).toBeInTheDocument();
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(screen.getAllByText(markup)).toHaveLength(2);
  expect(container.querySelector('img, script')).toBeNull();
});

it('keeps StrictMode App rendering inert and stored records unchanged', () => {
  savePosts([{ id: 'safe', title: 'Inert post', content: 'Body' }]);
  window.localStorage.setItem('writespace_session', JSON.stringify(writer));
  const before = { ...window.localStorage };
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const remover = vi.spyOn(Storage.prototype, 'removeItem');
  const clear = vi.spyOn(Storage.prototype, 'clear');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
  mount({ app: true, strict: true });
  expect(screen.getByRole('link', { name: 'Inert post' })).toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(xhr).not.toHaveBeenCalled();
  expect({ ...window.localStorage }).toEqual(before);
  expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();
});

it('redirects guest collection entry to login without revealing post content', () => {
  savePosts([{ id: 'private', title: 'Private post' }]);
  mount({ app: true });
  expect(screen.getByRole('heading', { name: 'Login', exact: true })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Private post' })).not.toBeInTheDocument();
});

it('opens the actual reader from a collection card and returns using its back link', async () => {
  window.localStorage.setItem('writespace_session', JSON.stringify(writer));
  savePosts([{ id: 'read', title: 'Read this', content: 'Full content from real storage', authorName: 'Riley' }]);
  mount({ app: true });
  await userEvent.click(screen.getByRole('link', { name: 'Read this' }));
  expect(screen.getByText('Full content from real storage')).toBeInTheDocument();
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  await userEvent.click(screen.getByRole('link', { name: 'Back to Blogs' }));
  expect(screen.getByRole('link', { name: 'Read this' })).toBeInTheDocument();
});
