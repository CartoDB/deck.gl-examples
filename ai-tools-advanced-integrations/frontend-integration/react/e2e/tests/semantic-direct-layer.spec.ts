import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Direct Semantic Layer Chip', () => {
  test('Counties with 40%+ higher education renders layer on map', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Verify welcome chips are displayed
    const chips = await app.chat.getWelcomeChipLabels();
    expect(chips.length).toBeGreaterThanOrEqual(4);

    // Click the direct semantic chip
    await app.chat.clickChip('Counties with 40%+ higher education');

    // Wait for AI to process
    await app.chat.waitForThinking();
    await app.chat.waitForResponseComplete();

    // Verify tool executed successfully
    await app.chat.waitForToolSuccess();
    expect(await app.chat.hasError()).toBe(false);

    // Verify at least one layer was added
    const layerCount = await app.layerToggle.getLayerCount();
    expect(layerCount).toBeGreaterThanOrEqual(1);

    // Wait for map to stabilize and capture screenshot
    await app.map.waitForStable();
    await app.map.captureScreenshot('semantic-direct-counties.png');
  });
});
