import { describe, it, expect, vi } from 'vitest';

// Mock MCP tools
vi.mock('../../../src/agent/mcp-tools.js', () => ({
  getMCPTools: vi.fn(() => ({})),
  getMCPToolNames: vi.fn(() => []),
}));

// Mock custom tools
vi.mock('../../../src/agent/custom-tools.js', () => ({
  getCustomTools: vi.fn(() => ({})),
  getCustomToolNames: vi.fn(() => []),
}));

import { createMapTools, getAllTools, getAllToolNames, getToolNames } from '../../../src/agent/tools.js';
import { getMCPTools } from '../../../src/agent/mcp-tools.js';

describe('createMapTools', () => {
  it('returns an object of tools keyed by name', () => {
    const tools = createMapTools();
    expect(typeof tools).toBe('object');
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });

  it('includes set-deck-state tool', () => {
    const tools = createMapTools();
    expect(tools['set-deck-state']).toBeDefined();
  });

  it('each tool is a valid Tool object', () => {
    const tools = createMapTools();
    for (const t of Object.values(tools)) {
      expect(t).toBeDefined();
    }
  });
});

describe('getAllTools', () => {
  it('returns an object', () => {
    const tools = getAllTools();
    expect(typeof tools).toBe('object');
  });

  it('includes local map tools when no MCP/custom tools', () => {
    const tools = getAllTools();
    expect(tools['set-deck-state']).toBeDefined();
  });

  it('deduplicates tools by name with local taking precedence', () => {
    const mockMCPTools = {
      'set-deck-state': {
        type: 'function' as const,
        description: 'MCP version',
        parameters: {},
        execute: vi.fn(),
      },
    };

    vi.mocked(getMCPTools).mockReturnValueOnce(mockMCPTools as any);

    const tools = getAllTools();
    // Local tool should win (not the MCP description)
    expect((tools['set-deck-state'] as any).description).not.toBe('MCP version');
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
