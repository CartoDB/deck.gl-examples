/**
 * Tool definitions for OpenAI Agents SDK
 *
 * Uses @carto/agentic-deckgl converters for OpenAI Agents SDK format.
 * Combines local map tools with custom tools and remote MCP server tools.
 *
 * CONSOLIDATED PATTERN: Uses 1 frontend tool instead of 40+
 */

import { tool, type FunctionTool } from '@openai/agents';
import * as z from 'zod';
import {
  getToolsForOpenAIAgents,
  consolidatedToolNames,
  parseFrontendToolResult,
  type OpenAIAgentToolDef,
  type ToolName,
} from '@carto/agentic-deckgl';
import { getMCPTools, getMCPToolNames } from './mcp-tools.js';
import { getCustomTools, getCustomToolNames } from './custom-tools.js';

/**
 * Convert a Zod v4 schema to JSON Schema for @openai/agents.
 *
 * The SDK's built-in zodJsonSchemaCompat cannot handle z.unknown() (used in
 * z.record(z.string(), z.unknown()) for flexible layer configs), causing
 * the entire schema conversion to fail. Pre-converting with Zod v4's native
 * z.toJSONSchema() produces a correct JSON Schema that the SDK passes through.
 */
export function zodV4ToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * Create local map tools for OpenAI Agents SDK
 *
 * Uses CONSOLIDATED tool pattern (1 tool instead of 40+):
 * - set-deck-state (handles viewState, basemap, layers, widgets, effects)
 */
export function createMapTools(): FunctionTool[] {
  // Pass consolidated tool names to filter to the single tool
  const toolDefs = getToolsForOpenAIAgents(consolidatedToolNames as ToolName[]);

  return toolDefs.map((def: OpenAIAgentToolDef) =>
    tool({
      name: def.name,
      description: def.description,
      // Pre-convert Zod v4 to JSON Schema (see zodV4ToJsonSchema docs)
      parameters: zodV4ToJsonSchema(def.parameters) as any,
      strict: false,
      execute: def.execute,
    })
  );
}

/**
 * Get all tools (local map tools + custom tools + MCP tools)
 *
 * Precedence order (highest to lowest):
 * 1. Local map tools
 * 2. Custom tools
 * 3. MCP tools
 *
 * Deduplicates by name using a Map (last write wins, so local > custom > MCP).
 */
export function getAllTools(): FunctionTool[] {
  const mcpTools = getMCPTools();
  const customTools = getCustomTools();
  const localTools = createMapTools();

  // Deduplicate by name: MCP first, then custom, then local (local wins)
  const toolMap = new Map<string, FunctionTool>();

  for (const t of mcpTools) {
    toolMap.set(t.name, t);
  }
  for (const t of customTools) {
    toolMap.set(t.name, t);
  }
  for (const t of localTools) {
    toolMap.set(t.name, t);
  }

  return Array.from(toolMap.values());
}

/**
 * Get all tool names for system prompt
 * Returns consolidated tool names + custom tool names + MCP tool names
 */
export function getAllToolNames(): string[] {
  const localNames = [...consolidatedToolNames];
  const customNames = getCustomToolNames();
  const mcpNames = getMCPToolNames();

  // Deduplicate
  return [...new Set([...localNames, ...customNames, ...mcpNames])];
}

/**
 * Get local tool names only (consolidated tools)
 */
export function getToolNames(): string[] {
  return [...consolidatedToolNames];
}

// Re-export utilities
export { parseFrontendToolResult };
