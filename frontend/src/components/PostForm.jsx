/** @module PostForm Reuse accessible required post fields for synchronous local authoring. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { validatePostFields } from '../utils/posts';

/** Edit plain text locally and present explicit validation/storage outcomes.
 * @param {{initialTitle?: string, initialContent?: string, submitLabel?: string, onSubmit: Function}} props
 * Initial text, specific save label, and synchronous callback accepting {title, content} and returning a mutation result.
 * @returns {import('react').ReactElement} Labeled post form with no length limit.
 */
export function PostForm({ initialTitle = '', initialContent = '', submitLabel = 'Save Post', onSubmit }) {
  const [values, setValues] = useState({ title: initialTitle, content: initialContent });
  const [result, setResult] = useState(null);

  /** Reset local fields when a different post is supplied by the route. */
  useEffect(() => {
    setValues({ title: initialTitle, content: initialContent });
    setResult(null);
  }, [initialTitle, initialContent]);

  /** Focus the actionable summary after a rejected submit. */
  useEffect(() => {
    if (result && !result.ok) document.getElementById('post-form-error')?.focus();
  }, [result]);

  /** Preserve exact text, including whitespace, while updating the live counter.
   * @param {import('react').ChangeEvent<HTMLInputElement|HTMLTextAreaElement>} event Field input.
   */
  function handleChange(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }

  /** Block invalid fields before invoking the explicit synchronous mutation callback.
   * @param {import('react').FormEvent} event Save activation.
   */
  function handleSubmit(event) {
    event.preventDefault();
    const validation = validatePostFields(values.title, values.content);
    setResult(validation.ok ? onSubmit(values) : validation);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      {result && !result.ok && result.error && (
        <p id="post-form-error" role="alert" tabIndex={-1} className="rounded-xl bg-red-50 p-4 text-red-700">
          {result.error}
        </p>
      )}
      <div>
        <label htmlFor="post-title" className="mb-2 block font-semibold text-slate-800">
          Title
        </label>
        <input
          id="post-title"
          name="title"
          type="text"
          required
          aria-required="true"
          aria-invalid={Boolean(result?.fieldErrors?.title)}
          aria-describedby={result?.fieldErrors?.title ? 'post-title-error' : undefined}
          value={values.title}
          onChange={handleChange}
          className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-3"
        />
        {result?.fieldErrors?.title && (
          <p id="post-title-error" role="alert" className="mt-2 text-red-700">
            {result.fieldErrors.title}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="post-content" className="mb-2 block font-semibold text-slate-800">
          Content
        </label>
        <textarea
          id="post-content"
          name="content"
          required
          aria-required="true"
          aria-invalid={Boolean(result?.fieldErrors?.content)}
          aria-describedby={result?.fieldErrors?.content ? 'post-content-counter post-content-error' : 'post-content-counter'}
          value={values.content}
          onChange={handleChange}
          className="min-h-[256px] w-full resize-y rounded-xl border border-slate-300 px-4 py-3 leading-relaxed"
        />
        <p id="post-content-counter" role="status" aria-live="polite" className="mt-2 text-sm tabular-nums text-slate-600">
          {values.content.length} characters
        </p>
        {result?.fieldErrors?.content && (
          <p id="post-content-error" role="alert" className="mt-2 text-red-700">
            {result.fieldErrors.content}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <button type="submit" className="button-primary">
          {submitLabel}
        </button>
        <Link to="/blogs" className="button-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}

PostForm.propTypes = {
  initialTitle: PropTypes.string,
  initialContent: PropTypes.string,
  submitLabel: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
};
