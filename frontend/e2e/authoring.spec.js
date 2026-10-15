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

  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Write', exact: true }).click();
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

  // Cross-feature reads must discover the actual UI-created and edited record, never a reseeded copy.
  const accountNavigation = page.getByRole('navigation', { name: 'Account navigation' });
  await accountNavigation.getByRole('button', { name: 'Journey Writer', exact: false }).click();
  await accountNavigation.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await storedData(page)).toEqual({ posts: [revised], session: null, users: registered.users });
  const latest = page.getByRole('region', { name: 'Latest from the Blog', exact: true });
  await expect(latest.getByRole('article')).toHaveCount(1);
  await expect(latest.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();
  await expect(latest.getByRole('link', { name: revisedTitle, exact: true })).toHaveAttribute('href', `/blog/${created.id}`);
  await expect(latest.getByRole('article').locator('p').nth(1)).toHaveJSProperty('textContent', revisedBody.slice(0, 120));
  await expect(latest.getByText('Journey Writer', { exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Total Posts', exact: true }).locator('p').first()).toHaveText('1');
  const recent = page.getByRole('region', { name: 'Recent Posts', exact: true });
  await expect(recent.getByRole('article')).toHaveCount(1);
  await expect(recent.getByRole('heading', { name: revisedTitle, exact: true })).toBeVisible();
  await expect(recent.getByRole('link', { name: revisedTitle, exact: true })).toHaveAttribute('href', `/blog/${created.id}`);
  await expect(recent.getByRole('article').locator('p').nth(1)).toHaveJSProperty('textContent', revisedBody.slice(0, 120));
  await expect(recent.getByText('Journey Writer', { exact: true })).toBeVisible();
  await expect(recent.getByRole('link', { name: `Edit ${revisedTitle}`, exact: true })).toBeVisible();
  await expect(recent.getByRole('button', { name: `Delete ${revisedTitle}`, exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual({
    posts: [revised],
    session: { userId: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' },
    users: registered.users,
  });

  // Return through real logout/login so the original writer owns the unchanged delete journey.
  await accountNavigation.getByRole('button', { name: 'Admin', exact: false }).click();
  await accountNavigation.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await storedData(page)).toEqual({ posts: [revised], session: null, users: registered.users });
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('journey-writer');
  await page.getByLabel('Password', { exact: true }).fill('disposable-demo-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await storedData(page)).toEqual({ posts: [revised], session: registered.session, users: registered.users });
  await page.getByRole('region', { name: 'Blog collection' }).getByRole('link', { name: revisedTitle, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${created.id}$`));
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

for (const role of ['user', 'admin']) {
  test(`empty-state Write opens the real form and cancelling a draft persists no post for ${role}`, async ({ page, browserErrors }) => {
    await page.goto('/');
    if (role === 'user') {
      await page.getByRole('link', { name: 'Get Started Free', exact: true }).click();
      await page.getByLabel('Display Name', { exact: true }).fill('Empty Collection Writer');
      await page.getByLabel('Username', { exact: true }).fill('empty-collection-writer');
      await page.getByLabel('Password', { exact: true }).fill('disposable-demo-password');
      await page.getByLabel('Confirm Password', { exact: true }).fill('disposable-demo-password');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
    } else {
      await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'Login', exact: true }).click();
      await page.getByLabel('Username', { exact: true }).fill('admin');
      await page.getByLabel('Password', { exact: true }).fill('admin');
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'All Blogs', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/blogs$/);
    const beforeDraft = await storedData(page);
    expect(beforeDraft.posts).toEqual([]);
    expect(beforeDraft.session.role).toBe(role);
    const main = page.getByRole('main');
    await expect(main.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
    await expect(main.getByRole('article')).toHaveCount(0);
    // Scope to main to exercise the collection CTA, not the still-covered navbar Write link.
    await main.getByRole('link', { name: 'Write', exact: true }).click();
    await expect(page).toHaveURL(/\/write$/);
    await expect(main.getByRole('heading', { name: 'Write a Post', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save Post', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(`Unsaved ${role} draft`);
    const draftBody = 'This draft must never become a persisted post.';
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill(draftBody);
    await expect(page.getByRole('status')).toHaveText(`${draftBody.length} characters`);
    expect(await storedData(page)).toEqual(beforeDraft);
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(main.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
    await expect(main.getByRole('article')).toHaveCount(0);
    expect(await storedData(page)).toEqual(beforeDraft);
    await main.getByRole('link', { name: 'Write', exact: true }).click();
    await expect(page).toHaveURL(/\/write$/);
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue('');
    await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await storedData(page)).toEqual(beforeDraft);
    expect(browserErrors).toEqual([]);
  });
}

test('post-key Storage.setItem failure on UI Save shows an error without navigation or persistence', async ({ page, browserErrors }) => {
  await seedCrossOwner(page);
  await page.goto('/blogs');
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Write', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  const beforeSave = await storedData(page);
  const rawPosts = await page.evaluate(() => localStorage.getItem('writespace_posts'));
  const title = 'Rejected storage draft';
  const content = 'Valid text whose persistence is blocked by browser storage.';
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content);
  // LLD 9.3 fault injection is confined to the browser boundary; the real posts service still runs.
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    window.__authoringSetItemDescriptor = descriptor;
    Object.defineProperty(Storage.prototype, 'setItem', {
      ...descriptor,
      value(key, value) {
        if (this === window.localStorage && key === 'writespace_posts') {
          throw new DOMException('Injected post-key storage failure', 'QuotaExceededError');
        }
        return descriptor.value.call(this, key, value);
      },
    });
  });
  try {
    await page.getByRole('button', { name: 'Save Post', exact: true }).click();
    const error = page.getByRole('alert');
    await expect(error).toHaveText('Unable to save local data. Check browser storage and try again.');
    await expect(error).toBeVisible();
    await expect(error).toBeFocused();
    await expect(page).toHaveURL(/\/write$/);
    await expect(page.getByRole('heading', { name: 'Write a Post', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title);
    await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content);
    expect(await storedData(page)).toEqual(beforeSave);
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(rawPosts);
    expect(browserErrors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      Object.defineProperty(Storage.prototype, 'setItem', window.__authoringSetItemDescriptor);
      delete window.__authoringSetItemDescriptor;
    });
  }
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('region', { name: 'Blog collection' }).getByRole('link', { name: foreignPost.title, exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(beforeSave);
  expect(browserErrors).toEqual([]);
});

for (const action of ['Save Changes', 'confirmed Delete']) {
  test(`post-key Storage.setItem failure on UI ${action} retains the original post without false success or navigation`, async ({ page, browserErrors }) => {
    await seedCrossOwner(page);
    await page.goto('/blogs');
    await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'Write', exact: true }).click();
    await expect(page).toHaveURL(/\/write$/);
    const title = `Original post before rejected ${action}`;
    const content = '  Original persisted text\n\nKeep this record and its metadata.  ';
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
    await page.getByRole('textbox', { name: 'Content', exact: true }).fill(content);
    await page.getByRole('button', { name: 'Save Post', exact: true }).click();
    await expect(page).toHaveURL(/\/blog\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    const beforeAttempt = await storedData(page);
    expect(beforeAttempt.posts).toHaveLength(2);
    expect(beforeAttempt.posts[0]).toEqual(foreignPost);
    const original = beforeAttempt.posts[1];
    expect(original).toMatchObject({ title, content, authorId: otherWriter.userId, authorName: otherWriter.displayName });
    await expect(page).toHaveURL(new RegExp(`/blog/${original.id}$`));
    const rawPosts = await page.evaluate(() => localStorage.getItem('writespace_posts'));
    const revisedTitle = `Rejected revision for ${action}`;
    const revisedContent = 'Changed draft text that must not overwrite the original.\nSecond line';
    if (action === 'Save Changes') {
      await page.getByRole('link', { name: 'Edit', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/edit/${original.id}$`));
      await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title);
      await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(content);
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill(revisedTitle);
      await page.getByRole('textbox', { name: 'Content', exact: true }).fill(revisedContent);
    }
    const currentRoute = page.url();
    // LLD 9.3: only the post-key browser write fails; product services and confirmation remain real.
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
      window.__authoringSetItemDescriptor = descriptor;
      window.__authoringPostWriteAttempts = 0;
      Object.defineProperty(Storage.prototype, 'setItem', {
        ...descriptor,
        value(key, value) {
          if (this === window.localStorage && key === 'writespace_posts') {
            window.__authoringPostWriteAttempts += 1;
            throw new DOMException('Injected post-key storage failure', 'QuotaExceededError');
          }
          return descriptor.value.call(this, key, value);
        },
      });
    });
    try {
      if (action === 'Save Changes') {
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      } else {
        const confirmDialog = page.waitForEvent('dialog');
        const confirmedClick = page.getByRole('button', { name: 'Delete', exact: true }).click();
        const confirmation = await confirmDialog;
        expect(confirmation.type()).toBe('confirm');
        expect(confirmation.message()).toBe('Delete this post? This cannot be undone.');
        await confirmation.accept();
        await confirmedClick;
      }
      const error = page.getByRole('alert');
      await expect(error).toHaveText('Unable to save local data. Check browser storage and try again.');
      await expect(error).toBeVisible();
      await expect(page).toHaveURL(currentRoute);
      expect(await page.evaluate(() => window.__authoringPostWriteAttempts)).toBe(1);
      expect(await storedData(page)).toEqual(beforeAttempt);
      expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(rawPosts);
      if (action === 'Save Changes') {
        await expect(error).toBeFocused();
        await expect(page.getByRole('heading', { level: 1, name: 'Edit Post', exact: true })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(revisedTitle);
        await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(revisedContent);
        await expect(page.getByRole('status')).toHaveText(`${revisedContent.length} characters`);
        await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeVisible();
        await expect(page.getByRole('article')).toHaveCount(0);
      } else {
        await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
        await expect(page.locator('article .whitespace-pre-wrap')).toHaveJSProperty('textContent', content);
        await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Post not found', exact: true })).toHaveCount(0);
      }
      expect(browserErrors).toEqual([]);
    } finally {
      await page.evaluate(() => {
        Object.defineProperty(Storage.prototype, 'setItem', window.__authoringSetItemDescriptor);
        delete window.__authoringSetItemDescriptor;
        delete window.__authoringPostWriteAttempts;
      });
    }
    if (action === 'Save Changes') {
      await page.getByRole('link', { name: 'Cancel', exact: true }).click();
    } else {
      await page.getByRole('link', { name: 'Back to Blogs', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/blogs$/);
    const collection = page.getByRole('region', { name: 'Blog collection' });
    await expect(collection.getByRole('link', { name: revisedTitle, exact: true })).toHaveCount(0);
    await collection.getByRole('link', { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${original.id}$`));
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/blog/${original.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator('article .whitespace-pre-wrap')).toHaveJSProperty('textContent', content);
    expect(await storedData(page)).toEqual(beforeAttempt);
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(rawPosts);
    expect(browserErrors).toEqual([]);
  });
}

test('unavailable localStorage getter renders a safe empty collection without crashing or repairing data', async ({ page, browserErrors }) => {
  await seedCrossOwner(page);
  await page.goto('/write');
  await expect(page.getByRole('heading', { name: 'Write a Post', exact: true })).toBeVisible();
  const beforeFault = await storedData(page);
  const rawPosts = await page.evaluate(() => localStorage.getItem('writespace_posts'));
  await page.evaluate(() => {
    window.__authoringStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Injected unavailable storage getter', 'SecurityError'); },
    });
  });
  try {
    await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('link', { name: 'All Blogs', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
    await expect(main.getByText('No blogs yet. Be the first to write one!', { exact: true })).toBeVisible();
    await expect(main.getByRole('article')).toHaveCount(0);
    await expect(main.getByRole('link', { name: 'Write', exact: true })).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await page.evaluate(() => {
      Object.defineProperty(window, 'localStorage', window.__authoringStorageDescriptor);
      delete window.__authoringStorageDescriptor;
    });
  }
  // Restoring the browser boundary must reveal unchanged bytes, not an empty-state repair write.
  expect(await storedData(page)).toEqual(beforeFault);
  expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe(rawPosts);
  await page.getByRole('main').getByRole('link', { name: 'Write', exact: true }).click();
  await expect(page).toHaveURL(/\/write$/);
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('region', { name: 'Blog collection' }).getByRole('link', { name: foreignPost.title, exact: true })).toBeVisible();
  expect(await storedData(page)).toEqual(beforeFault);
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
