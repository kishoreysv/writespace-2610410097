/** @module user-row-tests Verify public metadata, role adaptation and explicit protected controls. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { UserRow } from './UserRow';

const account = {
  id: 'one', displayName: 'Writer One', username: 'one', password: 'not-in-dom',
  role: 'user', createdAt: '2025-01-02T00:00:00.000Z',
};

it('shows public writer metadata only and forwards an eligible explicit delete by ID', async () => {
  const remove = vi.fn();
  render(
    <ul>
      <UserRow account={account} currentUserId="admin" onDelete={remove} />
    </ul>,
  );
  expect(screen.getByRole('heading', { name: 'Writer One' })).toBeInTheDocument();
  expect(screen.getByText('@one')).toBeInTheDocument();
  expect(screen.getByText('user')).toBeInTheDocument();
  expect(screen.getByText('Created: Jan 02, 2025')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Writer avatar' })).toHaveTextContent('📚');
  expect(document.body.innerHTML).not.toContain('not-in-dom');
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Delete one' }));
  expect(remove).toHaveBeenCalledWith('one');
});

it('adapts lowercase admin to the crown display role', () => {
  render(
    <ul>
      <UserRow account={{ ...account, role: 'admin' }} onDelete={vi.fn()} />
    </ul>,
  );
  expect(screen.getByRole('img', { name: 'Admin avatar' })).toHaveTextContent('👑');
  expect(screen.getByText('Admin')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete one' })).toBeEnabled();
});

it.each([{ ...account, id: 'admin' }, { ...account, username: ' AdMiN ' }])('disables fixed ID or reserved username with exact tooltip', async (row) => {
  const remove = vi.fn();
  render(
    <ul>
      <UserRow account={row} onDelete={remove} />
    </ul>,
  );
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', 'Default admin cannot be deleted.');
  await userEvent.click(button);
  expect(remove).not.toHaveBeenCalled();
});

it('disables a current created account and blocks activation', async () => {
  const remove = vi.fn();
  render(
    <ul>
      <UserRow account={account} currentUserId="one" onDelete={remove} />
    </ul>,
  );
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', 'Your current account cannot be deleted.');
  await userEvent.click(button);
  expect(remove).not.toHaveBeenCalled();
});

it.each([null, {}, { id: 1, username: {}, displayName: [], role: {}, createdAt: {} }])('malformed metadata %s renders fallbacks without an actionable ID', (row) => {
  render(
    <ul>
      <UserRow account={row} onDelete={vi.fn()} />
    </ul>,
  );
  expect(screen.getByText('Unknown account')).toBeInTheDocument();
  expect(screen.getByText('@Unknown username')).toBeInTheDocument();
  expect(screen.getByText('Unknown role')).toBeInTheDocument();
  expect(screen.getByText('Created: Unknown date')).toBeInTheDocument();
  expect(screen.getByRole('button')).toBeDisabled();
});

it('omitted account uses safe empty metadata', () => {
  render(
    <ul>
      <UserRow onDelete={vi.fn()} />
    </ul>,
  );
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByText('Unknown account')).toBeInTheDocument();
});

it('escapes markup usernames in text and delete labels without executable nodes or passwords', () => {
  const username = '<img src=x onerror="alert(1)"><script>demo</script>';
  const { container } = render(
    <ul>
      <UserRow account={{ ...account, username }} onDelete={vi.fn()} />
    </ul>,
  );
  expect(screen.getByText(`@${username}`, { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Delete ${username}`, exact: true })).toHaveAttribute('aria-label', `Delete ${username}`);
  expect(container.querySelector('script, img, iframe, svg, [onerror], [onload]')).toBeNull();
  expect(container.innerHTML).toContain('&lt;img');
  expect(container.textContent).not.toContain(account.password);
  expect(container.innerHTML).not.toContain(account.password);
});

it('escapes account markup and uses unknown date for invalid timestamps', () => {
  render(
    <ul>
      <UserRow account={{ ...account, displayName: '<script>bad</script>', createdAt: 'bad' }} onDelete={vi.fn()} />
    </ul>,
  );
  expect(screen.getByRole('heading')).toHaveTextContent('<script>bad</script>');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText('Created: Unknown date')).toBeInTheDocument();
});
