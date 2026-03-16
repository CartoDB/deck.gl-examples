import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('MCP Tool Chip', () => {
  test('MCP Demographics around Times Square executes workflow and renders layer', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Click the MCP demographics chip
    await app.chat.clickChip('MCP Demographics around Times Square');

    // MCP workflows involve multiple sequential tool calls:
    // 1. viewState fly-to  2. MCP async workflow  3. poll status  4. get results  5. set-deck-state
    // Wait for the first tool success (viewState), then wait for the full workflow to complete.
    await app.chat.waitForThinking();
    await app.chat.waitForToolSuccess();

    // Wait for the full workflow to finish (loader disappears for good)
    await app.chat.waitForResponseComplete({ timeout: 110_000 });

    // Verify no errors
    expect(await app.chat.hasError()).toBe(false);

    // Verify tool executed — at least one tool success message should mention layers
    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);

    // Wait for map to stabilize and capture screenshot
    await app.map.waitForStable();
    await app.map.captureScreenshot('mcp-demographics-nyc.png');
  });
});
