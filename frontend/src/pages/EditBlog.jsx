/** @module EditBlog Prefill local post text and recheck ownership during every explicit save. */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { PostForm } from '../components/PostForm';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { canMutatePost } from '../utils/auth';
import { editPost } from '../utils/posts';
import { getPosts } from '../utils/storage';
import { safeText } from '../utils/presentation';

/** Show an owner/admin form or recover without mutating another author's post.
 * @param {{session?: object|null}} props Expected page identity.
 * @returns {import('react').ReactElement} Prefilled form, missing state or unauthorized redirect.
 */
export default function EditBlog({ session = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [posts, setPosts] = useState(getPosts);
  const [missing, setMissing] = useState(false);

  /** Refresh the loaded draft when a different route target is chosen. */
  useEffect(() => {
    setPosts(getPosts());
    setMissing(false);
  }, [id]);

  const post = typeof id === 'string' && id.trim()
    ? posts.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && entry.id === id)
    : null;

  /** Re-resolve the stored target and identity instead of trusting the prefilled draft.
   * @param {{title: string, content: string}} values Replacement text only.
   * @returns {object} Explicit outcome for the form; missing targets replace the form.
   */
  function handleSubmit({ title, content }) {
    const result = editPost(id, title, content, session);
    if (result.error === 'Post not found') setMissing(true);
    if (result.ok || result.navigateTo) navigate(result.navigateTo, { replace: true });
    return result;
  }

  if (post && !missing && !canMutatePost('edit', session, post)) {
    return <Navigate to="/blogs" replace />;
  }

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      {post && !missing ? (
        <>
          <h1 className="mb-8 font-display text-4xl font-bold text-slate-800">
            Edit Post
          </h1>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10" aria-label="Edit post">
            <PostForm
              key={id}
              initialTitle={safeText(post.title)}
              initialContent={safeText(post.content)}
              submitLabel="Save Changes"
              onSubmit={handleSubmit}
            />
          </section>
        </>
      ) : (
        <>
          <h1 className="mb-6 font-display text-4xl font-bold text-slate-800">
            Post not found
          </h1>
          <Link to="/blogs" className="button-secondary">
            Back to Blogs
          </Link>
        </>
      )}
    </main>
  );
}

EditBlog.propTypes = { session: ProtectedRoute.propTypes.session };
