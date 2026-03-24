/**
 * MCP Tools wrapper for OpenAI Agents SDK
 *
 * Connects to MCP servers and provides tools as FunctionTool[] for the Agents SDK.
 */

import { tool, type FunctionTool } from '@openai/agents';
import { z } from 'zod';
import {
  getMCPClient,
  getAllMCPClients,
  closeAllMCPClients,
  parseMCPServerConfigs,
} from '../services/mcp-client.js';
import { MCP_MOCK_FIXTURES } from './mcp-mock-fixtures.js';

// Track initialization state
let mcpInitialized = false;
let mcpToolCache: FunctionTool[] = [];

/**
 * Normalize an MCP tool's JSON Schema for OpenAI API compatibility.
 *
 * OpenAI's function calling requires all properties to be listed in the
 * `required` array. MCP tools often declare properties as optional, which
 * causes the API to reject the schema. This function marks every property
 * as required so the schema passes validation.
 */
function normalizeMCPSchema(
  jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
  const properties = (jsonSchema.properties as Record<string, unknown>) || {};
  return {
    ...jsonSchema,
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties:
      jsonSchema.additionalProperties !== undefined
        ? jsonSchema.additionalProperties
        : true,
  };
}

/**
 * Initialize MCP clients from environment configuration
 */
export async function initializeMCPClients(): Promise<void> {
  if (mcpInitialized) {
    return;
  }

  // Mock mode: create FunctionTool objects from fixtures instead of real MCP connections
  if (process.env.MCP_MOCK_MODE === 'true') {
    console.log('[MCP:mock] Mock mode enabled — loading fixture-backed tools');
    for (const [name, fixture] of Object.entries(MCP_MOCK_FIXTURES)) {
      const jsonSchema = z.toJSONSchema(fixture.inputSchema) as Record<string, unknown>;
      const normalized = normalizeMCPSchema(jsonSchema);

      mcpToolCache.push(
        tool({
          name,
          description: fixture.description,
          parameters: normalized as any,
          strict: false,
          execute: async (args) => {
            fixture.validateInput?.(args as Record<string, unknown>);
            console.log(`[MCP:mock] ${name} called with`, JSON.stringify(args));
            return JSON.stringify(fixture.response);
          },
        })
      );
    }
    console.log(`[MCP:mock] ${mcpToolCache.length} mock tools loaded`);
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

      // Convert to OpenAI Agents SDK FunctionTool format
      for (const def of toolDefs) {
        // Convert Zod v4 → JSON Schema, then normalize for OpenAI API
        const jsonSchema = z.toJSONSchema(def.inputSchema) as Record<string, unknown>;
        const normalized = normalizeMCPSchema(jsonSchema);

        mcpToolCache.push(
          tool({
            name: def.name,
            description: def.description,
            parameters: normalized as any,
            strict: false,
            execute: async (args) => {
              const result = await def.execute(args as Record<string, unknown>);
              return JSON.stringify(result);
            },
          })
        );
      }

      console.log(`[MCP:${config.name}] ${toolDefs.length} tools loaded`);
    } catch (error) {
      console.error(`[MCP:${config.name}] failed to initialize -`, (error as Error).message);
    }
  }

  mcpInitialized = true;
}

/**
 * Get all MCP tools as FunctionTool array
 */
export function getMCPTools(): FunctionTool[] {
  return [...mcpToolCache];
}

/**
 * Get MCP tool names
 */
export function getMCPToolNames(): string[] {
  return mcpToolCache.map((t) => t.name);
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
  mcpToolCache = [];
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
      toolCount: mcpToolCache.length,
    };
  }
  const clients = getAllMCPClients();
  return {
    initialized: mcpInitialized,
    servers: Array.from(clients.keys()),
    toolCount: mcpToolCache.length,
  };
}
