/** @module authoring-browser-spec Exercise real browser-local authoring through UI navigation; authored only, not run by this slice. */
import { test, expect } from './fixtures';

const otherWriter = { userId: 'other-writer', username: 'other-writer', displayName: 'Other Writer', role: 'user' };
const foreignPost = { id: 'foreign-post', title: 'Another writer’s post', content: 'Foreign plain text\nSecond line', authorId: 'original-writer', authorName: 'Original Writer', createdAt: '2025-01-02T10:00:00.000Z' };

/** Re-read actual product storage after UI actions instead of relying on loaded page state.
 * @param {import('@playwright/test').Page} page Current browser page.
 * @returns {Promise<object>} Persisted posts/session/users.
 */
async function storedData(page) {
  return page.evaluate(() => ({
    posts: JSON.parse(localStorage.getItem('writespace_posts') || '[]'),
    session: JSON.parse(localStorage.getItem('writespace_session') || 'null'),
    users: JSON.parse(localStorage.getItem('writespace_users') || '[]'),
  }));
}

/** Seed only initial cross-owner scenario data; never reset a live journey on reload.
 * @param {import('@playwright/test').Page} page Isolated test browser.
 * @returns {Promise<void>} Initial-storage script registration.
 */
async function seedCrossOwner(page) {
  await page.addInitScript(({ session, post }) => {
    if (!localStorage.getItem('writespace_session')) {
      localStorage.setItem('writespace_session', JSON.stringify(session));
      localStorage.setItem('writespace_posts', JSON.stringify([post]));
    }
  }, { session: otherWriter, post: foreignPost });
}

test('registration → write → read → edit → cancel → confirmed delete persists without browser errors', async ({ page, browserErrors }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
  await page.getByRole('textbox', { name: 'Display Name', exact: true }).fill('Journey Writer');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('journey-writer');
  await page.getByLabel('Password', { exact: true }).fill('disposable-demo-password');
  await page.getByLabel('Confirm Password', { exact: true }).fill('disposable-demo-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  const registered = await storedData(page);
  expect(registered.users).toHaveLength(1);
  expect(registered.session).toMatchObject({ username: 'journey-writer', displayName: 'Journey Writer', role: 'user' });
  expect(registered.session.userId).toBe(registered.users[0].id);

  await page.getByRole('link', { name: 'Write', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(' ');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(' ');
  await page.getByRole('button', { name: 'Save Post', exact: true }).click();
  await expect(page.getByText('Title is required.', { exact: true })).toBeVisible();
  await expect(page.getByText('Content is required.', { exact: true })).toBeVisible();
  expect((await storedData(page)).posts).toEqual([]);
  const title = 'A browser-local beginning';
  const body = '  First line\n\nSecond line\twith whitespace  ';
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(body);
  await expect(page.getByRole('status')).toHaveText(`${body.length} characters`);
  await page.getByRole('button', { name: 'Save Post', exact: true }).click();
  await expect(page).toHaveURL(/\/blog\/[^/]+$/);
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  await expect(page.locator('article .whitespace-pre-wrap')).toHaveJSProperty('textContent', body);
  const created = (await storedData(page)).posts[0];
  expect(created).toMatchObject({ title, content: body, authorId: registered.session.userId, authorName: 'Journey Writer' });
  expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  expect((await storedData(page)).posts).toEqual([created]);

  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${created.id}$`));
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(body);
  const revisedTitle = 'A revised browser-local beginning';
  const revisedBody = '<script>not executed</script>\nRevised plain text';
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(revisedTitle);
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(revisedBody);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  await expect(page.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();
  await expect(page.locator('article .whitespace-pre-wrap')).toHaveJSProperty('textContent', revisedBody);
  await expect(page.locator('article script')).toHaveCount(0);
  const revised = { ...created, title: revisedTitle, content: revisedBody };
  expect((await storedData(page)).posts).toEqual([revised]);
  await page.reload();
  await expect(page.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();
  expect((await storedData(page)).posts).toEqual([revised]);

  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Discarded revision');
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill('Discarded body');
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect((await storedData(page)).posts).toEqual([revised]);
  await page.getByRole('link', { name: revisedTitle, exact: true }).click();
  await expect(page.locator('article .whitespace-pre-wrap')).toHaveJSProperty('textContent', revisedBody);

  const cancelDialog = page.waitForEvent('dialog');
  const cancelledClick = page.getByRole('button', { name: 'Delete', exact: true }).click();
  const cancellation = await cancelDialog;
  expect(cancellation.type()).toBe('confirm');
  await cancellation.dismiss();
  await cancelledClick;
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
  expect((await storedData(page)).posts).toEqual([revised]);
  await expect(page.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();

  const confirmDialog = page.waitForEvent('dialog');
  const confirmedClick = page.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = await confirmDialog;
  expect(confirmation.type()).toBe('confirm');
  await confirmation.accept();
  await confirmedClick;
  await expect(page).toHaveURL(/\/blogs$/);
  const removed = await storedData(page);
  expect(removed.posts).toEqual([]);
  expect(removed.session).toEqual(registered.session);
  expect(removed.users).toEqual(registered.users);
  await page.reload();
  await expect(page.getByRole('link', { name: revisedTitle, exact: true })).toHaveCount(0);
  expect((await storedData(page)).posts).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('cross-owner reading has no Edit or Delete controls and does not change persisted posts', async ({ page, browserErrors }) => {
  await seedCrossOwner(page);
  await page.goto('/blogs');
  await page.getByRole('link', { name: foreignPost.title, exact: true }).click();
  await expect(page).toHaveURL(/\/blog\/foreign-post$/);
  await expect(page.getByRole('heading', { name: foreignPost.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  expect((await storedData(page)).posts).toEqual([foreignPost]);
  await page.reload();
  await expect(page.getByRole('heading', { name: foreignPost.title, exact: true })).toBeVisible();
  expect((await storedData(page)).posts).toEqual([foreignPost]);
  expect(browserErrors).toEqual([]);
});

test('separate direct-edit entry rejects a cross-owner writer without exposing or changing the draft', async ({ page, browserErrors }) => {
  await seedCrossOwner(page);
  await page.goto('/edit/foreign-post');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toHaveCount(0);
  expect((await storedData(page)).posts).toEqual([foreignPost]);
  expect((await storedData(page)).session).toEqual(otherWriter);
  expect(browserErrors).toEqual([]);
});

for (const path of ['/write', '/edit/foreign-post']) {
  test(`guest initial entry ${path} is guarded`, async ({ page, browserErrors }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Login', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0);
    expect((await storedData(page)).posts).toEqual([]);
    expect(browserErrors).toEqual([]);
  });
}
