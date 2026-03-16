import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Custom Tool - LDS Geocode', () => {
  test('Fly to New York navigates map via LDS geocode', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Send a free-text message
    await app.chat.sendMessage('Fly to New York');

    // Wait for AI response
    await app.chat.waitForThinking();
    await app.chat.waitForResponseComplete();

    // Verify no errors
    expect(await app.chat.hasError()).toBe(false);

    // Verify tool success message confirms viewState was updated
    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(toolMessages.some((m) => m.includes('viewState'))).toBe(true);

    // Wait for map to stabilize after fly-to animation
    await app.map.waitForStable();

    // Visual regression snapshot
    await app.map.captureScreenshot('fly-to-new-york.png');
  });
});
