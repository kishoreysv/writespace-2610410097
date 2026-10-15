/** @module auth-tests Verify local credentials, persisted transitions and fail-closed permissions. */
import { describe, expect, it, vi } from 'vitest';
import {
  authenticate, registerWriter, getSession, setSession, clearSession, logout,
  isValidSession, canAccessRoute, canMutatePost,
} from './auth';

const writer = { userId: 'writer-id', username: 'riley', displayName: 'Riley', role: 'user' };
const admin = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const input = { displayName: ' Riley ', username: ' Riley ', password: ' demo ', confirmPassword: ' demo ' };
const account = { id: writer.userId, username: writer.username, displayName: writer.displayName, password: ' demo ', role: 'user' };

/** Seed the actual user storage, preserving arbitrary malformed records for defensive tests.
 * @param {Array} users Stored local account fixtures.
 */
function seedUsers(users = [account]) {
  localStorage.setItem('writespace_users', JSON.stringify(users));
}

/** Inject storage faults without replacing the successful browser persistence boundary.
 * @param {string} method Browser Storage method.
 * @returns {object} Restorable Vitest spy.
 */
function failStorage(method) {
  return vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('private detail'); });
}

describe('validated session boundary', () => {
  it.each([writer, admin])('round trips only the four canonical fields for $role', (session) => {
    expect(setSession({ ...session, password: 'never-in-session' })).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem('writespace_session'))).toEqual(session);
    expect(getSession()).toEqual(session);
    expect(isValidSession(session)).toBe(true);
  });

  it.each([null, [], 'admin', 4, {}, { ...writer, role: 'Admin' }, { ...writer, role: 'root' }])(
    'rejects an invalid session %j without modifying existing bytes', (session) => {
      setSession(writer);
      expect(isValidSession(session)).toBe(false);
      expect(setSession(session)).toEqual({ ok: false, error: 'Invalid local session.' });
      expect(getSession()).toEqual(writer);
      localStorage.setItem('writespace_session', JSON.stringify(session));
      expect(getSession()).toBeNull();
      expect(localStorage.getItem('writespace_session')).toBe(JSON.stringify(session));
    },
  );

  it.each(['userId', 'username', 'displayName'])('rejects missing, empty, whitespace and nonstring %s', (key) => {
    for (const value of [undefined, '', '  ', null, 12, {}]) {
      const session = { ...writer, [key]: value };
      expect(setSession(session).ok).toBe(false);
      localStorage.setItem('writespace_session', JSON.stringify(session));
      expect(getSession()).toBeNull();
    }
  });

  it('returns guest on missing, malformed or wrong-shaped JSON without repair', () => {
    expect(getSession()).toBeNull();
    for (const raw of ['{bad', 'false', '[]', 'null']) {
      localStorage.setItem('writespace_session', raw);
      expect(getSession()).toBeNull();
      expect(localStorage.getItem('writespace_session')).toBe(raw);
    }
  });

  it('contains unavailable localStorage property getter for read, set and clear', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('private'); });
    expect(getSession()).toBeNull();
    expect(setSession(writer).ok).toBe(false);
    expect(clearSession().ok).toBe(false);
    expect(logout().ok).toBe(false);
  });

  it('contains getItem failures and leaves the restored stored session intact', () => {
    setSession(writer);
    const fault = failStorage('getItem');
    expect(getSession()).toBeNull();
    fault.mockRestore();
    expect(getSession()).toEqual(writer);
  });

  it('contains setter and serialization errors without changing a prior session', () => {
    setSession(writer);
    const fault = failStorage('setItem');
    expect(setSession(admin).ok).toBe(false);
    fault.mockRestore();
    expect(getSession()).toEqual(writer);
    vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error('private'); });
    expect(setSession(admin).ok).toBe(false);
    expect(getSession()).toEqual(writer);
  });

  it('clears only session and is idempotent', () => {
    seedUsers();
    localStorage.setItem('writespace_posts', '[{"id":"post"}]');
    setSession(writer);
    expect(clearSession()).toEqual({ ok: true });
    expect(getSession()).toBeNull();
    expect(clearSession()).toEqual({ ok: true });
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([account]);
    expect(localStorage.getItem('writespace_posts')).toBe('[{"id":"post"}]');
  });

  it('reports explicit logout success only after removal', () => {
    setSession(writer);
    expect(logout()).toEqual({ ok: true, sessionCleared: true, navigateTo: '/' });
    expect(getSession()).toBeNull();
  });

  it('retains session when clear or logout remover throws', () => {
    setSession(writer);
    const fault = failStorage('removeItem');
    expect(clearSession().ok).toBe(false);
    expect(logout()).toMatchObject({ ok: false, error: expect.any(String) });
    fault.mockRestore();
    expect(getSession()).toEqual(writer);
  });
});

describe('credential resolution', () => {
  it('gives normalized fixed admin precedence over corrupt or conflicting local accounts', () => {
    seedUsers([{ ...account, username: 'ADMIN', password: 'admin' }]);
    const fault = failStorage('getItem');
    const result = authenticate(' AdMiN ', 'admin');
    expect(result).toEqual({ ok: true, session: admin, role: 'admin', sessionEstablished: true, navigateTo: '/admin' });
    fault.mockRestore();
    expect(getSession()).toEqual(admin);
    expect(JSON.parse(localStorage.getItem('writespace_users'))[0].id).toBe(writer.userId);
  });

  it.each(['user', 'admin'])('authenticates local %s with case-insensitive trimmed name and exact password', (role) => {
    seedUsers([null, {}, { ...account, role }]);
    const result = authenticate(' RILEY ', ' demo ');
    expect(result).toMatchObject({ ok: true, role, navigateTo: role === 'admin' ? '/admin' : '/blogs' });
    expect(getSession()).toEqual({ ...writer, role });
    expect(localStorage.getItem('writespace_session')).not.toContain('password');
    expect(JSON.parse(localStorage.getItem('writespace_users'))[2].password).toBe(' demo ');
  });

  it.each([
    [undefined, 'x'], [null, 'x'], [12, 'x'], ['', 'x'], ['  ', 'x'],
    ['riley', null], ['riley', 3], ['riley', ''], ['missing', ' demo '],
    ['riley', 'demo'], ['riley', ' Demo '], ['admin', 'ADMIN'], ['ADMIN', 'local-secret'],
  ])('rejects invalid credentials without echo or session mutation: %j', (username, password) => {
    seedUsers([account, { ...account, username: 'admin', password: 'local-secret' }]);
    setSession(writer);
    expect(authenticate(username, password)).toEqual({ ok: false, error: 'Invalid username or password.' });
    expect(getSession()).toEqual(writer);
  });

  it.each([null, {}, [], { ...account, role: 'Admin' }, { ...account, id: '' }, { ...account, displayName: null }])(
    'ignores malformed account %j', (record) => {
      seedUsers([record]);
      expect(authenticate('riley', ' demo ')).toEqual({ ok: false, error: 'Invalid username or password.' });
      expect(getSession()).toBeNull();
    },
  );

  it('fails closed on unreadable, malformed or nonarray user storage', () => {
    for (const raw of ['{bad', '{}']) {
      localStorage.setItem('writespace_users', raw);
      expect(authenticate('riley', ' demo ').ok).toBe(false);
      expect(localStorage.getItem('writespace_users')).toBe(raw);
    }
    failStorage('getItem');
    expect(authenticate('riley', ' demo ').ok).toBe(false);
  });

  it.each(['riley', 'admin'])('does not report %s login success when session cannot save', (username) => {
    seedUsers();
    failStorage('setItem');
    expect(authenticate(username, username === 'admin' ? 'admin' : ' demo ')).toMatchObject({ ok: false });
    expect(getSession()).toBeNull();
  });
});

describe('writer registration', () => {
  it('generates UUID and ISO date, trims names, preserves exact password and saves user then session', () => {
    seedUsers([null, { ...account, id: 'existing', username: 'someone' }]);
    const result = registerWriter(input);
    expect(result).toMatchObject({ ok: true, role: 'user', navigateTo: '/blogs', sessionEstablished: true });
    const users = JSON.parse(localStorage.getItem('writespace_users'));
    expect(users).toHaveLength(3);
    const saved = users[2];
    expect(saved).toMatchObject({ username: 'Riley', displayName: 'Riley', password: ' demo ', role: 'user' });
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);
    expect(getSession()).toEqual({ userId: saved.id, username: 'Riley', displayName: 'Riley', role: 'user' });
    expect(result.session).toEqual(getSession());
  });

  it.each(['displayName', 'username', 'password', 'confirmPassword'])('requires valid nonempty %s before any write', (field) => {
    for (const value of [undefined, null, '', '  ', 4, {}]) {
      const result = registerWriter({ ...input, [field]: value });
      expect(result).toMatchObject({ ok: false, fieldErrors: { [field]: 'This field is required.' } });
      expect(localStorage.getItem('writespace_users')).toBeNull();
      expect(getSession()).toBeNull();
    }
  });

  it.each([undefined, null, 'bad', 3])('rejects missing or invalid registration input %j', (value) => {
    expect(registerWriter(value)).toMatchObject({ ok: false, error: 'Please complete all four fields.' });
    expect(localStorage.getItem('writespace_users')).toBeNull();
  });

  it('rejects password mismatch including whitespace differences without mutation', () => {
    expect(registerWriter({ ...input, confirmPassword: 'demo' })).toMatchObject({ ok: false, fieldErrors: { confirmPassword: 'Passwords must match.' } });
    expect(localStorage.getItem('writespace_users')).toBeNull();
    expect(getSession()).toBeNull();
  });

  it.each(['admin', ' ADMIN ', 'AdMiN', 'riley', ' RILEY '])('rejects reserved/duplicate username %s without mutation', (username) => {
    seedUsers();
    expect(registerWriter({ ...input, username })).toMatchObject({ ok: false, fieldErrors: { username: 'Username is already taken.' } });
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toEqual([account]);
    expect(getSession()).toBeNull();
  });

  it('reports UUID generation failure without writing either key', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('private'); });
    expect(registerWriter(input)).toMatchObject({ ok: false, error: expect.stringContaining('supported browser') });
    expect(localStorage.getItem('writespace_users')).toBeNull();
    expect(getSession()).toBeNull();
  });

  it('reports first-write failure and preserves previous accounts and session', () => {
    seedUsers([{ ...account, username: 'other' }]);
    setSession(admin);
    const before = localStorage.getItem('writespace_users');
    const fault = failStorage('setItem');
    expect(registerWriter(input)).toMatchObject({ ok: false });
    fault.mockRestore();
    expect(localStorage.getItem('writespace_users')).toBe(before);
    expect(getSession()).toEqual(admin);
  });

  it('retains account after second-write failure, explains sign-in and never rolls back', () => {
    const original = Storage.prototype.setItem;
    const fault = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'writespace_session') throw new Error('private');
      original.call(this, key, value);
    });
    const result = registerWriter(input);
    expect(result).toMatchObject({ ok: false, accountCreated: true, error: expect.stringContaining('you can sign in') });
    expect(result.navigateTo).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('writespace_users'))).toHaveLength(1);
    expect(getSession()).toBeNull();
    fault.mockRestore();
    expect(authenticate('RILEY', ' demo ').ok).toBe(true);
    expect(getSession().userId).toBe(JSON.parse(localStorage.getItem('writespace_users'))[0].id);
  });
});

describe('complete role route matrix', () => {
  const paths = ['/', '/login', '/register', '/blogs', '/blog/post-id', '/write', '/edit/post-id', '/admin', '/users'];
  for (const [role, session] of [['guest', null], ['user', writer], ['admin', admin]]) {
    it.each(paths)('resolves ' + role + ' at %s', (path) => {
      let expected = { allowed: true };
      if (session && ['/login', '/register'].includes(path)) {
        expected = { allowed: false, redirectTo: role === 'admin' ? '/admin' : '/blogs' };
      } else if (!session && !['/', '/login', '/register'].includes(path)) {
        expected = { allowed: false, redirectTo: '/login' };
      } else if (role === 'user' && ['/admin', '/users'].includes(path)) {
        expected = { allowed: false, redirectTo: '/blogs' };
      }
      expect(canAccessRoute(path, session)).toEqual(expected);
    });
  }
  it.each([null, {}, { ...admin, userId: '' }, { ...admin, role: 'Admin' }, { ...writer, displayName: 4 }])(
    'treats malformed sessions %j as guests on every route', (session) => {
      for (const path of paths) expect(canAccessRoute(path, session)).toEqual(canAccessRoute(path, null));
    },
  );
  it.each(['/unknown', '/blogs/not-a-route', '/blog/id/extra', '/edit/id/extra', '/blog', '/edit', undefined])(
    'allows unknown path %s to reach not-found for every role', (path) => {
      for (const session of [null, writer, admin]) expect(canAccessRoute(path, session)).toEqual({ allowed: true });
    },
  );
  it('applies the same guards to trailing slashes', () => {
    expect(canAccessRoute('/blogs/', null)).toEqual({ allowed: false, redirectTo: '/login' });
    expect(canAccessRoute('/users/', writer)).toEqual({ allowed: false, redirectTo: '/blogs' });
    expect(canAccessRoute('/', admin)).toEqual({ allowed: true });
  });
});

describe('fresh mutation ownership matrix', () => {
  for (const [role, session] of [['guest', null], ['user', writer], ['admin', admin]]) {
    for (const action of ['create', 'edit', 'delete', 'publish', '', null]) {
      it.each([null, { authorId: 'writer-id' }, { authorId: 'other-id' }])(
        role + ' ' + action + ' checks target %j', (post) => {
          if (session) setSession(session);
          const expected = Boolean(session && ['create', 'edit', 'delete'].includes(action)
            && (action === 'create' || (post && (role === 'admin' || post.authorId === session.userId))));
          expect(canMutatePost(action, session, post)).toBe(expected);
        },
      );
    }
  }
  it('rejects stale, missing, malformed, forged or unavailable stored session before mutation', () => {
    const post = { authorId: writer.userId };
    expect(canMutatePost('create', writer, null)).toBe(false);
    setSession(writer);
    expect(canMutatePost('edit', { ...writer, role: 'admin' }, post)).toBe(false);
    expect(canMutatePost('edit', { ...writer, username: 'forged' }, post)).toBe(false);
    setSession(admin);
    expect(canMutatePost('edit', writer, post)).toBe(false);
    localStorage.setItem('writespace_session', '{bad');
    expect(canMutatePost('create', admin, null)).toBe(false);
    setSession(writer);
    failStorage('getItem');
    expect(canMutatePost('edit', writer, post)).toBe(false);
  });
  it.each([{}, { ...writer, userId: '' }, { ...writer, role: 'Admin' }])('rejects invalid caller %j', (session) => {
    setSession(writer);
    expect(canMutatePost('create', session, null)).toBe(false);
  });
  it.each([[], 'post', 4, {}])('rejects unusable ownership targets %j for writers', (post) => {
    setSession(writer);
    expect(canMutatePost('edit', writer, post)).toBe(false);
    expect(canMutatePost('delete', writer, post)).toBe(false);
  });
});
