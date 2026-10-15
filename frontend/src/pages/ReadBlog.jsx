/** @module ReadBlog Resolve exact local IDs and render escaped, whitespace-preserving text. */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { getPosts } from '../utils/storage';
import { formatDate, safeText } from '../utils/presentation';

/** Read local posts on mount and resolve the current route without coercing IDs.
 * @returns {import('react').ReactElement} Full article or recoverable not-found state.
 */
export default function ReadBlog() {
  const { id } = useParams();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    setPosts(getPosts());
  }, []);

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
        </article>
      ) : (
        <h1 className="font-display text-4xl font-bold text-slate-800">
          Post not found
        </h1>
      )}
    </main>
  );
}
