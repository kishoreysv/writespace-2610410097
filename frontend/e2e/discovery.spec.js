/** @module discovery-e2e Live browser journeys written now; parent runs after remaining slices/review. */
import { test, expect } from './fixtures';

/** Attach actual screenshot, accessibility tree, HTML and loaded font evidence.
 * @param {import('@playwright/test').Page} page Live browser page.
 * @param {import('@playwright/test').TestInfo} testInfo Attachment destination.
 * @param {string} label Representative state.
 */
async function capturePreflight(page, testInfo, label) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await testInfo.attach(`${label}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await testInfo.attach(`${label}-accessibility`, {
    body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain',
  });
  await testInfo.attach(`${label}-html`, {
    body: await page.content(), contentType: 'text/html',
  });
  const fonts = await page.evaluate(() => ({
    heading: getComputedStyle(document.querySelector('h1')).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
    outfitLoaded: document.fonts.check('700 32px Outfit'),
    sourceSansLoaded: document.fonts.check('400 16px "Source Sans 3"'),
  }));
  await testInfo.attach(`${label}-computed-fonts`, {
    body: JSON.stringify(fonts, null, 2), contentType: 'application/json',
  });
  expect(fonts.heading).toContain('Outfit');
  expect(fonts.body).toContain('Source Sans 3');
  expect(fonts.outfitLoaded).toBe(true);
  expect(fonts.sourceSansLoaded).toBe(true);
}

/** Guest activation destinations reach identity forms and recover Home through explicit links. */
test('guest navigation and CTAs reach login or registration and recover Home', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeVisible();
  await expect(page.getByText('Your thoughts. Your space. Beautifully simple.')).toBeVisible();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  for (const name of ['Write Freely', 'Private & Local', 'Instant & Fast']) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await capturePreflight(page, testInfo, 'desktop-empty');
  const destinations = [
    ['Public navigation', 'Login', '/login'],
    ['Public navigation', 'Get Started', '/register'],
    [null, 'Start Reading', '/login'],
    [null, 'Get Started Free', '/register'],
    ['Footer navigation', 'All Blogs', '/login'],
    ['Footer navigation', 'Login', '/login'],
    ['Footer navigation', 'Register', '/register'],
  ];
  for (const [region, name, path] of destinations) {
    const scope = region ? page.getByRole('navigation', { name: region }) : page;
    await scope.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: path === '/login' ? 'Login' : 'Register', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
  }
  await page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'WriteSpace' })).toBeVisible();
});

/** Populate the actual browser boundary before entry, then exercise real preview links and re-read. */
test('seeded browser-local previews are capped, escaped, persistent and linked', async ({ page }, testInfo) => {
  const records = [1, 4, 2, 3].map((day) => ({
    id: `local-${day}`, title: `Browser note ${day}`, content: `Real local text ${day} <script>alert(1)</script>`,
    authorName: 'Riley', authorId: 'local-writer', createdAt: `2025-01-0${day}T12:00:00Z`,
  }));
  /** Seed persisted test data once per browser document without mocking product operations. */
  await page.addInitScript((posts) => {
    if (localStorage.getItem('writespace_posts') === null) {
      localStorage.setItem('writespace_posts', JSON.stringify(posts));
    }
  }, records);
  await page.goto('/');
  const latest = page.getByRole('region', { name: 'Latest from the Blog' });
  await expect(latest.getByRole('article')).toHaveCount(3);
  await expect(latest.getByRole('heading', { level: 3 })).toHaveText(['Browser note 4', 'Browser note 3', 'Browser note 2']);
  await expect(latest.getByText('Jan 04, 2025')).toBeVisible();
  await expect(latest.getByText('Real local text 4 <script>alert(1)</script>', { exact: true })).toBeVisible();
  await capturePreflight(page, testInfo, 'desktop-populated');
  await latest.getByRole('link', { name: 'Browser note 4' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Browser note 4' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_posts')))).toEqual(records);
});

/** Corrupt browser data uses the empty-state contract and is never silently repaired. */
test('malformed browser storage stays unchanged after landing and link navigation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('writespace_posts', '{bad'));
  await page.goto('/');
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe('{bad');
});

/** Mobile disclosure preserves semantic controls and keyboard accessibility. */
test('mobile navigation opens, closes after activation and fits the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const nav = page.getByRole('navigation', { name: 'Public navigation' });
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await capturePreflight(page, testInfo, 'mobile-menu-open');
  await nav.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(nav).toBeHidden();
  await capturePreflight(page, testInfo, 'mobile-empty');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
