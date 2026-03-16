import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Mask Layer - MCP Geometry as Mask', () => {
  test('MCP workflow completes then user requests mask filter', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Step 1: Trigger MCP workflow via chip
    await app.chat.clickChip('MCP Demographics around Times Square');

    // Wait for full MCP workflow: geocode → flyTo → marker → MCP async → poll → results → layer
    await app.chat.waitForThinking();
    await app.chat.waitForToolSuccess();
    await app.chat.waitForResponseComplete({ timeout: 110_000 });

    // Verify MCP workflow completed without errors
    expect(await app.chat.hasError()).toBe(false);

    // Step 2: Ask to filter/mask by the MCP result area
    const countBefore = await page.locator('.tool-success-message').count();
    await app.chat.sendMessage(
      'Filter the map to only show data inside that drivetime area'
    );

    // Wait for set-mask-layer tool execution
    await app.chat.waitForThinking();
    await page
      .locator('.tool-success-message')
      .nth(countBefore)
      .waitFor({ state: 'visible', timeout: 90_000 });
    await app.chat.waitForResponseComplete({ timeout: 90_000 });

    // Verify mask was applied
    expect(await app.chat.hasError()).toBe(false);
    const toolMessages = await app.chat.getToolSuccessMessages();
    // Should have tool success messages from both MCP workflow and mask application
    expect(toolMessages.length).toBeGreaterThan(1);

    // Capture screenshot showing masked map
    await app.map.waitForStable();
    await app.map.captureScreenshot('mask-layer-mcp-geometry.png');
  });
});
