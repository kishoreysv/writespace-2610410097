/** @module Home Present the browser-local collection without changing stored data. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BlogCard } from '../components/BlogCard';
import { getPosts } from '../utils/storage';
import { newestFirst } from '../utils/presentation';

/** Read all post records on mount and display a sorted copy.
 * @returns {import('react').ReactElement} Collection or exact empty state.
 */
export default function Home() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    const records = getPosts().filter((post) => (
      post !== null && typeof post === 'object' && !Array.isArray(post)
    ));
    setPosts(newestFirst(records));
  }, []);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <h1 className="mb-8 font-display text-4xl font-bold text-slate-800">
        All Blogs
      </h1>
      {posts.length > 0 ? (
        <section aria-label="Blog collection" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <BlogCard key={index} post={post} index={index} />
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="mb-6 text-lg text-slate-600">
            No blogs yet. Be the first to write one!
          </p>
          <Link
            to="/write"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          >
            Write
          </Link>
        </section>
      )}
    </main>
  );
}
