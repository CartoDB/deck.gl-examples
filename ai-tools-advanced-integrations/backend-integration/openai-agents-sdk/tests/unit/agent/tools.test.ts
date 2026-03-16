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

  it('returns tools with type "function"', () => {
    const tools = createMapTools();
    for (const t of tools) {
      expect(t.type).toBe('function');
    }
  });

  it('returns tools with name, description, and parameters', () => {
    const tools = createMapTools();
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(t.parameters).toBeDefined();
    }
  });

  it('includes set-deck-state tool (name sanitized to set_deck_state by SDK)', () => {
    const tools = createMapTools();
    const names = tools.map((t) => t.name);
    // @openai/agents tool() converts hyphens to underscores in names
    expect(names).toContain('set_deck_state');
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
    // @openai/agents tool() converts hyphens to underscores
    expect(names).toContain('set_deck_state');
  });

  it('deduplicates tools by name with local taking precedence', () => {
    // Create a mock MCP tool with the same sanitized name as a local tool
    const mockMCPTool = {
      type: 'function' as const,
      name: 'set_deck_state',
      description: 'MCP version',
      parameters: {},
      strict: true,
      invoke: vi.fn(),
      needsApproval: false as any,
      isEnabled: true as any,
    };

    vi.mocked(getMCPTools).mockReturnValueOnce([mockMCPTool as any]);

    const tools = getAllTools();
    const deckStateTools = tools.filter((t) => t.name === 'set_deck_state');
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
