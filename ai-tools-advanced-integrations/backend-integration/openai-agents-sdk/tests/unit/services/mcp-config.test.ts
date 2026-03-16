import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseMCPServerConfigs } from '../../../src/services/mcp-client.js';

describe('parseMCPServerConfigs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clone env so mutations don't leak
    process.env = { ...originalEnv };
    // Clear MCP-related vars
    delete process.env.CARTO_MCP_URL;
    delete process.env.CARTO_MCP_API_KEY;
    delete process.env.MCP_WHITELIST_CARTO;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns empty array when CARTO_MCP_URL is not set', () => {
    const configs = parseMCPServerConfigs();
    expect(configs).toEqual([]);
  });

  it('returns a config with name "carto" when CARTO_MCP_URL is set', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    const configs = parseMCPServerConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('carto');
    expect(configs[0].url).toBe('https://mcp.carto.com');
  });

  it('includes apiKey when CARTO_MCP_API_KEY is set', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    process.env.CARTO_MCP_API_KEY = 'my-secret-key';
    const configs = parseMCPServerConfigs();
    expect(configs[0].apiKey).toBe('my-secret-key');
  });

  it('apiKey is undefined when CARTO_MCP_API_KEY is not set', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    const configs = parseMCPServerConfigs();
    expect(configs[0].apiKey).toBeUndefined();
  });

  it('parses whitelist from comma-separated MCP_WHITELIST_CARTO', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    process.env.MCP_WHITELIST_CARTO = 'run_query,list_tables,get_schema';
    const configs = parseMCPServerConfigs();
    expect(configs[0].whitelist).toEqual(['run_query', 'list_tables', 'get_schema']);
  });

  it('trims whitespace from whitelist entries', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    process.env.MCP_WHITELIST_CARTO = ' run_query , list_tables , get_schema ';
    const configs = parseMCPServerConfigs();
    expect(configs[0].whitelist).toEqual(['run_query', 'list_tables', 'get_schema']);
  });

  it('whitelist is undefined when MCP_WHITELIST_CARTO is not set', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    const configs = parseMCPServerConfigs();
    expect(configs[0].whitelist).toBeUndefined();
  });

  it('handles single-item whitelist', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    process.env.MCP_WHITELIST_CARTO = 'run_query';
    const configs = parseMCPServerConfigs();
    expect(configs[0].whitelist).toEqual(['run_query']);
  });

  it('returns full config object with all fields', () => {
    process.env.CARTO_MCP_URL = 'https://mcp.carto.com';
    process.env.CARTO_MCP_API_KEY = 'key123';
    process.env.MCP_WHITELIST_CARTO = 'tool_a,tool_b';
    const configs = parseMCPServerConfigs();
    expect(configs[0]).toEqual({
      name: 'carto',
      url: 'https://mcp.carto.com',
      apiKey: 'key123',
      whitelist: ['tool_a', 'tool_b'],
    });
  });
});
