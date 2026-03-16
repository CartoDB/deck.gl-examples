import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCP_MOCK_FIXTURES } from '../../../src/agent/mcp-mock-fixtures.js';

// ─── MCP_MOCK_FIXTURES structure tests ──────────────────────

describe('MCP_MOCK_FIXTURES', () => {
  it('has exactly 4 tool fixtures', () => {
    expect(Object.keys(MCP_MOCK_FIXTURES)).toHaveLength(4);
  });

  it('has all whitelisted tool names', () => {
    const expectedTools = [
      'ai_tools_filter_pois',
      'ai_tools_drivetime_demographics',
      'async_workflow_job_get_status_v1_0_0',
      'async_workflow_job_get_results_v1_0_0',
    ];
    expect(Object.keys(MCP_MOCK_FIXTURES).sort()).toEqual(expectedTools.sort());
  });

  it('each fixture has required fields', () => {
    for (const [name, fixture] of Object.entries(MCP_MOCK_FIXTURES)) {
      expect(fixture.description, `${name} missing description`).toBeTruthy();
      expect(fixture.inputSchema, `${name} missing inputSchema`).toBeDefined();
      expect(fixture.response, `${name} missing response`).toBeDefined();
    }
  });

  it('inputSchema can parse valid input for each fixture', () => {
    const sampleInputs: Record<string, Record<string, unknown>> = {
      ai_tools_filter_pois: { latitude: 40.758, longitude: -73.9855, category: 'restaurants' },
      ai_tools_drivetime_demographics: { latitude: 40.758, longitude: -73.9855 },
      async_workflow_job_get_status_v1_0_0: { job_id: 'test-job-001' },
      async_workflow_job_get_results_v1_0_0: { job_id: 'test-job-001', workflowOutputTableName: 'my_table' },
    };

    for (const [name, fixture] of Object.entries(MCP_MOCK_FIXTURES)) {
      const result = fixture.inputSchema.safeParse(sampleInputs[name]);
      expect(result.success, `${name} schema rejected valid input: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('get_results response has coordinates for fallback layer', () => {
    const fixture = MCP_MOCK_FIXTURES['async_workflow_job_get_results_v1_0_0'];
    const response = fixture.response as { data: { rows: Array<{ latitude: number; longitude: number }> } };
    expect(response.data.rows[0].latitude).toBeTypeOf('number');
    expect(response.data.rows[0].longitude).toBeTypeOf('number');
  });

  it('get_status response returns completed status', () => {
    const fixture = MCP_MOCK_FIXTURES['async_workflow_job_get_status_v1_0_0'];
    const response = fixture.response as { status: string };
    expect(response.status).toBe('completed');
  });

  it('get_results inputSchema requires workflowOutputTableName', () => {
    const fixture = MCP_MOCK_FIXTURES['async_workflow_job_get_results_v1_0_0'];
    const result = fixture.inputSchema.safeParse({ job_id: 'test' });
    expect(result.success).toBe(false);
  });
});

// ─── initializeMCPClients mock mode tests ───────────────────

describe('initializeMCPClients (mock mode)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.MCP_MOCK_MODE = 'true';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('populates mcpToolCache with 4 mock tools', { timeout: 15000 }, async () => {
    const { initializeMCPClients, getMCPToolNames } = await import('../../../src/agent/mcp-tools.js');
    await initializeMCPClients();
    const toolNames = getMCPToolNames();
    expect(toolNames).toHaveLength(4);
    expect(toolNames.sort()).toEqual([
      'ai_tools_drivetime_demographics',
      'ai_tools_filter_pois',
      'async_workflow_job_get_results_v1_0_0',
      'async_workflow_job_get_status_v1_0_0',
    ]);
  });

  it('getMCPStatus returns servers: ["mock"] in mock mode', { timeout: 15000 }, async () => {
    const { initializeMCPClients, getMCPStatus } = await import('../../../src/agent/mcp-tools.js');
    await initializeMCPClients();
    const status = getMCPStatus();
    expect(status.initialized).toBe(true);
    expect(status.servers).toEqual(['mock']);
    expect(status.toolCount).toBe(4);
  });

  it('isMCPInitialized returns true after mock initialization', { timeout: 15000 }, async () => {
    const { initializeMCPClients, isMCPInitialized } = await import('../../../src/agent/mcp-tools.js');
    await initializeMCPClients();
    expect(isMCPInitialized()).toBe(true);
  });
});
