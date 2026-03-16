import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Mask Layer - Draw Mode', () => {
  test('Enable drawing mode via chat and verify DrawTool UI appears', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Send message to enable drawing mode
    await app.chat.sendMessage('Enable drawing mode so I can draw a mask on the map');

    // Wait for the AI to process and execute set-mask-layer { action: "enable-draw" }
    await app.chat.waitForThinking();
    await app.chat.waitForResponseComplete({ timeout: 90_000 });

    // Verify no errors
    expect(await app.chat.hasError()).toBe(false);

    // Verify tool executed successfully
    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);

    // Verify DrawTool UI is visible and in active/drawing state
    await app.drawTool.waitForVisible();
    expect(await app.drawTool.isDrawingActive()).toBe(true);

    // Capture screenshot
    await app.map.waitForStable();
    await app.map.captureScreenshot('mask-layer-draw-mode.png');
  });

  test('Clear mask via chat', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // First enable drawing
    await app.chat.sendMessage('Enable drawing mode');
    await app.chat.waitForResponseComplete({ timeout: 90_000 });

    // Then clear
    const countBefore = await page.locator('.tool-success-message').count();
    await app.chat.sendMessage('Clear the mask');
    await app.chat.waitForThinking();
    await page
      .locator('.tool-success-message')
      .nth(countBefore)
      .waitFor({ state: 'visible', timeout: 90_000 });

    // Verify no errors
    expect(await app.chat.hasError()).toBe(false);

    // Verify tool success
    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);
  });
});
