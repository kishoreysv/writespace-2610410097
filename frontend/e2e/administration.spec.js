/** @module administration-browser-spec Real local administration journeys; authored here, execution is parent-owned. */
import { test, expect } from './fixtures';

const writer = { userId: 'seed-writer', username: 'seed-writer', displayName: 'Seed Writer', role: 'user' };
const writerAccount = {
  id: writer.userId, username: writer.username, displayName: writer.displayName,
  password: 'seed-demo-only', role: 'user', createdAt: '2025-01-01T00:00:00.000Z',
};
const posts = Array.from({ length: 7 }, (_, index) => ({
  id: `seed-post-${index}`, title: `Seed story ${index}`, content: `Writer body ${index}\nSecond line`,
  authorId: writer.userId, authorName: writer.displayName, createdAt: `2025-01-0${index + 1}T00:00:00.000Z`,
}));

/** Read persisted outcomes while keeping account passwords out of test reports.
 * @param {import('@playwright/test').Page} page Active browser page.
 * @returns {Promise<object>} Public users, full posts and public session.
 */
async function stored(page) {
  return page.evaluate(() => ({
    users: JSON.parse(localStorage.getItem('writespace_users') || '[]').map(({ password, ...account }) => account),
    posts: JSON.parse(localStorage.getItem('writespace_posts') || '[]'),
    session: JSON.parse(localStorage.getItem('writespace_session') || 'null'),
  }));
}

/** Seed only initial real localStorage data, never mock product services or reset a live journey.
 * @param {import('@playwright/test').Page} page Isolated browser page.
 * @param {object|null} session Optional initial writer identity for separate guard entries.
 * @returns {Promise<void>} Initialization registration.
 */
async function seed(page, session = null) {
  await page.addInitScript(({ initialPosts, account, identity }) => {
    if (localStorage.getItem('writespace_posts') === null) {
      localStorage.setItem('writespace_posts', JSON.stringify(initialPosts));
      localStorage.setItem('writespace_users', JSON.stringify([account]));
      if (identity) localStorage.setItem('writespace_session', JSON.stringify(identity));
    }
  }, { initialPosts: posts, account: writerAccount, identity: session });
}

/** Fill native account form controls without changing storage directly.
 * @param {import('@playwright/test').Page} page Users page.
 * @param {string} username Disposable account username.
 * @param {string} role Lowercase stored role.
 * @returns {Promise<void>} Draft completion.
 */
async function fillAccount(page, username, role) {
  await page.getByLabel('Display Name', { exact: true }).fill(`Created ${username}`);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('disposable-local-demo');
  await page.getByLabel('Role', { exact: true }).selectOption(role);
}

/** Sign in via the actual local login form.
 * @param {import('@playwright/test').Page} page Login page.
 * @param {string} username Disposable demo username.
 * @param {string} password Demo-only credential, never returned or logged.
 * @returns {Promise<void>} Explicit sign-in submission.
 */
async function login(page, username, password) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

/** Resolve the real browser confirmation after clicking the named eligible Delete button.
 * @param {import('@playwright/test').Page} page Active page.
 * @param {string} name Accessible Delete action name.
 * @param {boolean} confirmed Whether to accept rather than cancel.
 * @returns {Promise<void>} Explicit confirmed/cancelled action.
 */
async function deleteDialog(page, name, confirmed) {
  const waiting = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name, exact: true }).click();
  const dialog = await waiting;
  expect(dialog.type()).toBe('confirm');
  if (confirmed) await dialog.accept();
  else await dialog.dismiss();
  await click;
}

/** Use account disclosure UI to log out and click the public login link.
 * @param {import('@playwright/test').Page} page Signed-in page.
 * @param {string} displayName Account menu trigger.
 * @returns {Promise<void>} Login destination via normal navigation.
 */
async function logoutToLogin(page, displayName) {
  await page.getByRole('button', { name: new RegExp(displayName) }).click();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('navigation', { name: 'Public navigation', exact: true }).getByRole('link', { name: 'Login', exact: true }).click();
}

test('fixed admin signs in, creates user/admin accounts, validates duplicates and protects fixed/current accounts', async ({ page, browserErrors }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Public navigation', exact: true }).getByRole('link', { name: 'Login', exact: true }).click();
  await login(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  const before = await stored(page);
  expect(before.users).toEqual([]);
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete admin', exact: true })).toHaveAttribute('title', 'Default admin cannot be deleted.');
  await expect(page.getByText('No stored accounts yet.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByLabel('Display Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect((await stored(page)).users).toEqual([]);

  await fillAccount(page, 'local-writer', 'user');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('User created successfully.');
  let data = await stored(page);
  const createdWriter = data.users[0];
  expect(createdWriter).toMatchObject({ displayName: 'Created local-writer', username: 'local-writer', role: 'user' });
  expect(createdWriter.id).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  expect(new Date(createdWriter.createdAt).toISOString()).toBe(createdWriter.createdAt);

  await fillAccount(page, ' LOCAL-WRITER ', 'admin');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.locator('#account-username-error')).toHaveText('Username is already taken.');
  expect((await stored(page)).users).toEqual([createdWriter]);
  await page.getByLabel('Username', { exact: true }).fill(' AdMiN ');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.locator('#account-username-error')).toHaveText('Username is already taken.');
  await fillAccount(page, 'local-admin', 'admin');
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('User created successfully.');
  data = await stored(page);
  const createdAdmin = data.users[1];
  expect(createdAdmin).toMatchObject({ username: 'local-admin', role: 'admin' });
  await expect(page.getByRole('list', { name: 'Accounts' })).not.toContainText('disposable-local-demo');

  await logoutToLogin(page, 'Admin');
  await login(page, 'local-writer', 'disposable-local-demo');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  const writerSession = { userId: createdWriter.id, username: 'local-writer', displayName: 'Created local-writer', role: 'user' };
  expect((await stored(page)).session).toEqual(writerSession);
  expect((await stored(page)).users).toEqual([createdWriter, createdAdmin]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  expect((await stored(page)).session).toEqual(writerSession);
  await logoutToLogin(page, 'Created local-writer');
  await login(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('navigation', { name: 'Account navigation', exact: true }).getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();

  await deleteDialog(page, 'Delete local-writer', false);
  expect((await stored(page)).users).toEqual([createdWriter, createdAdmin]);
  await expect(page.getByRole('heading', { name: 'Created local-writer', exact: true })).toBeVisible();
  await deleteDialog(page, 'Delete local-writer', true);
  await expect(page.getByRole('status')).toHaveText('Account deleted successfully.');
  expect((await stored(page)).users).toEqual([createdAdmin]);
  await expect(page.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();

  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Total Users', exact: true }).getByText('1', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Total Admins', exact: true }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Total users', exact: true }).getByText('0', { exact: true })).toBeVisible();
  await logoutToLogin(page, 'Admin');
  await login(page, 'local-admin', 'disposable-local-demo');
  await expect(page).toHaveURL(/\/admin$/);
  expect((await stored(page)).session).toMatchObject({ userId: createdAdmin.id, role: 'admin' });
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete local-admin', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete local-admin', exact: true })).toHaveAttribute('title', 'Your current account cannot be deleted.');
  expect((await stored(page)).users).toEqual([createdAdmin]);
  await page.screenshot({ path: 'test-results/administration-accounts-desktop.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('admin recent list caps at five and edits/deletes seeded writer posts through real services', async ({ page, browserErrors }) => {
  await seed(page);
  await page.goto('/login');
  await login(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Seed story 6', 'Seed story 5', 'Seed story 4', 'Seed story 3', 'Seed story 2',
  ]);
  await expect(page.getByRole('region', { name: 'Total Posts', exact: true }).getByText('7', { exact: true })).toBeVisible();
  expect((await stored(page)).posts).toEqual(posts);
  await page.getByRole('link', { name: 'Edit Seed story 6', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Seed story 6');
  await page.getByLabel('Title', { exact: true }).fill('Admin revised writer story');
  await page.getByLabel('Content', { exact: true }).fill('Admin override\nPlain text');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin revised writer story', exact: true })).toBeVisible();
  const revised = { ...posts[6], title: 'Admin revised writer story', content: 'Admin override\nPlain text' };
  expect((await stored(page)).posts).toEqual([...posts.slice(0, 6), revised]);
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByRole('link', { name: 'Go to Dashboard', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await deleteDialog(page, 'Delete Admin revised writer story', false);
  expect((await stored(page)).posts).toEqual([...posts.slice(0, 6), revised]);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin revised writer story', exact: true })).toBeVisible();
  await deleteDialog(page, 'Delete Admin revised writer story', true);
  expect((await stored(page)).posts).toEqual(posts.slice(0, 6));
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin revised writer story', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Blog collection', exact: true }).getByRole('article')).toHaveCount(6);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Seed story 5', 'Seed story 4', 'Seed story 3', 'Seed story 2', 'Seed story 1', 'Seed story 0',
  ]);
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByRole('link', { name: 'Go to Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Seed story 5', 'Seed story 4', 'Seed story 3', 'Seed story 2', 'Seed story 1',
  ]);
  await page.getByRole('link', { name: 'Write New Post', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await page.getByRole('button', { name: /Admin/ }).click();
  await page.getByRole('link', { name: 'Go to Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'All Blogs', exact: true }).last().click();
  await expect(page.getByRole('article')).toHaveCount(6);
  expect((await stored(page)).posts).toEqual(posts.slice(0, 6));
  expect(browserErrors).toEqual([]);
});

test('mobile admin navigates dashboard to users and back through explicit links', async ({ page, browserErrors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await login(page, 'admin', 'admin');
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page.getByLabel('Role', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/administration-users-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: 'Account navigation', exact: true })).toHaveCount(0);
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: 'Account navigation', exact: true }).getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: 'Account navigation', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

for (const raw of ['{bad', '{}', 'null', '[null,false,[],{}]']) {
  test(`malformed users ${raw} safely render management without repairing stored data`, async ({ page, browserErrors }) => {
    await page.addInitScript((users) => {
      if (localStorage.getItem('writespace_users') === null) localStorage.setItem('writespace_users', users);
    }, raw);
    await page.goto('/login');
    await login(page, 'admin', 'admin');
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
    await expect(page.getByLabel('Display Name', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();
    if (raw === '[null,false,[],{}]') {
      await expect(page.getByRole('heading', { name: 'Unknown account', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete Unknown username', exact: true })).toBeDisabled();
      await expect(page.getByRole('list', { name: 'Accounts', exact: true }).getByRole('listitem')).toHaveCount(2);
    } else {
      await expect(page.getByText('No stored accounts yet.', { exact: true })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Accounts', exact: true }).getByRole('listitem')).toHaveCount(1);
    }
    expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe(raw);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe(raw);
    expect(browserErrors).toEqual([]);
  });
}

test('Create User reports account-key Storage.setItem failure without success, navigation or data changes', async ({ page, browserErrors }) => {
  await seed(page);
  await page.goto('/login');
  await login(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  const before = await stored(page);
  const usersBefore = await page.evaluate(() => localStorage.getItem('writespace_users'));
  await fillAccount(page, 'quota-writer', 'user');
  // Inject only the browser storage fault boundary; all validation and product services remain real.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'writespace_users') throw new DOMException('Demo storage quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Create User', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Unable to save local data. Check browser storage and try again.');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('quota-writer');
  await expect(page.getByRole('heading', { name: 'Created quota-writer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Accounts', exact: true }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Seed Writer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe(usersBefore);
  expect(await stored(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Created quota-writer', exact: true })).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
  expect(browserErrors).toEqual([]);
});

test('confirmed account deletion reports users-key Storage.setItem failure without success, navigation or removal', async ({ page, browserErrors }) => {
  await seed(page);
  await page.goto('/login');
  await login(page, 'admin', 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Manage Users', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('button', { name: 'Delete seed-writer', exact: true })).toBeEnabled();
  const before = await stored(page);
  const usersBefore = await page.evaluate(() => localStorage.getItem('writespace_users'));
  try {
    // Fault only the browser users-key write boundary; confirmation and product services remain real.
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreAccountDeleteStorage = () => {
        Storage.prototype.setItem = original;
        delete window.__restoreAccountDeleteStorage;
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === 'writespace_users') throw new DOMException('Demo storage quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await deleteDialog(page, 'Delete seed-writer', true);
    await expect(page.getByRole('alert')).toHaveText('Unable to save local data. Check browser storage and try again.');
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Manage Users', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Seed Writer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete seed-writer', exact: true })).toBeEnabled();
    await expect(page.getByRole('list', { name: 'Accounts', exact: true }).getByRole('listitem')).toHaveCount(2);
    expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe(usersBefore);
    expect(await stored(page)).toEqual(before);
  } finally {
    await page.evaluate(() => window.__restoreAccountDeleteStorage?.());
  }
  expect(await page.evaluate(() => localStorage.getItem('writespace_users'))).toBe(usersBefore);
  expect(await stored(page)).toEqual(before);
  expect(browserErrors).toEqual([]);
});

for (const path of ['/admin', '/users']) {
  test(`guest initial entry ${path} redirects to login without exposing administration`, async ({ page, browserErrors }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create User', exact: true })).toHaveCount(0);
    expect((await stored(page)).users).toEqual([]);
    expect(browserErrors).toEqual([]);
  });

  test(`writer initial entry ${path} redirects to blogs with no admin controls or mutations`, async ({ page, browserErrors }) => {
    await seed(page, writer);
    await page.goto(path);
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create User', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    expect((await stored(page)).posts).toEqual(posts);
    expect((await stored(page)).session).toEqual(writer);
    expect(browserErrors).toEqual([]);
  });
}
