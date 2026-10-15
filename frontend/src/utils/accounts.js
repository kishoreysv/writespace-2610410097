/** @module accounts Browser-local administration; never send credentials or mutate during reads. */
import { getSession, isValidSession } from './auth';
import { getUsers, saveUsers } from './storage';

/** Check a caller against the freshly stored complete administrator identity.
 * @param {object|null} expected Page-owned identity.
 * @returns {boolean} Whether the current administrator matches every public field.
 */
function currentAdmin(expected) {
  if (!isValidSession(expected) || expected.role !== 'admin') return false;
  const current = getSession();
  return Boolean(current && ['userId', 'username', 'displayName', 'role'].every((key) => current[key] === expected[key]));
}

/** Return a generic authorization failure without exposing identity or credentials.
 * @returns {object} Explicit failed mutation.
 */
function unauthorized() {
  return { ok: false, error: 'You are not authorized to manage accounts.' };
}

/** Select complete usable posts without changing the source array or its records.
 * @param {*} posts Stored post array.
 * @returns {Array} Posts with required strings and a valid timestamp.
 */
export function getValidPosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.filter((post) => post && typeof post === 'object' && !Array.isArray(post)
    && ['id', 'title', 'content', 'authorId', 'authorName', 'createdAt'].every(
      (key) => typeof post[key] === 'string' && post[key].trim(),
    ) && Number.isFinite(Date.parse(post.createdAt)));
}

/** Compute the plan's distinct user populations; the fixed admin is not stored.
 * @param {*} posts Stored posts, counting only complete valid records.
 * @param {*} users Stored accounts, counting all entries in the total.
 * @returns {object} Four exact dashboard labels and nonnegative integer counts.
 */
export function getAdminCounts(posts, users) {
  const accounts = Array.isArray(users) ? users : [];
  return {
    'Total Posts': getValidPosts(posts).length,
    'Total Users': accounts.length,
    'Total Admins': accounts.filter((account) => account?.role === 'admin').length + 1,
    'Total users': accounts.filter((account) => account?.role === 'user').length,
  };
}

/** Validate and persist one new local account without returning its password.
 * @param {object|null} adminSession Expected administrator, rechecked immediately before save.
 * @param {*} input Required string displayName, username, password and lowercase role.
 * @returns {object} Field/storage/auth failure or a public saved account.
 */
export function createAccount(adminSession, input) {
  if (!currentAdmin(adminSession)) return unauthorized();
  const values = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fieldErrors = {};
  for (const key of ['displayName', 'username', 'password', 'role']) {
    if (typeof values[key] !== 'string' || !values[key].trim()) fieldErrors[key] = 'This field is required.';
  }
  if (!fieldErrors.role && !['admin', 'user'].includes(values.role)) fieldErrors.role = 'Choose Admin or user.';
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: 'Please complete all four fields correctly.', fieldErrors };
  }
  const username = values.username.trim();
  const users = getUsers();
  if (username.toLowerCase() === 'admin' || users.some((account) => typeof account?.username === 'string'
    && account.username.trim().toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: 'Username is already taken.', fieldErrors: { username: 'Username is already taken.' } };
  }
  let account;
  try {
    account = {
      id: crypto.randomUUID(), displayName: values.displayName.trim(), username,
      password: values.password, role: values.role, createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, error: 'Unable to create a local account. Try again in a supported browser.' };
  }
  if (account.id === 'admin' || users.some((entry) => entry?.id === account.id)) {
    return { ok: false, error: 'Unable to create a unique local account. Try again.' };
  }
  if (!currentAdmin(adminSession)) return unauthorized();
  const result = saveUsers([...users, account]);
  if (!result.ok) return result;
  const { id, displayName, role, createdAt } = account;
  return { ok: true, account: { id, displayName, username, role, createdAt } };
}

/** Remove exactly one eligible account only after explicit boolean confirmation.
 * @param {object|null} adminSession Expected administrator; never delete the current identity.
 * @param {*} targetId Exact stored ID, excluding the synthetic fixed admin.
 * @param {*} confirmed Only boolean true permits a write.
 * @returns {object} Cancellation/protection/failure or persisted removal.
 */
export function removeAccount(adminSession, targetId, confirmed) {
  if (!currentAdmin(adminSession)) return unauthorized();
  if (confirmed !== true) return { ok: false, error: '' };
  if (targetId === 'admin') return { ok: false, error: 'Default admin cannot be deleted.' };
  if (targetId === adminSession.userId) return { ok: false, error: 'Your current account cannot be deleted.' };
  const users = getUsers();
  const matches = typeof targetId === 'string' && targetId.trim()
    ? users.filter((account) => account && typeof account === 'object' && !Array.isArray(account) && account.id === targetId)
    : [];
  if (!matches.length) return { ok: false, error: 'Account not found.' };
  if (matches.some((account) => typeof account.username === 'string' && account.username.trim().toLowerCase() === 'admin')) {
    return { ok: false, error: 'Default admin cannot be deleted.' };
  }
  if (matches.length !== 1 || typeof matches[0].username !== 'string' || !matches[0].username.trim()) {
    return { ok: false, error: 'Invalid account. Unable to remove this local record.' };
  }
  if (!currentAdmin(adminSession)) return unauthorized();
  return saveUsers(users.filter((account) => account !== matches[0]));
}
