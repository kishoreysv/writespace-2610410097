/** @module identity-e2e Live browser-local identity journeys; written only, parent executes later. */
import { test, expect } from './fixtures';

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
