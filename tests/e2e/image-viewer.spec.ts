import { test, expect } from '@playwright/test';

/**
 * Image viewer E2E tests.
 * These tests require a running server with at least one image file in the media directory.
 * The BASE_URL env variable should point to the running server.
 */
test.describe('Image viewer', () => {
  test('navigates back to home', async ({ page }) => {
    await page.goto('/');
    // Select an image card specifically — the first card can be any type
    const firstImageLink = page
      .locator('a.media-card')
      .filter({ has: page.locator('.badge--image') })
      .first();
    if ((await firstImageLink.count()) === 0) test.skip();

    await firstImageLink.click();
    await expect(page).toHaveURL(/\/media\//);

    const backLink = page.locator('a', { hasText: 'Back' });
    await backLink.click();
    await expect(page).toHaveURL('/');
  });

  test('keyboard Escape navigates to home', async ({ page }) => {
    await page.goto('/');
    const firstImageLink = page
      .locator('a.media-card')
      .filter({ has: page.locator('.badge--image') })
      .first();
    if ((await firstImageLink.count()) === 0) test.skip();

    await firstImageLink.click();
    await expect(page).toHaveURL(/\/media\//);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/');
  });
});
