/** @module navbar-tests Public link destinations and explicit mobile disclosure actions. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { PublicNavbar } from './PublicNavbar';

/** Expose router location as text to prove render never navigates. */
function Location() {
  const location = useLocation();
  return (
    <output aria-label="Location">
      {location.pathname}
    </output>
  );
}

/** Mount navigation with a single test router.
 * @param {object|null} session Valid local role fixture.
 */
function mount(session = null) {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PublicNavbar session={session} />
      <Location />
    </MemoryRouter>,
  );
}

/** Guest has explicit sign-in/sign-up destinations without render redirects. */
it('renders guest links and remains at the entry route', () => {
  mount();
  const nav = within(screen.getByRole('navigation'));
  expect(nav.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  expect(nav.getByRole('link', { name: 'Get Started' })).toHaveAttribute('href', '/register');
  expect(screen.queryByRole('link', { name: 'Go to Dashboard' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Location')).toHaveTextContent('/');
});

/** Signed-in roles expose only their role home and display name. */
it.each([['Admin', '/admin'], ['user', '/blogs']])('routes %s dashboard activation to %s', async (role, home) => {
  mount({ role, displayName: 'Riley' });
  expect(screen.getByText('Riley')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: 'Go to Dashboard' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent(home);
});

/** Missing display names remain readable. */
it('uses a safe account-name fallback', () => {
  mount({ role: 'user' });
  expect(screen.getByText('Local account')).toBeInTheDocument();
});

/** Disclosure changes only on button activation and closes after a link. */
it('opens, closes, and closes after a mobile link activation', async () => {
  mount();
  const toggle = screen.getByRole('button', { name: 'Open menu' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(toggle);
  await userEvent.click(screen.getByRole('link', { name: 'Get Started' }));
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByLabelText('Location')).toHaveTextContent('/register');
});
