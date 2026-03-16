import type { Page } from 'playwright/test';
import { ChatPage } from './chat.page';
import { MapPage } from './map.page';
import { LayerTogglePage } from './layer-toggle.page';
import { DrawToolPage } from './draw-tool.page';

export class AppPage {
  readonly chat: ChatPage;
  readonly map: MapPage;
  readonly layerToggle: LayerTogglePage;
  readonly drawTool: DrawToolPage;

  constructor(private page: Page) {
    this.chat = new ChatPage(page);
    this.map = new MapPage(page);
    this.layerToggle = new LayerTogglePage(page);
    this.drawTool = new DrawToolPage(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.locator('.app-container').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForConnection(): Promise<void> {
    await this.page.locator('.connection-status.connected').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }

  async openChat(): Promise<void> {
    // Click the FAB button to open the chat sidebar
    await this.page.locator('.fab-button').click();
    // Wait for chat content to be visible
    await this.page.locator('.chat-content').waitFor({ state: 'visible', timeout: 5_000 });
  }

  async setup(): Promise<void> {
    await this.goto();
    await this.openChat();
    await this.waitForConnection();
  }
}
