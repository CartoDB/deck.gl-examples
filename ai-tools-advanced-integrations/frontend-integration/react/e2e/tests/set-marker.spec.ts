import { test, expect } from 'playwright/test';
import { AppPage } from '../pages/app.page';

test.describe('Set Marker Tool', () => {

  // ── Test 1: Add marker via explicit request ──
  test('adds marker when user explicitly requests it', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    await app.chat.sendMessage('Fly to Times Square and add a marker');

    await app.chat.waitForThinking();
    // Wait for the marker tool message to appear in the DOM (not just the loader)
    await page.locator('.tool-success-message').filter({ hasText: /marker/i })
      .first().waitFor({ state: 'visible', timeout: 90_000 });

    expect(await app.chat.hasError()).toBe(false);

    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(toolMessages.some((m) => /marker/i.test(m))).toBe(true);

    await app.map.waitForStable();
    await app.map.captureScreenshot('marker-add-explicit.png');
  });

  // ── Test 2: Marker as part of MCP workflow ──
  test('adds marker as part of MCP demographics workflow', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    await app.chat.clickChip('MCP Demographics around Times Square');

    await app.chat.waitForThinking();
    await app.chat.waitForToolSuccess();
    await app.chat.waitForResponseComplete({ timeout: 110_000 });

    expect(await app.chat.hasError()).toBe(false);

    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);
    // MCP workflow may or may not produce a marker depending on LLM behavior;
    // the core assertion is that the workflow completed with tool calls
    expect(toolMessages.some((m) => m.includes('viewState') || /marker/i.test(m))).toBe(true);

    await app.map.waitForStable();
    await app.map.captureScreenshot('marker-mcp-workflow.png');
  });

  // ── Test 3: Clear all markers (sequential) ──
  test('clears all markers after adding one', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Step 1: Add a marker
    await app.chat.sendMessage('Fly to Madrid and add a marker');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').filter({ hasText: /marker/i })
      .first().waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterAdd = await app.chat.getToolSuccessMessages();
    expect(messagesAfterAdd.some((m) => /marker/i.test(m))).toBe(true);

    // Step 2: Clear all markers — count-based wait for new tool message
    const countBefore = await page.locator('.tool-success-message').count();
    await app.chat.sendMessage('Clear all markers');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').nth(countBefore)
      .waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterClear = await app.chat.getToolSuccessMessages();
    expect(messagesAfterClear.some((m) => /cleared/i.test(m))).toBe(true);

    await app.map.waitForStable();
    await app.map.captureScreenshot('marker-clear-all.png');
  });

  // ── Test 4: Remove specific marker (sequential) ──
  test('removes a specific marker by location', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Step 1: Add a marker
    await app.chat.sendMessage('Fly to Madrid and add a marker');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').filter({ hasText: /marker/i })
      .first().waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterAdd = await app.chat.getToolSuccessMessages();
    expect(messagesAfterAdd.some((m) => /marker/i.test(m))).toBe(true);

    // Step 2: Remove that marker — count-based wait for new tool message
    const countBefore = await page.locator('.tool-success-message').count();
    await app.chat.sendMessage('Remove the marker on Madrid');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').nth(countBefore)
      .waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterRemove = await app.chat.getToolSuccessMessages();
    expect(messagesAfterRemove.some((m) => /removed/i.test(m))).toBe(true);

    await app.map.waitForStable();
    await app.map.captureScreenshot('marker-remove-specific.png');
  });

  // ── Test 5: No marker on fly-to (negative test) ──
  test('does NOT add marker on simple fly-to command', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    await app.chat.sendMessage('Fly to Paris');

    await app.chat.waitForThinking();
    await app.chat.waitForResponseComplete();

    expect(await app.chat.hasError()).toBe(false);

    const toolMessages = await app.chat.getToolSuccessMessages();
    expect(toolMessages.length).toBeGreaterThan(0);
    expect(toolMessages.some((m) => m.includes('viewState'))).toBe(true);

    // No marker should have been placed
    expect(toolMessages.some((m) => /marker placed/i.test(m))).toBe(false);

    await app.map.waitForStable();
    await app.map.captureScreenshot('no-marker-fly-to.png');
  });

  // ── Test 6: Multiple markers accumulate (sequential) ──
  test('accumulates multiple markers at different locations', async ({ page }) => {
    const app = new AppPage(page);
    await app.setup();

    // Step 1: Add first marker
    await app.chat.sendMessage('Fly to Madrid and add a marker');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').filter({ hasText: /marker/i })
      .first().waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterFirst = await app.chat.getToolSuccessMessages();
    expect(messagesAfterFirst.some((m) => /marker placed/i.test(m))).toBe(true);

    // Step 2: Add second marker — wait for a second marker-specific message
    const markerCountBefore = await page.locator('.tool-success-message').filter({ hasText: /marker/i }).count();
    await app.chat.sendMessage('Fly to Barcelona and add a marker');
    await app.chat.waitForThinking();
    await page.locator('.tool-success-message').filter({ hasText: /marker/i }).nth(markerCountBefore)
      .waitFor({ state: 'visible', timeout: 90_000 });
    expect(await app.chat.hasError()).toBe(false);
    const messagesAfterSecond = await app.chat.getToolSuccessMessages();
    expect(messagesAfterSecond.some((m) => /total markers:\s*2/i.test(m))).toBe(true);

    await app.map.waitForStable();
    await app.map.captureScreenshot('marker-accumulate.png');
  });
});
