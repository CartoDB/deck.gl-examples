import { describe, it, expect } from 'vitest';
import { ConversationManager } from '../../../src/services/conversation-manager.js';

describe('ConversationManager', () => {
  it('returns empty array for unknown session', () => {
    const manager = new ConversationManager();
    expect(manager.getHistory('unknown')).toEqual([]);
  });

  it('adds and retrieves messages', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'hello' });
    manager.addMessage('s1', { role: 'assistant', content: 'hi' });

    const history = manager.getHistory('s1');
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe('hello');
    expect(history[1].content).toBe('hi');
  });

  it('prunes history keeping first message and most recent', () => {
    const manager = new ConversationManager();
    for (let i = 0; i < 25; i++) {
      manager.addMessage('s1', { role: 'user', content: `msg-${i}` });
    }

    const history = manager.getHistory('s1');
    expect(history).toHaveLength(20);
    expect(history[0].content).toBe('msg-0');
    expect(history[history.length - 1].content).toBe('msg-24');
  });

  it('clears session history', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'hello' });
    manager.clearHistory('s1');
    expect(manager.getHistory('s1')).toEqual([]);
  });

  it('tracks session IDs and count', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'a' });
    manager.addMessage('s2', { role: 'user', content: 'b' });

    expect(manager.getSessionIds()).toEqual(['s1', 's2']);
    expect(manager.getActiveSessionCount()).toBe(2);
  });

  it('isolates multiple independent sessions', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'hello from s1' });
    manager.addMessage('s2', { role: 'user', content: 'hello from s2' });

    expect(manager.getHistory('s1')).toHaveLength(1);
    expect(manager.getHistory('s1')[0].content).toBe('hello from s1');
    expect(manager.getHistory('s2')).toHaveLength(1);
    expect(manager.getHistory('s2')[0].content).toBe('hello from s2');
  });

  it('preserves first message through heavy pruning', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'system-context' });
    for (let i = 1; i <= 30; i++) {
      manager.addMessage('s1', { role: 'user', content: `msg-${i}` });
    }

    const history = manager.getHistory('s1');
    expect(history[0].content).toBe('system-context');
    expect(history).toHaveLength(20);
    expect(history[history.length - 1].content).toBe('msg-30');
  });

  it('clearHistory is idempotent on unknown session', () => {
    const manager = new ConversationManager();
    // Should not throw
    manager.clearHistory('nonexistent');
    expect(manager.getHistory('nonexistent')).toEqual([]);
  });

  it('session works after clear and re-add', () => {
    const manager = new ConversationManager();
    manager.addMessage('s1', { role: 'user', content: 'first' });
    manager.clearHistory('s1');
    expect(manager.getHistory('s1')).toEqual([]);

    manager.addMessage('s1', { role: 'user', content: 'second' });
    expect(manager.getHistory('s1')).toHaveLength(1);
    expect(manager.getHistory('s1')[0].content).toBe('second');
  });
});
