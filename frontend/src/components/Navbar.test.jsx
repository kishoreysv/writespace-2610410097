/** @module navbar-tests Verify explicit role navigation, disclosures and persisted logout failures. */
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Navbar } from './Navbar';
import { setSession, getSession } from '../utils/auth';

const writer = { userId: 'w', username: 'riley', displayName: 'Riley', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };

/** Display App-style state after the real navigation operation.
 * @param {{initial: object|null}} props Initial valid identity.
 * @returns {import('react').ReactElement} Stateful navbar harness.
 */
function Harness({ initial }) {
  const [session, setSessionState] = useState(initial);
  const location = useLocation();
  return (
    <>
      <Navbar session={session} onSessionChange={setSessionState} />
      <output aria-label="Location">
        {location.pathname}
      </output>
      <output aria-label="Session role">
        {session?.role || 'guest'}
      </output>
    </>
  );
}

/** Mount the navbar with a persisted identity and test-owned router.
 * @param {object|null} [session=null] Initial identity.
 */
function mount(session = null) {
  if (session) setSession(session);
  render(
    <MemoryRouter initialEntries={['/blogs']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Harness initial={session} />
    </MemoryRouter>,
  );
}

it('renders public guest links without mutating storage', () => {
  mount();
  expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/register');
  expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  expect(getSession()).toBeNull();
});

it.each([writer, admin])('renders exact $role links and avatar without logout on render', (session) => {
  mount(session);
  expect(screen.getByRole('link', { name: 'All Blogs' })).toHaveAttribute('href', '/blogs');
  expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute('href', '/write');
  expect(screen.getByRole('link', { name: 'All Blogs' })).toHaveAttribute('aria-current', 'page');
  if (session.role === 'admin') expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users');
  else expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAccessibleName(session.role === 'admin' ? 'Admin avatar' : 'Writer avatar');
  expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  expect(getSession()).toEqual(session);
  expect(screen.getByLabelText('Location').textContent).toBe('/blogs');
});

it.each([[writer, '/blogs'], [admin, '/admin']])('account disclosure opens, closes and navigates $role home', async (session, home) => {
  mount(session);
  const trigger = screen.getByRole('button', { name: new RegExp(session.displayName) });
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(getSession()).toEqual(session);
  await userEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('link', { name: 'Go to Dashboard' }));
  expect(screen.getByLabelText('Location').textContent).toBe(home);
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('Escape closes the account disclosure and restores trigger focus', async () => {
  mount(writer);
  const trigger = screen.getByRole('button', { name: /Riley/ });
  await userEvent.click(trigger);
  await userEvent.tab();
  await userEvent.keyboard('{Escape}');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveFocus();
});

it('mobile disclosure toggles explicitly and both menus close after a link or logo', async () => {
  mount(writer);
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  await userEvent.click(screen.getByRole('button', { name: /Riley/ }));
  await userEvent.click(screen.getByRole('link', { name: 'Write', exact: true }));
  expect(screen.getByLabelText('Location').textContent).toBe('/write');
  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'WriteSpace' }));
  expect(screen.getByLabelText('Location').textContent).toBe('/');
});

it('explicit logout removes only session, updates App state and navigates Home', async () => {
  localStorage.setItem('writespace_users', '[{"id":"account"}]');
  localStorage.setItem('writespace_posts', '[{"id":"post"}]');
  mount(writer);
  await userEvent.click(screen.getByRole('button', { name: /Riley/ }));
  expect(getSession()).toEqual(writer);
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  expect(getSession()).toBeNull();
  expect(screen.getByLabelText('Session role').textContent).toBe('guest');
  expect(screen.getByLabelText('Location').textContent).toBe('/');
  expect(localStorage.getItem('writespace_users')).toBe('[{"id":"account"}]');
  expect(localStorage.getItem('writespace_posts')).toBe('[{"id":"post"}]');
});

it.each(['removeItem', 'property'])('retains view and App session on logout %s failure and allows explicit retry', async (failure) => {
  mount(writer);
  await userEvent.click(screen.getByRole('button', { name: /Riley/ }));
  const fault = failure === 'property'
    ? vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('private'); })
    : vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('private'); });
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to remove local data.');
  expect(screen.getByLabelText('Session role').textContent).toBe('user');
  expect(screen.getByLabelText('Location').textContent).toBe('/blogs');
  fault.mockRestore();
  expect(getSession()).toEqual(writer);
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  expect(getSession()).toBeNull();
  expect(screen.getByLabelText('Location').textContent).toBe('/');
});
