import { test, expect } from '@playwright/test';

test.describe('PDF viewer', () => {
  test('canvas element renders for PDF media', async ({ page }) => {
    await page.goto('/');
    const pdfCard = page.locator('a.media-card').filter({ has: page.locator('.badge--pdf') }).first();
    if ((await pdfCard.count()) === 0) test.skip();

    await pdfCard.click();
    await expect(page.locator('#pdf-viewer')).toBeVisible();
    // Wait for PDF.js to initialize and render the canvas
    await expect(page.locator('#pdf-canvas')).toBeVisible({ timeout: 15000 });
  });

  test('next/prev page buttons are present', async ({ page }) => {
    await page.goto('/');
    const pdfCard = page.locator('a.media-card').filter({ has: page.locator('.badge--pdf') }).first();
    if ((await pdfCard.count()) === 0) test.skip();

    await pdfCard.click();
    await expect(page.locator('#pdf-next')).toBeVisible();
    await expect(page.locator('#pdf-prev')).toBeVisible();
  });
});
