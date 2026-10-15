/** @module landing-tests Exact discovery copy, real storage previews and inert route rendering. */
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import LandingPage from './LandingPage';
import App from '../App';
import { getPosts, savePosts, saveUsers } from '../utils/storage';
import * as storage from '../utils/storage';

/** Expose the actual router pathname without mocking App routes.
 * @returns {import('react').ReactElement} Observable route location.
 */
function RouteLocation() {
  const { pathname } = useLocation();
  return (
    <output aria-label="Current route">
      {pathname}
    </output>
  );
}

/** Mount landing with caller-owned role state.
 * @param {object|null} session Valid session fixture.
 * @returns {object} RTL mount handle.
 */
function mount(session = null) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LandingPage session={session} />
    </MemoryRouter>,
  );
}

/** Empty discovery contains all required copy and navigation. */
it('shows the exact tagline, named features, empty copy and footer', () => {
  mount();
  expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
  expect(screen.getByText('Your thoughts. Your space. Beautifully simple.')).toBeInTheDocument();
  for (const name of ['Write Freely', 'Private & Local', 'Instant & Fast']) {
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  }
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  const footer = within(screen.getByRole('navigation', { name: 'Footer navigation' }));
  for (const [name, path] of [['Home', '/'], ['All Blogs', '/blogs'], ['Login', '/login'], ['Register', '/register']]) {
    expect(footer.getByRole('link', { name })).toHaveAttribute('href', path);
  }
  expect(screen.getByText(`© ${new Date().getFullYear()} WriteSpace`)).toBeInTheDocument();
});

/** Previews are the three newest actual BlogCards and leave stored ordering untouched. */
it('caps newest previews at three with real card metadata and no storage changes', () => {
  const records = [1, 4, 2, 3].map((day) => ({
    id: String(day), title: `Post ${day}`, content: `Content ${day}`,
    authorName: 'Riley', createdAt: `2025-01-0${day}`,
  }));
  savePosts(records);
  mount();
  const section = within(screen.getByRole('region', { name: 'Latest from the Blog' }));
  expect(section.getAllByRole('article')).toHaveLength(3);
  expect(section.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual(['Post 4', 'Post 3', 'Post 2']);
  expect(section.getByRole('link', { name: 'Post 4' })).toHaveAttribute('href', '/blog/4');
  expect(section.getByText('Jan 04, 2025')).toBeInTheDocument();
  expect(getPosts()).toEqual(records);
});

/** Previews resolve roles from one user read per mount, including deleted authors. */
it.each([
  ['admin', 'Admin avatar'], ['created-admin', 'Admin avatar'],
  ['writer', 'Writer avatar'], ['unknown', 'Writer avatar'], ['deleted-admin', 'Writer avatar'],
])('passes the current resolved role for preview author %s', (authorId, label) => {
  const records = [{ id: 'role', title: 'Role preview', authorId, authorName: 'Admin' }];
  savePosts(records);
  saveUsers([{ id: 'created-admin', role: 'admin' }, { id: 'writer', role: 'user' }]);
  const usersRead = vi.spyOn(storage, 'getUsers');
  const view = mount();
  const section = within(screen.getByRole('region', { name: 'Latest from the Blog' }));
  const avatar = section.getByRole('img', { name: label });
  const admin = label === 'Admin avatar';
  expect(avatar).toHaveTextContent(admin ? '👑' : '📚');
  expect(avatar).toHaveClass(admin ? 'bg-violet-600' : 'bg-indigo-500');
  view.rerender(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LandingPage />
    </MemoryRouter>,
  );
  expect(usersRead).toHaveBeenCalledTimes(1);
  expect(getPosts()).toEqual(records);
});

/** Remount initialization re-reads the boundary rather than using a cached singleton. */
it('re-reads successfully saved posts on a later landing mount', () => {
  const view = mount();
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  view.unmount();
  savePosts([{ id: 'new', title: 'Freshly saved', createdAt: '2025-01-01' }]);
  mount();
  expect(screen.getByRole('link', { name: 'Freshly saved' })).toBeInTheDocument();
});

/** Required Start Reading and signup destinations differ only by supplied session. */
it.each([null, { role: 'user' }, { role: 'Admin' }])('uses CTA destinations for session %s', (session) => {
  mount(session);
  expect(screen.getByRole('link', { name: 'Start Reading' })).toHaveAttribute('href', session ? '/blogs' : '/login');
  expect(screen.getByRole('link', { name: 'Get Started Free' })).toHaveAttribute('href', '/register');
});

/** Corrupt storage remains corrupt, with a safe explicit empty state. */
it('does not repair malformed JSON or write/remove during StrictMode rendering', () => {
  window.localStorage.setItem('writespace_posts', '{bad');
  const setter = vi.spyOn(Storage.prototype, 'setItem');
  const remover = vi.spyOn(Storage.prototype, 'removeItem');
  render(
    <StrictMode>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  );
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  expect(setter).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
  expect(window.localStorage.getItem('writespace_posts')).toBe('{bad');
  expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
});

/** Browser denial produces the same safe fallback and malformed records remain displayable. */
it('survives unavailable storage and malformed array entries', () => {
  const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('denied'); });
  const view = mount();
  expect(screen.getByText('No posts yet — check back soon!')).toBeInTheDocument();
  view.unmount();
  getter.mockRestore();
  savePosts([null, 4, { id: 'bad', title: {}, content: {} }]);
  mount();
  expect(screen.getAllByText('Untitled post')).toHaveLength(3);
});

/** Real App destinations serve identity forms; the guest collection redirects to login. */
it.each([
  ['Start Reading', '/login', 'Login'],
  ['Get Started Free', '/register', 'Register'],
  ['All Blogs', '/blogs', 'Login'],
])('navigates %s through real routes to %s, then home', async (name, path, heading) => {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <RouteLocation />
    </MemoryRouter>,
  );
  const link = screen.getByRole('link', { name });
  expect(link).toHaveAttribute('href', path);
  await userEvent.click(link);
  expect(screen.getByRole('heading', { level: 1, name: heading, exact: true })).toBeInTheDocument();
  expect(screen.getByLabelText('Current route').textContent).toBe(path === '/blogs' ? '/login' : path);
  expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('writespace_session')).toBeNull();
  await userEvent.click(screen.getByRole('link', { name: 'Back to Home' }));
  expect(screen.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeInTheDocument();
});

/** Unknown direct entries also provide a usable home link, without feature placeholders. */
it('renders unknown paths with a Home recovery link', () => {
  render(
    <MemoryRouter initialEntries={['/unknown']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText('Requested path: /unknown')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
});
