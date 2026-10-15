/** @module auth Browser-local demo identity; these checks are not server security. */
import { getUsers, saveUsers, readValue, writeValue, removeValue } from './storage';

const SESSION_KEY = 'writespace_session';
const INVALID_LOGIN = 'Invalid username or password.';

/** Validate the complete session without accepting legacy or unknown roles.
 * @param {*} session Potential local session.
 * @returns {boolean} Whether every identity field and role is valid.
 */
export function isValidSession(session) {
  return Boolean(session && typeof session === 'object' && !Array.isArray(session)
    && ['userId', 'username', 'displayName'].every((key) => (
      typeof session[key] === 'string' && session[key].trim().length > 0
    )) && ['user', 'admin'].includes(session.role));
}

/** Copy only public session fields, never a stored password or extra properties.
 * @param {object} session Valid session.
 * @returns {object} Canonical four-field session.
 */
function sessionFields(session) {
  const { userId, username, displayName, role } = session;
  return { userId, username, displayName, role };
}

/** Read a validated session synchronously without repairing stored bytes.
 * @returns {object|null} Canonical session or guest state.
 */
export function getSession() {
  const value = readValue(SESSION_KEY);
  return isValidSession(value) ? sessionFields(value) : null;
}

/** Persist only a complete valid session.
 * @param {*} session Proposed identity.
 * @returns {{ok: boolean, error?: string}} Explicit storage outcome.
 */
export function setSession(session) {
  if (!isValidSession(session)) return { ok: false, error: 'Invalid local session.' };
  return writeValue(SESSION_KEY, sessionFields(session));
}

/** Remove only the session key when explicitly requested by a caller.
 * @returns {{ok: boolean, error?: string}} Explicit removal outcome.
 */
export function clearSession() {
  return removeValue(SESSION_KEY);
}

/** Resolve role home for a validated identity.
 * @param {object} session Valid session.
 * @returns {string} Admin dashboard or writer collection destination.
 */
function roleHome(session) {
  return session.role === 'admin' ? '/admin' : '/blogs';
}

/** Establish a session and report success only after persistence.
 * @param {object} session Valid identity without credentials.
 * @returns {object} Explicit failure or signed-in navigation result.
 */
function signIn(session) {
  const saved = setSession(session);
  if (!saved.ok) return saved;
  return { ok: true, session, role: session.role, sessionEstablished: true, navigateTo: roleHome(session) };
}

/** Authenticate fixed admin first, then valid local writer/admin records.
 * @param {*} username Username trimmed and compared without case sensitivity.
 * @param {*} password Exact plaintext demo password, never logged.
 * @returns {object} Explicit invalid/storage failure or persisted identity.
 */
export function authenticate(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return { ok: false, error: INVALID_LOGIN };
  }
  const normalized = username.trim().toLowerCase();
  if (normalized === 'admin') {
    if (password !== 'admin') return { ok: false, error: INVALID_LOGIN };
    return signIn({ userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' });
  }
  const account = getUsers().find((user) => (
    user && typeof user.username === 'string'
    && user.username.trim().toLowerCase() === normalized && user.password === password
    && isValidSession({ ...user, userId: user.id })
  ));
  if (!account) return { ok: false, error: INVALID_LOGIN };
  return signIn(sessionFields({ ...account, userId: account.id }));
}

/** Validate and save a writer, then establish its non-transactional session.
 * @param {object} [input={}] Display name, username, password and confirmation.
 * @returns {object} Validation/storage failure or persisted writer session.
 */
export function registerWriter(input = {}) {
  const values = input && typeof input === 'object' ? input : {};
  const fields = ['displayName', 'username', 'password', 'confirmPassword'];
  const fieldErrors = {};
  for (const field of fields) {
    const value = values[field];
    if (typeof value !== 'string' || !value.trim()) fieldErrors[field] = 'This field is required.';
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, error: 'Please complete all four fields.', fieldErrors };
  }
  if (values.password !== values.confirmPassword) {
    return { ok: false, error: 'Passwords must match.', fieldErrors: { confirmPassword: 'Passwords must match.' } };
  }
  const username = values.username.trim();
  const users = getUsers();
  if (username.toLowerCase() === 'admin' || users.some((user) => (
    typeof user?.username === 'string' && user.username.trim().toLowerCase() === username.toLowerCase()
  ))) {
    return { ok: false, error: 'Username is already taken.', fieldErrors: { username: 'Username is already taken.' } };
  }
  let account;
  try {
    account = {
      id: crypto.randomUUID(), displayName: values.displayName.trim(), username,
      password: values.password, role: 'user', createdAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false, error: 'Unable to create a local account. Try again in a supported browser.' };
  }
  const saved = saveUsers([...users, account]);
  if (!saved.ok) return saved;
  const signedIn = signIn(sessionFields({ ...account, userId: account.id }));
  if (!signedIn.ok) {
    return { ok: false, accountCreated: true, error: 'Your account was saved, but sign-in failed. Check browser storage, then you can sign in with this account.' };
  }
  return signedIn;
}

/** Log out only after a successful explicit session removal; retain all records.
 * @returns {object} Failure or confirmed logout destination.
 */
export function logout() {
  const cleared = clearSession();
  return cleared.ok ? { ok: true, sessionCleared: true, navigateTo: '/' } : cleared;
}

/** Apply the complete route matrix; unknown paths remain useful not-found routes.
 * @param {string} path Router pathname.
 * @param {object|null} session Caller-owned session, validated defensively.
 * @returns {{allowed: boolean, redirectTo?: string}} Access decision, not server authorization.
 */
export function canAccessRoute(path, session) {
  const current = isValidSession(session) ? session : null;
  const pathname = typeof path === 'string' ? path.replace(/\/+$/, '') || '/' : '';
  if (pathname === '/') return { allowed: true };
  if (['/login', '/register'].includes(pathname)) {
    return current ? { allowed: false, redirectTo: roleHome(current) } : { allowed: true };
  }
  const adminOnly = ['/admin', '/users'].includes(pathname);
  const protectedPath = adminOnly || ['/blogs', '/write'].includes(pathname)
    || /^\/(blog|edit)\/[^/]+$/.test(pathname);
  if (!protectedPath) return { allowed: true };
  if (!current) return { allowed: false, redirectTo: '/login' };
  if (adminOnly && current.role !== 'admin') return { allowed: false, redirectTo: '/blogs' };
  return { allowed: true };
}

/** Re-read the session before recognizing create/edit/delete permissions.
 * @param {string} action Supported post action only.
 * @param {object|null} session Expected current session; stale or forged fields fail closed.
 * @param {object|null} post Required ownership target for edit/delete, unused for create.
 * @returns {boolean} Whether a fresh matching identity may perform this local action.
 */
export function canMutatePost(action, session, post) {
  if (!['create', 'edit', 'delete'].includes(action) || !isValidSession(session)) return false;
  const current = getSession();
  if (!current || ['userId', 'username', 'displayName', 'role'].some((key) => current[key] !== session[key])) return false;
  if (action === 'create') return true;
  if (!post || typeof post !== 'object' || Array.isArray(post)) return false;
  return current.role === 'admin' || post.authorId === current.userId;
}
