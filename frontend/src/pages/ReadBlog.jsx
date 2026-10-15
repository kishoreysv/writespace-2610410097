/** @module ReadBlog Resolve exact local IDs and render escaped, whitespace-preserving text. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { canMutatePost } from '../utils/auth';
import { deletePost } from '../utils/posts';
import { Avatar } from '../components/Avatar';
import { getPosts } from '../utils/storage';
import { formatDate, safeText } from '../utils/presentation';

/** Read local posts and expose explicit controls only for a freshly authorized identity.
 * @param {{session?: object|null}} props App-owned identity, rechecked during deletion.
 * @returns {import('react').ReactElement} Full article or recoverable not-found state.
 */
export default function ReadBlog({ session = null }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');

  /** Read without repairing storage when the requested route changes. */
  useEffect(() => {
    setPosts(getPosts());
    setError('');
  }, [id]);

  /** Confirm before invoking the service, which re-reads target and session.
   * Cancellation never writes; failures never navigate as a successful deletion.
   */
  function handleDelete() {
    const result = deletePost(id, session, window.confirm('Delete this post? This cannot be undone.'));
    if (result.ok || result.navigateTo) {
      navigate(result.navigateTo, { replace: true });
    } else if (result.error) {
      setError(result.error);
    }
  }

  const post = typeof id === 'string' && id.trim()
    ? posts.find((entry) => (
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      && typeof entry.id === 'string' && entry.id === id
    ))
    : null;
  // Stored records identify the fixed administrator by authorId, not a display-name guess.
  const authorRole = post?.authorId === 'admin' ? 'Admin' : 'user';

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-12 md:py-16">
      <Link
        to="/blogs"
        className="mb-8 inline-flex min-h-11 items-center rounded-lg font-semibold text-primary-700 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
      >
        Back to Blogs
      </Link>
      {post ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10">
          <h1 className="mb-6 break-words font-display text-4xl font-bold text-slate-800">
            {safeText(post.title, 'Untitled post')}
          </h1>
          <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-6">
            <Avatar role={authorRole} />
            <p className="break-words font-semibold text-slate-800">
              {safeText(post.authorName, 'Unknown author')}
            </p>
            <p className="text-sm text-slate-600">
              {formatDate(post.createdAt)}
            </p>
          </div>
          <div className="whitespace-pre-wrap break-words text-lg leading-relaxed text-slate-700">
            {safeText(post.content)}
          </div>
          {canMutatePost('edit', session, post) && (
            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 md:flex-row">
              <Link to={`/edit/${post.id}`} className="button-secondary">
                Edit
              </Link>
              <button type="button" onClick={handleDelete} className="button-secondary text-red-700">
                Delete
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
              {error}
            </p>
          )}
        </article>
      ) : (
        <h1 className="font-display text-4xl font-bold text-slate-800">
          Post not found
        </h1>
      )}
    </main>
  );
}

ReadBlog.propTypes = { session: ProtectedRoute.propTypes.session };
