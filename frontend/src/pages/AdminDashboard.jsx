/** @module AdminDashboard Show browser-local metrics, recent posts and explicit administrator actions. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { StatCard } from '../components/StatCard';
import { BlogCard } from '../components/BlogCard';
import { canMutatePost, isValidSession } from '../utils/auth';
import { getAdminCounts, getValidPosts } from '../utils/accounts';
import { getPosts, getUsers } from '../utils/storage';
import { newestFirst } from '../utils/presentation';
import { deletePost } from '../utils/posts';

const explanations = {
  'Total Posts': 'Complete valid stored posts.',
  'Total Users': 'All stored account entries; excludes the fixed admin.',
  'Total Admins': 'Stored admin-role accounts plus the fixed admin.',
  'Total users': 'Stored writer-role (user) accounts only.',
};

/** Load local lists read-only and refresh only after a successful confirmed deletion.
 * @param {{session?: object|null}} props App-owned lowercase administrator identity.
 * @returns {import('react').ReactElement} Metrics, recent previews and navigation.
 */
export default function AdminDashboard({ session = null }) {
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  /** Read browser-local data without repairing or changing stored records. */
  useEffect(() => {
    setPosts(getPosts());
    setUsers(getUsers());
  }, []);

  /** Confirm an explicit post removal; the existing service rechecks fresh identity and target.
   * @param {string} id Exact loaded post ID.
   */
  function handleDelete(id) {
    const result = deletePost(id, session, window.confirm('Delete this post? This cannot be undone.'));
    if (result.ok) {
      setPosts(getPosts());
      setError('');
    } else if (result.error) {
      setError(result.error);
    }
  }

  if (!isValidSession(session) || session.role !== 'admin') {
    return (
      <main id="main-content" className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold">
          Administrator access required
        </h1>
      </main>
    );
  }
  const counts = getAdminCounts(posts, users);
  const recent = newestFirst(getValidPosts(posts)).slice(0, 5);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-violet-700">
        Local administration
      </p>
      <h1 className="font-display text-4xl font-bold text-slate-800">
        Admin Dashboard
      </h1>
      <p className="mt-3 text-lg text-slate-600">
        Manage the stories and accounts in this browser. This is a local demo, not secure shared identity.
      </p>
      <div className="my-8 flex flex-wrap gap-3">
        <Link to="/write" className="button-primary">
          Write New Post
        </Link>
        <Link to="/users" className="button-secondary">
          Manage Users
        </Link>
        <Link to="/blogs" className="button-secondary">
          All Blogs
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(counts).map(([label, count]) => (
          <StatCard key={label} label={label} count={count} description={explanations[label]} />
        ))}
      </div>
      <section aria-labelledby="recent-posts" className="mt-12">
        <h2 id="recent-posts" className="mb-6 font-display text-2xl font-semibold text-slate-800">
          Recent Posts
        </h2>
        <p className="mb-6 text-slate-600">
          The five newest posts, with administrator controls for any author.
        </p>
        {error && (
          <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-700">
            {error}
          </p>
        )}
        {recent.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((post, index) => (
              <div key={`${post.id}-${index}`} className="min-w-0">
                <BlogCard post={post} index={index} />
                {canMutatePost('edit', session, post) && (
                  <div className="mt-3 flex gap-3">
                    <Link to={`/edit/${encodeURIComponent(post.id)}`} className="button-secondary" aria-label={`Edit ${post.title}`}>
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="button-secondary text-red-700"
                      aria-label={`Delete ${post.title}`}
                      onClick={() => handleDelete(post.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            No posts yet — check back soon!
          </p>
        )}
      </section>
    </main>
  );
}

AdminDashboard.propTypes = { session: ProtectedRoute.propTypes.session };
