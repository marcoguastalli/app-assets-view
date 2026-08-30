import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('loads and shows the site title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Assets View/i);
    await expect(page.locator('nav')).toBeVisible();
  });

  test('shows search input', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#search-input');
    await expect(input).toBeVisible();
  });

  test('type filter buttons are present', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('#type-filters button');
    await expect(buttons).toHaveCount(4);
  });

  test('search filters results', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#search-input');
    await input.fill('zzznomatch');
    await expect(page.locator('#search-empty')).toBeVisible();
  });

  test('clicking All type button resets filter', async ({ page }) => {
    await page.goto('/');
    await page.locator('#type-filters button[data-type="image"]').click();
    await page.locator('#type-filters button[data-type="all"]').click();
    await expect(page.locator('#main-content')).toBeVisible();
  });
});
