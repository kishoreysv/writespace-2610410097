/** @module identity-e2e Live browser-local identity journeys; written only, parent executes later. */
import { test, expect } from './fixtures';

const localWriter = { id: 'identity-writer', displayName: 'Riley Example', username: 'Riley', password: 'demo-only', role: 'user', createdAt: '2025-01-01T00:00:00.000Z' };

/** Read persisted bytes without decoding away accidental rewrites.
 * @param {import('@playwright/test').Page} page Live browser page.
 * @returns {Promise<object>} Original identity and post bytes.
 */
async function storedBytes(page) {
  return page.evaluate(() => ({
    users: localStorage.getItem('writespace_users'),
    session: localStorage.getItem('writespace_session'),
    posts: localStorage.getItem('writespace_posts'),
  }));
}

/** Fail one localStorage method/key only, leaving real reads and other writes intact.
 * @param {import('@playwright/test').Page} page Live browser page.
 * @param {'setItem'|'removeItem'} method Browser boundary to fail.
 * @param {string} key Only this localStorage key fails.
 * @returns {Promise<Function>} Restore the original browser method before recovery.
 */
async function failStorageBoundary(page, method, key) {
  await page.evaluate(({ method, key }) => {
    const original = Storage.prototype[method];
    window.__identityStorageOriginal = { method, original };
    Storage.prototype[method] = function (requestedKey, ...args) {
      if (this === window.localStorage && requestedKey === key) {
        throw new DOMException('Synthetic identity storage failure', 'SecurityError');
      }
      return original.call(this, requestedKey, ...args);
    };
  }, { method, key });
  return async () => {
    await page.evaluate(() => {
      const { method, original } = window.__identityStorageOriginal;
      Storage.prototype[method] = original;
      delete window.__identityStorageOriginal;
    });
  };
}

/** Fill the four required registration controls through their semantic labels.
 * @param {import('@playwright/test').Page} page Live browser page.
 * @param {string} [confirmation='demo-only'] Exact password confirmation.
 */
async function fillRegistration(page, confirmation = 'demo-only') {
  await page.getByLabel('Display Name', { exact: true }).fill(' Riley Example ');
  await page.getByLabel('Username', { exact: true }).fill(' Riley ');
  await page.getByLabel('Password', { exact: true }).fill('demo-only');
  await page.getByLabel('Confirm Password', { exact: true }).fill(confirmation);
}

/** Open the account disclosure, then explicitly remove only the session.
 * @param {import('@playwright/test').Page} page Live browser page.
 * @param {string} name Signed-in display name.
 */
async function logoutFromNav(page, name) {
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
}

/** Registration validation cannot save; complete registration persists through reload and logout. */
test('registration failures, success, reload, logout and case-insensitive writer sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Please complete all four fields.', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
  await fillRegistration(page, 'mismatch');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Confirm Password')).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByLabel('Confirm Password').fill('demo-only');
  await page.getByLabel('Username', { exact: true }).fill(' AdMiN ');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBeNull();
  await page.getByLabel('Username', { exact: true }).fill(' Riley ');
  await page.getByRole('button', { name: 'Create account' }).click();
  // Reading is a later slice: verify real identity and role URL, never fabricate collection content.
  await expect(page).toHaveURL(/\/blogs$/);
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')));
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ displayName: 'Riley Example', username: 'Riley', role: 'user', password: 'demo-only' });
  expect(users[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(new Date(users[0].createdAt).toISOString()).toBe(users[0].createdAt);
  const session = { userId: users[0].id, username: 'Riley', displayName: 'Riley Example', role: 'user' };
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(session);
  await page.reload();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('button', { name: /Riley Example/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(session);
  await logoutFromNav(page, 'Riley Example');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual(users);
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_users')))).toEqual(users);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(' RILEY ');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
  await expect(page.getByRole('alert')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByLabel('Password', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(session);
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/blogs');
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await logoutFromNav(page, 'Riley Example');
});

/** Fixed admin is canonical and restored without ever pretending admin feature content exists. */
test('fixed admin login, role-home redirects, reload and explicit logout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(' ADMIN ');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const session = { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(session);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/admin');
  await page.getByRole('link', { name: 'Go to Dashboard' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toHaveCount(0);
  await logoutFromNav(page, 'Admin');
});

/** An explicit protected initial entry is allowed; subsequent recovery uses visible navigation. */
test('guest initial /blogs entry is guarded and auth logo and Back to Home recover discovery', async ({ page }) => {
  await page.goto('/blogs');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'WriteSpace', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Get Started Free' }).click();
  await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

/** A denied initial session read fails closed without repairing valid bytes; reload restores identity. */
test('unavailable session getter on initial /blogs entry preserves valid session and reload restores writer', async ({ page }) => {
  const writer = { ...localWriter, id: '9e72c8b4-183d-4f9b-8ee1-029847abfe62' };
  const session = { userId: writer.id, username: writer.username, displayName: writer.displayName, role: 'user' };
  const before = { users: JSON.stringify([writer], null, 2), session: JSON.stringify(session, null, 2), posts: '[]' };
  await page.addInitScript((bytes) => {
    // This marker survives reload; recovery must read existing bytes, not reseed them.
    if (sessionStorage.getItem('__identityInitialGetterRestored') === 'true') return;
    localStorage.setItem('writespace_users', bytes.users);
    localStorage.setItem('writespace_session', bytes.session);
    localStorage.setItem('writespace_posts', bytes.posts);
    const original = Storage.prototype.getItem;
    window.__identityInitialGetterOriginal = original;
    window.__identityInitialGetterDenials = 0;
    Storage.prototype.getItem = function (requestedKey, ...args) {
      if (this === window.localStorage && requestedKey === 'writespace_session') {
        window.__identityInitialGetterDenials += 1;
        throw new DOMException('Synthetic identity storage failure', 'SecurityError');
      }
      return original.call(this, requestedKey, ...args);
    };
  }, before);
  await page.goto('/blogs');
  try {
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.__identityInitialGetterDenials)).toBeGreaterThan(0);
  } finally {
    await page.evaluate(() => {
      Storage.prototype.getItem = window.__identityInitialGetterOriginal;
      delete window.__identityInitialGetterOriginal;
      sessionStorage.setItem('__identityInitialGetterRestored', 'true');
    });
  }
  expect(await storedBytes(page)).toEqual(before);
  await page.reload();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Riley Example/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toHaveCount(0);
  expect(await storedBytes(page)).toEqual(before);
});

/** Malformed session bytes never grant protected access or trigger render-time repair. */
for (const raw of ['{bad', '[]', '{"userId":"admin","username":"admin","displayName":"","role":"admin"}']) {
  test(`malformed session ${raw} fails closed on initial protected entry`, async ({ page }) => {
    await page.addInitScript((session) => {
      localStorage.setItem('writespace_session', session);
      localStorage.setItem('writespace_users', '[]');
      localStorage.setItem('writespace_posts', '[]');
    }, raw);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toHaveCount(0);
    expect(await storedBytes(page)).toEqual({ users: '[]', session: raw, posts: '[]' });
    await page.getByRole('link', { name: 'Back to Home', exact: true }).click();
    await page.getByRole('link', { name: 'Start Reading', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await storedBytes(page)).toEqual({ users: '[]', session: raw, posts: '[]' });
  });
}

/** Invalid account lists reject local login without blocking the canonical fixed admin. */
for (const raw of ['{bad', '{}']) {
  test(`malformed users ${raw} rejects writer login but fixed admin still works`, async ({ page }) => {
    await page.addInitScript((users) => {
      localStorage.setItem('writespace_users', users);
      localStorage.setItem('writespace_posts', '[]');
    }, raw);
    await page.goto('/login');
    const before = await storedBytes(page);
    expect(before).toEqual({ users: raw, session: null, posts: '[]' });
    await page.getByLabel('Username', { exact: true }).fill('Riley');
    await page.getByLabel('Password', { exact: true }).fill('demo-only');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
    expect(await storedBytes(page)).toEqual(before);
    await page.getByLabel('Username', { exact: true }).fill(' ADMIN ');
    await page.getByLabel('Password', { exact: true }).fill('admin');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
    expect(await storedBytes(page)).toEqual({ ...before, session: JSON.stringify({ userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' }) });
  });
}

/** A denied session setter cannot establish either writer or fixed-admin identity. */
for (const [username, password, home, heading] of [
  ['Riley', 'demo-only', '/blogs', 'All Blogs'],
  ['admin', 'admin', '/admin', 'Admin Dashboard'],
]) {
  test(`${username} login session-write failure stays guest until boundary restoration`, async ({ page }) => {
    await page.addInitScript((writer) => {
      localStorage.setItem('writespace_users', JSON.stringify([writer]));
      localStorage.setItem('writespace_session', '{bad');
      localStorage.setItem('writespace_posts', '[]');
    }, localWriter);
    await page.goto('/login');
    const before = await storedBytes(page);
    expect(before.session).toBe('{bad');
    const restore = await failStorageBoundary(page, 'setItem', 'writespace_session');
    try {
      await page.getByLabel('Username', { exact: true }).fill(username);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Unable to save local data. Check browser storage and try again.');
      await expect(page.getByRole('alert')).toBeFocused();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
      expect(await storedBytes(page)).toEqual(before);
    } finally {
      await restore();
    }
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    const session = username === 'admin'
      ? { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' }
      : { userId: localWriter.id, username: localWriter.username, displayName: localWriter.displayName, role: 'user' };
    expect(await storedBytes(page)).toEqual({ ...before, session: JSON.stringify(session) });
  });
}

/** The first registration key failing cannot claim account creation or alter old bytes. */
test('registration users-write failure preserves accounts and guest view', async ({ page }) => {
  await page.addInitScript((writer) => {
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    localStorage.setItem('writespace_session', '{bad');
    localStorage.setItem('writespace_posts', '[]');
  }, { ...localWriter, username: 'existing' });
  await page.goto('/register');
  const before = await storedBytes(page);
  const restore = await failStorageBoundary(page, 'setItem', 'writespace_users');
  try {
    await fillRegistration(page);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to save local data. Check browser storage and try again.');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
    expect(await storedBytes(page)).toEqual(before);
  } finally {
    await restore();
  }
});

/** Session failure after account save is nontransactional; recover by genuine sign-in. */
test('registration second-key failure keeps saved account without success then real sign-in recovers', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('writespace_users', '[]');
    localStorage.setItem('writespace_session', '{bad');
    localStorage.setItem('writespace_posts', '[]');
  });
  await page.goto('/register');
  const before = await storedBytes(page);
  const restore = await failStorageBoundary(page, 'setItem', 'writespace_session');
  let savedBytes;
  let saved;
  try {
    await fillRegistration(page);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Your account was saved, but sign-in failed. Check browser storage, then you can sign in with this account.');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole('heading', { name: 'Register', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toHaveCount(0);
    const after = await storedBytes(page);
    expect(after.session).toBe(before.session);
    expect(after.posts).toBe(before.posts);
    savedBytes = after.users;
    const users = JSON.parse(savedBytes);
    expect(users).toHaveLength(1);
    saved = users[0];
    expect(saved).toEqual({ id: expect.any(String), createdAt: expect.any(String), displayName: 'Riley Example', username: 'Riley', password: 'demo-only', role: 'user' });
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);
  } finally {
    await restore();
  }
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill(' RILEY ');
  await page.getByLabel('Password', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Riley Example/ })).toBeVisible();
  expect(await storedBytes(page)).toEqual({ users: savedBytes, posts: before.posts, session: JSON.stringify({ userId: saved.id, username: 'Riley', displayName: 'Riley Example', role: 'user' }) });
});

/** Failed explicit removal retains both persisted identity and authenticated presentation. */
test('logout session-remove failure retains authenticated view and restores real logout', async ({ page }) => {
  await page.addInitScript((writer) => {
    localStorage.setItem('writespace_users', JSON.stringify([writer]));
    localStorage.setItem('writespace_posts', '[]');
  }, localWriter);
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  const before = await storedBytes(page);
  expect(JSON.parse(before.session)).toEqual({ userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' });
  const restore = await failStorageBoundary(page, 'removeItem', 'writespace_session');
  try {
    await page.getByRole('button', { name: /Admin/ }).click();
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to remove local data. Check browser storage and try again.');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Account navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Admin/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0);
    expect(await storedBytes(page)).toEqual(before);
  } finally {
    await restore();
  }
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'WriteSpace', level: 1 })).toBeVisible();
  expect(await storedBytes(page)).toEqual({ ...before, session: null });
});

/** Mobile auth remains label-driven and exposes account actions via its responsive disclosure. */
test('mobile admin identity and logout use semantic navigation disclosures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).toBeVisible();
  await logoutFromNav(page, 'Admin');
  await expect(page.getByRole('heading', { name: 'WriteSpace', level: 1 })).toBeVisible();
});
