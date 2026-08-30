import { test, expect } from '@playwright/test';

test.describe('Video player', () => {
  test('video element is present on video media page', async ({ page }) => {
    await page.goto('/');
    // Look for a video-type card
    const videoCard = page.locator('a.media-card').filter({ has: page.locator('.badge--video') }).first();
    if ((await videoCard.count()) === 0) test.skip();

    await videoCard.click();
    await expect(page.locator('video')).toBeVisible();
  });

  test('video player has controls', async ({ page }) => {
    await page.goto('/');
    const videoCard = page.locator('a.media-card').filter({ has: page.locator('.badge--video') }).first();
    if ((await videoCard.count()) === 0) test.skip();

    await videoCard.click();
    const video = page.locator('video');
    await expect(video).toHaveAttribute('controls', '');
  });
});
