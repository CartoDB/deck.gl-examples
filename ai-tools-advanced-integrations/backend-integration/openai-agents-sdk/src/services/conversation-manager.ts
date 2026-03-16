/**
 * Conversation Manager
 *
 * Maintains per-session conversation history for context continuity
 */

import type { ConversationMessage } from '../types/messages.js';

const MAX_HISTORY_LENGTH = 20; // Max messages per session

export class ConversationManager {
  private sessions: Map<string, ConversationMessage[]> = new Map();

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): ConversationMessage[] {
    return this.sessions.get(sessionId) || [];
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(sessionId: string, message: ConversationMessage): void {
    const history = this.getHistory(sessionId);
    history.push(message);

    // Prune old messages if exceeding max length
    if (history.length > MAX_HISTORY_LENGTH) {
      // Keep the first message (usually important context) and the most recent ones
      const pruned = [history[0], ...history.slice(-MAX_HISTORY_LENGTH + 1)];
      this.sessions.set(sessionId, pruned);
    } else {
      this.sessions.set(sessionId, history);
    }
  }

  /**
   * Clear history for a session
   */
  clearHistory(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
