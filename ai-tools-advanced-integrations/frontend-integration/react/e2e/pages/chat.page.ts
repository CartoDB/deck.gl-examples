import type { Locator, Page } from 'playwright/test';

export class ChatPage {
  private readonly input: Locator;
  private readonly sendButton: Locator;
  private readonly messagesContainer: Locator;
  private readonly loader: Locator;
  private readonly loaderText: Locator;
  private readonly welcomeChips: Locator;
  private readonly streamingIndicator: Locator;
  private readonly toolSuccessMessages: Locator;
  private readonly errorMessages: Locator;

  constructor(private page: Page) {
    this.input = page.locator('.chat-input');
    this.sendButton = page.locator('.send-button');
    this.messagesContainer = page.locator('.chat-messages');
    this.loader = page.locator('.tool-loader');
    this.loaderText = page.locator('.tool-loader-text');
    this.welcomeChips = page.locator('.welcome-chip');
    this.streamingIndicator = page.locator('.streaming-indicator');
    this.toolSuccessMessages = page.locator('.tool-success-message');
    this.errorMessages = page.locator('.message.error');
  }

  async sendMessage(text: string): Promise<void> {
    await this.input.fill(text);
    await this.sendButton.click();
  }

  async clickChip(label: string): Promise<void> {
    await this.welcomeChips.filter({ hasText: label }).click();
  }

  async waitForThinking(): Promise<void> {
    await this.loader.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      // Loader may never appear if the model responds quickly
    });
  }

  async waitForResponseComplete(options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout ?? 90_000;
    // Wait for loader to disappear (response fully processed)
    await this.loader.waitFor({ state: 'hidden', timeout });
    // Wait for streaming to finish
    await this.streamingIndicator.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
      // Streaming indicator may never appear if response is fast
    });
  }

  async waitForToolSuccess(): Promise<void> {
    await this.toolSuccessMessages.first().waitFor({ state: 'visible', timeout: 90_000 });
  }

  async getMessages(): Promise<Array<{ type: string; content: string }>> {
    const messages = this.messagesContainer.locator('.message');
    const count = await messages.count();
    const result: Array<{ type: string; content: string }> = [];

    for (let i = 0; i < count; i++) {
      const msg = messages.nth(i);
      const classList = await msg.getAttribute('class') ?? '';
      const content = await msg.textContent() ?? '';

      let type = 'unknown';
      if (classList.includes('user')) type = 'user';
      else if (classList.includes('assistant')) type = 'assistant';
      else if (classList.includes('tool')) type = 'tool';
      else if (classList.includes('error')) type = 'error';

      result.push({ type, content: content.trim() });
    }

    return result;
  }

  async getToolSuccessMessages(): Promise<string[]> {
    const count = await this.toolSuccessMessages.count();
    const messages: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await this.toolSuccessMessages.nth(i).textContent();
      if (text) messages.push(text.trim());
    }
    return messages;
  }

  async getWelcomeChipLabels(): Promise<string[]> {
    const count = await this.welcomeChips.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await this.welcomeChips.nth(i).textContent();
      if (text) labels.push(text.trim());
    }
    return labels;
  }

  async hasError(): Promise<boolean> {
    return (await this.errorMessages.count()) > 0;
  }

  async isLoaderVisible(): Promise<boolean> {
    return this.loader.isVisible();
  }

  async getLoaderText(): Promise<string> {
    if (await this.loader.isVisible()) {
      return (await this.loaderText.textContent()) ?? '';
    }
    return '';
  }
}
