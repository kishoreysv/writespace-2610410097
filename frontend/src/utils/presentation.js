/** @module presentation Non-mutating plain-text and date transformations. */

/** Return only primitive text; never coerce objects or execute their methods.
 * @param {*} value Potential text.
 * @param {string} [fallback=''] Replacement for invalid text.
 * @returns {string} Safe React text child.
 */
export function safeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/** Convert a supported date to a sortable UTC timestamp; invalid dates sort last.
 * @param {*} value Date string.
 * @returns {number} Timestamp or negative infinity.
 */
function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return -Infinity;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

/** Sort a copy of a list newest first, keeping equal/invalid dates stable.
 * @param {*} posts Potential post array.
 * @returns {Array} Sorted copy, never the original array.
 */
export function newestFirst(posts) {
  if (!Array.isArray(posts)) return [];
  return [...posts].sort((left, right) => {
    const a = timestamp(left?.createdAt);
    const b = timestamp(right?.createdAt);
    return a === b ? 0 : a > b ? -1 : 1;
  });
}

/** Format English UTC MMM DD, YYYY with an explicit invalid-date fallback.
 * @param {*} value ISO date string.
 * @returns {string} Display date.
 */
export function formatDate(value) {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(time));
}
