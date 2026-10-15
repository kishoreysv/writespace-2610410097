/** @module post-form-tests Verify accessible required fields, unlimited input and explicit result presentation. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { PostForm } from './PostForm';

/** Mount a form with real Cancel navigation and a synchronous save callback.
 * @param {object} props Optional form props.
 * @returns {object} RTL view and callback.
 */
function mount(props = {}) {
  const onSubmit = props.onSubmit || vi.fn(() => ({ ok: true, error: '' }));
  const view = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<PostForm {...props} onSubmit={onSubmit} />} />
        <Route path="/blogs" element={<h1>Blogs destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, onSubmit };
}

it('renders labeled required full-width fields, minimum-height textarea and responsive buttons without submitting', () => {
  const { onSubmit } = mount();
  const title = screen.getByRole('textbox', { name: 'Title' });
  const content = screen.getByRole('textbox', { name: 'Content' });
  for (const field of [title, content]) {
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('aria-required', 'true');
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(field).not.toHaveAttribute('maxlength');
    expect(field).toHaveClass('w-full');
  }
  expect(content.tagName).toBe('TEXTAREA');
  expect(content).toHaveClass('min-h-[256px]');
  expect(content).toHaveAttribute('aria-describedby', 'post-content-counter');
  expect(screen.getByRole('status')).toHaveTextContent('0 characters');
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('button', { name: 'Save Post' }).parentElement).toHaveClass('flex-col', 'md:flex-row');
  expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/blogs');
  expect(onSubmit).not.toHaveBeenCalled();
});

it('blocks blank submit and links each inline error to its required field', async () => {
  const { onSubmit } = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  for (const name of ['Title', 'Content']) {
    const field = screen.getByRole('textbox', { name });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByText(`${name} is required.`);
    expect(field.getAttribute('aria-describedby').split(' ')).toContain(error.id);
    expect(error).toHaveAttribute('role', 'alert');
  }
  expect(screen.getByText('Please complete the required fields.')).toHaveFocus();
  expect(onSubmit).not.toHaveBeenCalled();
});

it.each([
  [' \t', 'Body', 'Title'], ['Title', ' \n\t', 'Content'],
])('blocks whitespace-only %s / %s while leaving the valid field unmarked', async (title, content, invalidName) => {
  const { onSubmit } = mount({ initialTitle: title, initialContent: content });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('textbox', { name: invalidName })).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('textbox', { name: invalidName === 'Title' ? 'Content' : 'Title' })).toHaveAttribute('aria-invalid', 'false');
  expect(onSubmit).not.toHaveBeenCalled();
});

it('prefills an edit draft and submits exact text only on Save Changes', async () => {
  const { onSubmit } = mount({ initialTitle: 'Initial', initialContent: 'Initial\nbody', submitLabel: 'Save Changes' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Initial');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Initial\nbody');
  expect(screen.getByRole('status')).toHaveTextContent('12 characters');
  await userEvent.clear(screen.getByRole('textbox', { name: 'Title' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), ' Revised ');
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(onSubmit).toHaveBeenCalledWith({ title: ' Revised ', content: 'Initial\nbody' });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('counts typed, pasted large content and deletions live with no enforced limit', async () => {
  mount();
  const content = screen.getByRole('textbox', { name: 'Content' });
  await userEvent.type(content, 'Hello');
  expect(screen.getByRole('status')).toHaveTextContent('5 characters');
  const large = 'Content\n'.repeat(10000);
  await userEvent.clear(content);
  await userEvent.paste(large);
  expect(content).toHaveValue(large);
  expect(screen.getByRole('status')).toHaveTextContent(`${large.length} characters`);
  await userEvent.clear(content);
  expect(screen.getByRole('status')).toHaveTextContent('0 characters');
});

it('renders returned storage errors and keeps entered values for a retry that can succeed', async () => {
  const onSubmit = vi.fn()
    .mockReturnValueOnce({ ok: false, error: 'Unable to save local data.' })
    .mockReturnValueOnce({ ok: true, error: '' });
  mount({ initialTitle: 'Draft', initialContent: 'Keep body', onSubmit });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to save local data.');
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Keep body');
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('associates callback field errors, not just local validation errors', async () => {
  mount({ initialTitle: 'Draft', initialContent: 'Body', onSubmit: () => ({ ok: false, error: 'Rejected title.', fieldErrors: { title: 'Choose a title.' } }) });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-describedby', 'post-title-error');
  expect(screen.getByText('Choose a title.')).toHaveAttribute('id', 'post-title-error');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveAttribute('aria-invalid', 'false');
});

it('Cancel navigates to blogs without submitting even when a draft is invalid', async () => {
  const { onSubmit } = mount({ initialContent: 'Unsaved' });
  await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Blogs destination' })).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('resets field values, errors and counter when the supplied post changes', async () => {
  const onSubmit = vi.fn(() => ({ ok: true, error: '' }));
  const view = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PostForm onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  view.rerender(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PostForm initialTitle="Next" initialContent="Next body" submitLabel="Save Changes" onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Next');
  expect(screen.getByRole('textbox', { name: 'Content' })).toHaveValue('Next body');
  expect(screen.getByRole('status')).toHaveTextContent('9 characters');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('accepts large required title and content through the submit callback', async () => {
  const { onSubmit } = mount();
  const title = 'T'.repeat(10000);
  const content = 'C'.repeat(100000);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: title } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), { target: { value: content } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Post' }));
  expect(onSubmit).toHaveBeenCalledWith({ title, content });
});
