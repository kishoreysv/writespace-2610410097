/** @module browser-fixtures Capture browser errors before any test navigation; no product mocks. */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  /** Install automatic listeners before navigation and assert after every journey.
   * @param {object} fixtures Playwright page fixture.
   * @param {Function} use Fixture lifetime callback.
   */
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    /** Record browser console errors only. */
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(message.text());
    };
    /** Record uncaught page exceptions. */
    const onPageError = (error) => errors.push(error.message);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    try {
      await use(errors);
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      expect(errors, 'No browser console or uncaught page errors').toEqual([]);
    }
  }, { auto: true }],
});

export { expect };
