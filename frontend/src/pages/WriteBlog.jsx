/** @module WriteBlog Save a browser-local draft through an explicit authoring action. */
import { useNavigate } from 'react-router-dom';
import { PostForm } from '../components/PostForm';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { createPost } from '../utils/posts';

/** Create posts using the page identity and navigate only from a persisted result.
 * @param {{session?: object|null}} props App-owned identity, checked freshly by the service.
 * @returns {import('react').ReactElement} New post form.
 */
export default function WriteBlog({ session = null }) {
  const navigate = useNavigate();

  /** Submit only title/content; author identity is never supplied by form fields.
   * @param {{title: string, content: string}} values Controlled form text.
   * @returns {object} Explicit mutation outcome for inline errors.
   */
  function handleSubmit({ title, content }) {
    const result = createPost(title, content, session);
    if (result.ok || result.navigateTo) navigate(result.navigateTo, { replace: true });
    return result;
  }

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <h1 className="mb-4 font-display text-4xl font-bold text-slate-800">
        Write a Post
      </h1>
      <p className="mb-8 text-slate-600">
        Give your words a home. Posts are saved only in this browser.
      </p>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10" aria-label="New post">
        <PostForm submitLabel="Save Post" onSubmit={handleSubmit} />
      </section>
    </main>
  );
}

WriteBlog.propTypes = { session: ProtectedRoute.propTypes.session };
