/** @module reading-e2e Real browser-local reading journeys; parent runs this spec later. */
import { test, expect } from './fixtures';

const reader = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Riley Reader',
  username: 'reader',
  password: 'demo-only',
  role: 'user',
  createdAt: '2025-01-01T00:00:00Z',
};
const posts = [1, 5, 2, 4, 3].map((day) => ({
  id: `00000000-0000-4000-8000-00000000000${day}`,
  title: `Reading note ${day}`,
  content: `  Opening note ${day}\n\nSecond line\twith spacing. ${'Plain text continues. '.repeat(12)}<script>window.readerXss=true</script>\n<img src=x onerror="window.readerXss=true">`,
  createdAt: `2025-01-0${day}T00:00:00Z`,
  authorId: day === 5 ? 'admin' : reader.id,
  authorName: day === 5 ? 'Admin' : reader.displayName,
}));
const newest = posts.find((post) => post.title === 'Reading note 5');

/** Seed real browser storage only when absent; reload must keep the existing data.
 * @param {import('@playwright/test').Page} page Live page.
 * @param {object} options Records and optional session for a direct-ID fixture entry.
 */
async function seed(page, { records = posts, session = null } = {}) {
  await page.addInitScript(({ records, reader, session }) => {
    if (localStorage.getItem('writespace_posts') === null) {
      localStorage.setItem('writespace_posts', JSON.stringify(records));
    }
    if (localStorage.getItem('writespace_users') === null) {
      localStorage.setItem('writespace_users', JSON.stringify([reader]));
    }
    if (session && localStorage.getItem('writespace_session') === null) {
      localStorage.setItem('writespace_session', JSON.stringify(session));
    }
  }, { records, reader, session });
}

/** Use the visible guest login link and actual local credentials.
 * @param {import('@playwright/test').Page} page Live page at discovery.
 * @param {string} role Requested local role.
 */
async function login(page, role = 'user') {
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(role === 'admin' ? 'admin' : 'reader');
  await page.getByLabel('Password', { exact: true }).fill(role === 'admin' ? 'admin' : 'demo-only');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  if (role === 'admin') {
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'All Blogs', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/blogs$/);
}

/** Validate full plain text, metadata and escaped markup from the seeded record.
 * @param {import('@playwright/test').Page} page Live reader page.
 */
async function assertReader(page) {
  const article = page.getByRole('article');
  await expect(article.getByRole('heading', { name: newest.title, exact: true })).toBeVisible();
  await expect(article.getByText('Admin', { exact: true })).toBeVisible();
  await expect(article.getByText('Jan 05, 2025', { exact: true })).toBeVisible();
  await expect(article.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  const body = article.locator('.whitespace-pre-wrap');
  await expect(body).toHaveCSS('white-space', 'pre-wrap');
  expect(await body.textContent()).toBe(newest.content);
  await expect(article.locator('script, img')).toHaveCount(0);
  expect(await page.evaluate(() => window.readerXss)).toBeUndefined();
}

test('UI login, all newest-first cards, full reader, persisted reload and back to collection', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await login(page);
  const collection = page.getByRole('region', { name: 'Blog collection' });
  const cards = collection.getByRole('article');
  await expect(cards).toHaveCount(5);
  await expect(cards.getByRole('heading')).toHaveText(['Reading note 5', 'Reading note 4', 'Reading note 3', 'Reading note 2', 'Reading note 1']);
  expect(await cards.first().locator('p').nth(1).textContent()).toBe(newest.content.slice(0, 120));
  await expect(cards.first().getByText('Admin', { exact: true })).toBeVisible();
  await collection.getByRole('link', { name: newest.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${newest.id}$`));
  await assertReader(page);
  const session = await page.evaluate(() => localStorage.getItem('writespace_session'));
  const storedPosts = await page.evaluate(() => localStorage.getItem('writespace_posts'));
  expect(JSON.parse(storedPosts)).toEqual(posts);
  await page.reload();
  await assertReader(page);
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(storedPosts);
  expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBe(session);
  await page.getByRole('link', { name: 'Back to Blogs', exact: true }).click();
  await expect(cards).toHaveCount(5);
  await expect(cards.last().getByText('Riley Reader', { exact: true })).toBeVisible();
  await expect(cards.last().getByText('Jan 01, 2025', { exact: true })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(1);
});

for (const { width, columns } of [
  { width: 390, columns: 1 },
  { width: 640, columns: 1 },
  { width: 767, columns: 1 },
  { width: 768, columns: 2 },
  { width: 1024, columns: 3 },
]) {
  test(`real registration and reader journey at ${width}px uses ${columns} collection columns`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
    await page.getByLabel('Display Name', { exact: true }).fill('New Reader');
    await page.getByLabel('Username', { exact: true }).fill('new-reader');
    await page.getByLabel('Password', { exact: true }).fill('demo-only');
    await page.getByLabel('Confirm Password', { exact: true }).fill('demo-only');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    const collection = page.getByRole('region', { name: 'Blog collection' });
    await expect(collection.getByRole('article')).toHaveCount(5);
    await expect.poll(async () => collection.evaluate((element) => (
      getComputedStyle(element).gridTemplateColumns.split(/\s+/).length
    ))).toBe(columns);
    await expect(collection.getByRole('heading')).toHaveText(['Reading note 5', 'Reading note 4', 'Reading note 3', 'Reading note 2', 'Reading note 1']);
    await collection.getByRole('link', { name: newest.title, exact: true }).click();
    await assertReader(page);
    await page.getByRole('link', { name: 'Back to Blogs', exact: true }).click();
    await expect(collection.getByRole('article').last().getByText('Riley Reader', { exact: true })).toBeVisible();
  });
}

for (const role of ['user', 'admin']) {
  test(`empty collection has exact copy and real Write link for ${role}`, async ({ page }) => {
    await seed(page, { records: [] });
    await page.goto('/');
    await login(page, role);
    const main = page.getByRole('main');
    await expect(main.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Write', exact: true })).toHaveAttribute('href', '/write');
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual([]);
  });
}

for (const path of ['/blogs', `/blog/${newest.id}`]) {
  test(`guest initial ${path} redirects to login without exposing local content`, async ({ page }) => {
    await seed(page);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await expect(page.getByText('Browser-local demo only.', { exact: false })).toBeVisible();
    await expect(page.getByText(newest.content, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('writespace_session'))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual(posts);
    await page.getByRole('link', { name: 'Back to Home', exact: true }).click();
    await page.getByRole('region', { name: 'Latest from the Blog' }).getByRole('link', { name: newest.title, exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });
}

test('unknown ID initial entry has exact missing state and real back-link recovery', async ({ page }) => {
  const session = { userId: reader.id, username: reader.username, displayName: reader.displayName, role: 'user' };
  await seed(page, { session });
  await page.goto('/blog/unknown-reading-id');
  await expect(page.getByRole('heading', { name: 'Post not found', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Blogs', exact: true }).click();
  const collection = page.getByRole('region', { name: 'Blog collection' });
  await expect(collection.getByRole('article')).toHaveCount(5);
  await expect(collection.getByRole('article').first().getByText('Jan 05, 2025', { exact: true })).toBeVisible();
  await collection.getByRole('link', { name: newest.title, exact: true }).click();
  await assertReader(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual(posts);
});
