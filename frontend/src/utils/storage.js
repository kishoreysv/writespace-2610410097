/** @module storage Guarded browser-local JSON boundary; never repairs data on read. */

/** Read JSON, returning the caller's fallback on any storage or parser failure.
 * @param {string} key Storage key.
 * @param {*} [fallback=null] Missing/unreadable value.
 * @returns {*} Parsed value or fallback.
 */
export function readValue(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Serialize and persist a value without leaking sensitive failure details.
 * @param {string} key Storage key.
 * @param {*} value JSON-serializable value.
 * @returns {{ok: boolean, error?: string}} Explicit mutation result.
 */
export function writeValue(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') {
      return { ok: false, error: 'Unable to save local data. Check browser storage and try again.' };
    }
    window.localStorage.setItem(key, serialized);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to save local data. Check browser storage and try again.' };
  }
}

/** Remove a key only on explicit caller activation.
 * @param {string} key Storage key.
 * @returns {{ok: boolean, error?: string}} Explicit mutation result.
 */
export function removeValue(key) {
  try {
    window.localStorage.removeItem(key);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Unable to remove local data. Check browser storage and try again.' };
  }
}

/** Read posts, preserving every entry in a valid array.
 * @returns {Array} Stored posts or an empty array.
 */
export function getPosts() {
  try {
    const value = readValue('writespace_posts', []);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Save a post array; reject non-arrays without changing storage.
 * @param {Array} posts Post records.
 * @returns {{ok: boolean, error?: string}} Explicit mutation result.
 */
export function savePosts(posts) {
  try {
    return Array.isArray(posts)
      ? writeValue('writespace_posts', posts)
      : { ok: false, error: 'Posts must be an array.' };
  } catch {
    return { ok: false, error: 'Unable to save local data.' };
  }
}

/** Read users, preserving every entry in a valid array.
 * @returns {Array} Stored users or an empty array.
 */
export function getUsers() {
  try {
    const value = readValue('writespace_users', []);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Save a user array; reject non-arrays without changing storage.
 * @param {Array} users User records.
 * @returns {{ok: boolean, error?: string}} Explicit mutation result.
 */
export function saveUsers(users) {
  try {
    return Array.isArray(users)
      ? writeValue('writespace_users', users)
      : { ok: false, error: 'Users must be an array.' };
  } catch {
    return { ok: false, error: 'Unable to save local data.' };
  }
}
