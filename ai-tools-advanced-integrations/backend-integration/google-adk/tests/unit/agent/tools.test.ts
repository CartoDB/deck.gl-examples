import { describe, it, expect, vi } from 'vitest';

// Mock MCP tools
vi.mock('../../../src/agent/mcp-tools.js', () => ({
  getMCPTools: vi.fn(() => []),
  getMCPToolNames: vi.fn(() => []),
}));

// Mock custom tools
vi.mock('../../../src/agent/custom-tools.js', () => ({
  getCustomTools: vi.fn(() => []),
  getCustomToolNames: vi.fn(() => []),
}));

import { createMapTools, getAllTools, getAllToolNames, getToolNames } from '../../../src/agent/tools.js';
import { getMCPTools } from '../../../src/agent/mcp-tools.js';

describe('createMapTools', () => {
  it('returns an array of FunctionTool objects', () => {
    const tools = createMapTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('returns tools with name and description', () => {
    const tools = createMapTools();
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
    }
  });

  it('includes set-deck-state tool', () => {
    const tools = createMapTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('set-deck-state');
  });
});

describe('getAllTools', () => {
  it('returns an array', () => {
    const tools = getAllTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  it('includes local map tools when no MCP/custom tools', () => {
    const tools = getAllTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('set-deck-state');
  });

  it('deduplicates tools by name with local taking precedence', () => {
    const mockMCPTool = {
      name: 'set-deck-state',
      description: 'MCP version',
    };

    vi.mocked(getMCPTools).mockReturnValueOnce([mockMCPTool as any]);

    const tools = getAllTools();
    const deckStateTools = tools.filter((t) => t.name === 'set-deck-state');
    expect(deckStateTools).toHaveLength(1);
    // Local tool should win (not the MCP description)
    expect(deckStateTools[0].description).not.toBe('MCP version');
  });
});

describe('getAllToolNames', () => {
  it('includes consolidated tool names', () => {
    const names = getAllToolNames();
    expect(names).toContain('set-deck-state');
  });

  it('returns unique names', () => {
    const names = getAllToolNames();
    const unique = [...new Set(names)];
    expect(names).toEqual(unique);
  });
});

describe('getToolNames', () => {
  it('returns local tool names only', () => {
    const names = getToolNames();
    expect(names).toContain('set-deck-state');
  });
});
