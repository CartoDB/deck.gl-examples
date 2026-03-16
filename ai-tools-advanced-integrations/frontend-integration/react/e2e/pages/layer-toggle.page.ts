import type { Locator, Page } from 'playwright/test';

export class LayerTogglePage {
  private readonly container: Locator;
  private readonly layerItems: Locator;

  constructor(private page: Page) {
    this.container = page.locator('.layer-toggle');
    this.layerItems = page.locator('.layer-item');
  }

  async getLayerCount(): Promise<number> {
    // Wait briefly for layers to render
    await this.page.waitForTimeout(500);
    return this.layerItems.count();
  }

  async getLayerNames(): Promise<string[]> {
    const count = await this.layerItems.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const nameEl = this.layerItems.nth(i).locator('.layer-name');
      const text = await nameEl.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  async isLayerVisible(layerName: string): Promise<boolean> {
    const item = this.layerItems.filter({ hasText: layerName });
    const visibilityBtn = item.locator('.visibility-btn');
    const classList = (await visibilityBtn.getAttribute('class')) ?? '';
    return !classList.includes('hidden');
  }

  async toggleLayer(layerName: string): Promise<void> {
    const item = this.layerItems.filter({ hasText: layerName });
    await item.locator('.visibility-btn').click();
  }
}
