/** @module posts Persist explicit browser-local post mutations; never trust a loaded page's identity or list. */
import { canMutatePost } from './auth';
import { getPosts, savePosts } from './storage';

/** Validate required plain text without trimming stored content or limiting its length.
 * @param {*} title Proposed title.
 * @param {*} content Proposed body.
 * @returns {{ok: boolean, error: string, fieldErrors?: object}} Inline validation result.
 */
export function validatePostFields(title, content) {
  const fieldErrors = {};
  if (typeof title !== 'string' || !title.trim()) fieldErrors.title = 'Title is required.';
  if (typeof content !== 'string' || !content.trim()) fieldErrors.content = 'Content is required.';
  return Object.keys(fieldErrors).length
    ? { ok: false, error: 'Please complete the required fields.', fieldErrors }
    : { ok: true, error: '' };
}

/** Reject incomplete records and ambiguous IDs before changing stored data.
 * @param {Array} posts Freshly read records.
 * @param {*} id Exact target ID.
 * @returns {object} Valid target or explicit missing/invalid failure.
 */
function resolveTarget(posts, id) {
  const matches = typeof id === 'string' && id.trim()
    ? posts.filter((post) => post && typeof post === 'object' && !Array.isArray(post) && post.id === id)
    : [];
  if (!matches.length) return { ok: false, error: 'Post not found' };
  const post = matches[0];
  if (matches.length !== 1 || !['id', 'title', 'content', 'authorId', 'authorName', 'createdAt'].every(
    (field) => typeof post[field] === 'string' && post[field].trim(),
  ) || !Number.isFinite(Date.parse(post.createdAt))) {
    return { ok: false, error: 'Invalid post. Unable to change this local record.' };
  }
  return { ok: true, error: '', post };
}

/** Report rejected identities without claiming a successful save.
 * @returns {{ok: boolean, error: string, navigateTo: string}} Fail-closed role destination.
 */
function unauthorized() {
  return { ok: false, error: 'You are not authorized to change this post.', navigateTo: '/blogs' };
}

/** Create a UUID/ISO post with session-derived authorship only after a successful local write.
 * @param {*} title Required title, preserved exactly.
 * @param {*} content Required unlimited body, preserved exactly.
 * @param {object|null} session Expected page identity; must match freshly stored identity.
 * @returns {object} Validation/auth/storage failure or saved post and reader destination.
 */
export function createPost(title, content, session) {
  const validation = validatePostFields(title, content);
  if (!validation.ok) return validation;
  let generated;
  try {
    generated = { id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  } catch {
    return { ok: false, error: 'Unable to create a local post. Try again in a supported browser.' };
  }
  const posts = getPosts();
  if (!canMutatePost('create', session, null)) return unauthorized();
  if (posts.some((post) => post?.id === generated.id)) {
    return { ok: false, error: 'Unable to create a unique local post. Try again.' };
  }
  const post = { ...generated, title, content, authorId: session.userId, authorName: session.displayName };
  const saved = savePosts([...posts, post]);
  if (!saved.ok) return saved;
  return { ok: true, error: '', post, navigateTo: `/blog/${post.id}` };
}

/** Re-read the target and identity, preserving all original metadata while editing only text.
 * @param {*} id Exact target ID.
 * @param {*} title Required replacement title.
 * @param {*} content Required unlimited replacement body.
 * @param {object|null} session Expected page identity.
 * @returns {object} Explicit failure or saved post and reader destination.
 */
export function editPost(id, title, content, session) {
  const posts = getPosts();
  const target = resolveTarget(posts, id);
  if (!target.ok) return target;
  if (!canMutatePost('edit', session, target.post)) return unauthorized();
  const validation = validatePostFields(title, content);
  if (!validation.ok) return validation;
  const post = { ...target.post, title, content };
  const saved = savePosts(posts.map((entry) => entry === target.post ? post : entry));
  if (!saved.ok) return saved;
  return { ok: true, error: '', post, navigateTo: `/blog/${post.id}` };
}

/** Delete exactly one fresh authorized target only when confirmation is the boolean true.
 * @param {*} id Exact target ID.
 * @param {object|null} session Expected page identity.
 * @param {*} confirmed Explicit boolean confirmation; truthy alternatives are rejected.
 * @returns {object} Cancellation/failure or persisted removal and collection destination.
 */
export function deletePost(id, session, confirmed) {
  if (confirmed !== true) return { ok: false, error: '' };
  const posts = getPosts();
  const target = resolveTarget(posts, id);
  if (!target.ok) return target;
  if (!canMutatePost('delete', session, target.post)) return unauthorized();
  const saved = savePosts(posts.filter((entry) => entry !== target.post));
  if (!saved.ok) return saved;
  return { ok: true, error: '', navigateTo: '/blogs' };
}
