/** @module avatar-tests Static role/default visual and accessible-name contract. */
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Avatar, getAvatar } from './Avatar';

/** Admin helper returns crown span with the exact upstream color. */
it('getAvatar renders Admin crown with violet treatment', () => {
  render(getAvatar('Admin'));
  expect(screen.getByRole('img', { name: 'Admin avatar' })).toHaveTextContent('👑');
  expect(screen.getByRole('img')).toHaveClass('bg-violet-600');
});

/** Writer helper returns the book treatment. */
it('getAvatar renders user book with indigo treatment', () => {
  render(getAvatar('user'));
  expect(screen.getByRole('img', { name: 'Writer avatar' })).toHaveTextContent('📚');
  expect(screen.getByRole('img')).toHaveClass('bg-indigo-500');
});

/** Unknown roles must never receive the administrator visual. */
it.each([undefined, 'unexpected', 'admin'])('Avatar defaults non-admin role %s to writer', (role) => {
  render(
    <Avatar role={role} />,
  );
  expect(screen.getByRole('img', { name: 'Writer avatar' })).toHaveTextContent('📚');
});
