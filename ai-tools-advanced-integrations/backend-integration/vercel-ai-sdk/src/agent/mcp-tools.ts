/**
 * MCP Tools wrapper for Vercel AI SDK v6
 *
 * Connects to MCP servers and provides tools in Vercel AI SDK format.
 */

import { tool, type Tool } from 'ai';
import {
  getMCPClient,
  getAllMCPClients,
  closeAllMCPClients,
  parseMCPServerConfigs,
} from '../services/mcp-client.js';
import { MCP_MOCK_FIXTURES } from './mcp-mock-fixtures.js';

// Track initialization state
let mcpInitialized = false;
let mcpToolCache: Record<string, Tool> = {};

/**
 * Initialize MCP clients from environment configuration
 */
export async function initializeMCPClients(): Promise<void> {
  if (mcpInitialized) {
    return;
  }

  // Mock mode: load fixture-backed tools instead of connecting to real MCP servers
  if (process.env.MCP_MOCK_MODE === 'true') {
    for (const [name, fixture] of Object.entries(MCP_MOCK_FIXTURES)) {
      mcpToolCache[name] = tool({
        description: fixture.description,
        inputSchema: fixture.inputSchema,
        execute: async (args) => {
          console.log(`[MCP:mock] ${name} called with:`, JSON.stringify(args).substring(0, 200));
          if (fixture.validateInput) {
            fixture.validateInput(args as Record<string, unknown>);
          }
          return fixture.response;
        },
      });
    }
    console.log(`[MCP:mock] ${Object.keys(MCP_MOCK_FIXTURES).length} mock tools loaded`);
    mcpInitialized = true;
    return;
  }

  const configs = parseMCPServerConfigs();

  if (configs.length === 0) {
    mcpInitialized = true;
    return;
  }

  for (const config of configs) {
    try {
      const client = await getMCPClient(config);
      const toolDefs = client.getToolDefinitions(config.whitelist);

      // Convert to Vercel AI SDK format
      for (const def of toolDefs) {
        mcpToolCache[def.name] = tool({
          description: def.description,
          inputSchema: def.inputSchema,
          execute: def.execute,
        });
      }

      console.log(`[MCP:${config.name}] ${toolDefs.length} tools loaded`);
    } catch (error) {
      console.error(`[MCP:${config.name}] failed to initialize -`, (error as Error).message);
    }
  }

  mcpInitialized = true;
}

/**
 * Get all MCP tools in Vercel AI SDK format
 */
export function getMCPTools(): Record<string, Tool> {
  return { ...mcpToolCache };
}

/**
 * Get MCP tool names
 */
export function getMCPToolNames(): string[] {
  return Object.keys(mcpToolCache);
}

/**
 * Check if MCP is initialized
 */
export function isMCPInitialized(): boolean {
  return mcpInitialized;
}

/**
 * Close all MCP connections
 */
export async function closeMCPConnections(): Promise<void> {
  await closeAllMCPClients();
  mcpToolCache = {};
  mcpInitialized = false;
}

/**
 * Get MCP status info for health checks
 */
export function getMCPStatus(): {
  initialized: boolean;
  servers: string[];
  toolCount: number;
} {
  if (process.env.MCP_MOCK_MODE === 'true') {
    return {
      initialized: mcpInitialized,
      servers: ['mock'],
      toolCount: Object.keys(mcpToolCache).length,
    };
  }

  const clients = getAllMCPClients();
  return {
    initialized: mcpInitialized,
    servers: Array.from(clients.keys()),
    toolCount: Object.keys(mcpToolCache).length,
  };
}
