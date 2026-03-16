import type { Locator, Page } from 'playwright/test';

export class DrawToolPage {
  private readonly container: Locator;
  private readonly toggleButton: Locator;
  private readonly modeButtons: Locator;
  private readonly clearButton: Locator;

  constructor(private page: Page) {
    this.container = page.locator('.draw-tool-container');
    this.toggleButton = page.locator('.draw-tool-container > .draw-tool-btn').first();
    this.modeButtons = page.locator('.draw-tool-modes .mode-btn');
    this.clearButton = page.locator('.draw-tool-container > .clear-btn');
  }

  async isVisible(): Promise<boolean> {
    return this.container.isVisible();
  }

  async isDrawingActive(): Promise<boolean> {
    const classList = (await this.toggleButton.getAttribute('class')) ?? '';
    return classList.includes('active');
  }

  async clickToggle(): Promise<void> {
    await this.toggleButton.click();
  }

  async clickClear(): Promise<void> {
    await this.clearButton.click();
  }

  async waitForVisible(): Promise<void> {
    await this.container.waitFor({ state: 'visible', timeout: 10_000 });
  }
}
