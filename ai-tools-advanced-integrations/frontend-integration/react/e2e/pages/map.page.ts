import { expect, type Locator, type Page } from 'playwright/test';
import { getCurrentModel, getModelSlug } from '../helpers/model-config';

export class MapPage {
  private readonly container: Locator;
  private readonly canvas: Locator;

  constructor(private page: Page) {
    this.container = page.locator('.map-view-container');
    this.canvas = page.locator('.map-view-container canvas').first();
  }

  async waitForStable(options?: { timeout?: number; settleDelay?: number }): Promise<void> {
    const timeout = options?.timeout ?? 30_000;
    const settleDelay = options?.settleDelay ?? 2_000;

    // Wait for network to settle (tile requests)
    await this.page.waitForLoadState('networkidle').catch(() => {
      // networkidle may not fire if there are persistent connections
    });

    // Additional settle delay for animations and tile rendering
    await this.page.waitForTimeout(settleDelay);

    // Canvas stability check: compare two screenshots taken apart
    const startTime = Date.now();
    let stable = false;

    while (!stable && Date.now() - startTime < timeout) {
      const shot1 = await this.canvas.screenshot();
      await this.page.waitForTimeout(500);
      const shot2 = await this.canvas.screenshot();

      // Compare buffers - if identical, canvas is stable
      if (shot1.length === shot2.length && shot1.equals(shot2)) {
        stable = true;
      } else {
        await this.page.waitForTimeout(1_000);
      }
    }

    if (!stable) {
      // Accept current state even if not perfectly stable after timeout
      await this.page.waitForTimeout(1_000);
    }
  }

  async captureScreenshot(name: string): Promise<Uint8Array> {
    const modelSlug = getModelSlug(getCurrentModel());
    const fullName = `${modelSlug}-${name}`;
    return this.container.screenshot({ path: `e2e/screenshots/${fullName}` });
  }

  async expectScreenshotMatch(name: string): Promise<void> {
    const modelSlug = getModelSlug(getCurrentModel());
    const fullName = `${modelSlug}-${name}`;
    await expect(this.container).toHaveScreenshot(fullName, {
      maxDiffPixelRatio: 0.3,
    });
  }
}
