/** @module LandingPage Public discovery only; no auth or post mutation actions. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicNavbar } from '../components/PublicNavbar';
import { BlogCard } from '../components/BlogCard';
import { getPosts, getUsers } from '../utils/storage';
import { newestFirst, resolveAuthorRole } from '../utils/presentation';

const features = [
  { title: 'Write Freely', copy: 'Plain-text writing without distractions.', tint: 'bg-indigo-50' },
  { title: 'Private & Local', copy: 'Your data stays in this browser. No shared account or cloud backup.', tint: 'bg-violet-50' },
  { title: 'Instant & Fast', copy: 'No product server. Open your local writing without waiting for a network request.', tint: 'bg-slate-100' },
];

/** Show newest local previews and session-dependent link destinations.
 * @param {{session?: object|null}} props Validated nullable session from a future identity slice.
 * @returns {import('react').ReactElement} Landing view.
 */
export default function LandingPage({ session = null }) {
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);

  /** Read local posts and users on mount without repairing or writing stored values. */
  useEffect(() => {
    setPosts(newestFirst(getPosts()).slice(0, 3));
    setUsers(getUsers());
  }, []);

  return (
    <>
      <PublicNavbar session={session} />
      <main id="main-content">
        <section className="bg-slate-100 px-6 py-16 md:py-24" aria-labelledby="hero-title">
          <div className="mx-auto max-w-6xl">
            <p className="mb-6 text-sm font-semibold uppercase tracking-widest text-primary-700">
              A place for your writing
            </p>
            <h1 id="hero-title" className="hero-title mb-6 max-w-3xl font-display font-bold tracking-tight">
              WriteSpace
            </h1>
            <p className="mb-8 max-w-xl text-2xl text-slate-600">
              Your thoughts. Your space. Beautifully simple.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to={session ? '/blogs' : '/login'} className="button-primary">
                Start Reading
              </Link>
              <Link to="/register" className="button-secondary">
                Get Started Free
              </Link>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="features-title">
          <h2 id="features-title" className="mb-8 font-display text-3xl font-semibold">
            Space to make it yours
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className={`rounded-2xl p-6 ${feature.tint}`}>
                <h3 className="mb-3 font-display text-2xl font-semibold">
                  {feature.title}
                </h3>
                <p className="text-slate-600">
                  {feature.copy}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-6 pb-20" aria-labelledby="latest-title">
          <h2 id="latest-title" className="mb-8 font-display text-3xl font-semibold">
            Latest from the Blog
          </h2>
          {posts.length ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <BlogCard
                  key={index}
                  post={post && typeof post === 'object' ? post : null}
                  index={index}
                  authorRole={resolveAuthorRole(post, users)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-white px-6 py-10 text-lg text-slate-600">
              No posts yet — check back soon!
            </p>
          )}
        </section>
      </main>
      <footer className="bg-slate-800 px-6 py-10 text-slate-100">
        <p className="mx-auto mb-6 max-w-6xl text-sm text-slate-100">
          Local demo only. Passwords are stored in plaintext. Never use real passwords or sensitive data.
          Browser records can be cleared or changed; there is no shared service, backup, or secure authorization.
        </p>
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 md:flex-row">
          <p>
            © {new Date().getFullYear()} WriteSpace
          </p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-6">
            <Link to="/">
              Home
            </Link>
            <Link to="/blogs">
              All Blogs
            </Link>
            <Link to="/login">
              Login
            </Link>
            <Link to="/register">
              Register
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

LandingPage.propTypes = { session: PublicNavbar.propTypes.session };
