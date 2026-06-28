import { test, expect } from '@playwright/test';

test.describe('Steam Sale Selector E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app before each test
    await page.goto('/');
    // Wait for loading screen to disappear and games list to render
    await page.waitForSelector('.game-row');
  });

  test('should load the page and render games', async ({ page }) => {
    // Check main title
    await expect(page.locator('h1')).toHaveText('Steam Sale Selector');
    
    // Check summary cards are loaded
    const visibleCount = page.locator('.summary-strip article').first().locator('strong');
    await expect(visibleCount).not.toBeEmpty();
    
    // Check game rows exist
    const rows = page.locator('.game-row');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('should filter games by search query', async ({ page }) => {
    const searchInput = page.locator('.search-input');
    await searchInput.fill('Terraria');
    
    // Wait for search debounce
    await page.waitForTimeout(500);
    
    const rows = page.locator('.game-row');
    const firstRowTitle = rows.first().locator('.game-main a');
    await expect(firstRowTitle).toContainText('Terraria');
  });

  test('should filter games by price slider', async ({ page }) => {
    const slider = page.locator('.slider-block input[type="range"]');
    // Set slider value to 10
    await slider.evaluate((el) => {
      el.value = '10';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    
    await page.waitForTimeout(300);
    
    const rows = page.locator('.game-row');
    const count = await rows.count();
    
    for (let i = 0; i < Math.min(count, 5); i++) {
      const priceText = await rows.nth(i).locator('.price-cell strong').innerText();
      const priceVal = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(priceVal)) {
        expect(priceVal).toBeLessThanOrEqual(10.00);
      }
    }
  });

  test('should toggle shortlist and cart and update metrics', async ({ page }) => {
    const firstRow = page.locator('.game-row').first();
    
    // Check initial value is $0.00 or S$0.00
    const shortlistValueText = page.locator('.summary-strip article').nth(1).locator('strong');
    const initialText = await shortlistValueText.innerText();
    expect(initialText).toContain('0.00');
    
    // Click Shortlist button
    const shortlistBtn = firstRow.locator('.action-cell button').first();
    await expect(shortlistBtn).toHaveText('+ Shortlist');
    await shortlistBtn.click();
    await expect(shortlistBtn).toHaveText('Shortlisted');
    
    // Verify shortlist summary is updated and is no longer 0.00
    await page.waitForTimeout(200);
    const updatedText = await shortlistValueText.innerText();
    expect(updatedText).not.toContain('0.00');
    
    // Check right sidebar Shortlist PieChartCard matches
    const shortlistCardCount = page.locator('.chart-card').first().locator('h3');
    await expect(shortlistCardCount).toHaveText('1 games');
    
    // Click Cart button
    const cartBtn = firstRow.locator('.action-cell button').nth(1);
    await expect(cartBtn).toHaveText('+ Cart');
    await cartBtn.click();
    await expect(cartBtn).toHaveText('In Cart');
    
    // Click Shortlist button again to remove
    await shortlistBtn.click();
    await expect(shortlistBtn).toHaveText('+ Shortlist');
    await expect(shortlistCardCount).toHaveText('0 games');
  });

  test('should filter by review tier checkboxes', async ({ page }) => {
    // Uncheck "Mostly Positive" checkbox
    const checkbox = page.locator('.check-row', { hasText: 'Mostly Positive' }).locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    
    await page.waitForTimeout(300);
    
    // Verify no rows have "Mostly Positive" rating
    const rows = page.locator('.game-row');
    const count = await rows.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const ratingText = await rows.nth(i).locator('.rating-cell strong').innerText();
      expect(ratingText).not.toBe('Mostly Positive');
    }
  });

});
