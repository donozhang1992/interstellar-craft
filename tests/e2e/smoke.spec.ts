import { expect, test } from '@playwright/test';

test('app boots and reports READY', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.READY === true, undefined, { timeout: 3000 });
  await expect(page).toHaveTitle(/INTERSTELLAR CRAFT/);
});
