/** @module BlogCard Read-only plain-text preview, reusable by the later collection slice. */
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar';
import { formatDate, safeText } from '../utils/presentation';

const accents = ['border-indigo-500', 'border-violet-500', 'border-pink-500', 'border-teal-500'];

/** Render up to 120 content characters, escaped by React, with an actual reader link.
 * @param {{post?: object|null, index?: number}} props Stored post and list index.
 * @returns {import('react').ReactElement} Article preview.
 */
export function BlogCard({ post = null, index = 0 }) {
  const entry = post || {};
  const id = safeText(entry.id);
  const title = safeText(entry.title, 'Untitled post');
  const accent = Number.isInteger(index) && index >= 0 ? index % accents.length : 0;

  return (
    <article className={`blog-card rounded-2xl border border-slate-200 border-t-4 bg-white p-6 ${accents[accent]}`}>
      <p className="mb-4 text-sm text-slate-600">
        {formatDate(entry.createdAt)}
      </p>
      <h3 className="mb-3 font-display text-2xl font-semibold">
        {id ? (
          <Link className="text-slate-800 hover:text-primary-600" to={`/blog/${encodeURIComponent(id)}`}>
            {title}
          </Link>
        ) : (
          <span>
            {title}
          </span>
        )}
      </h3>
      <p className="mb-6 break-words text-slate-600">
        {safeText(entry.content).slice(0, 120)}
      </p>
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Avatar role="user" />
        <span>
          {safeText(entry.authorName, 'Unknown author')}
        </span>
      </div>
    </article>
  );
}

BlogCard.propTypes = {
  // Browser data may be malformed. Presentation validates fields rather than dropping records.
  post: PropTypes.object,
  index: PropTypes.number,
};
