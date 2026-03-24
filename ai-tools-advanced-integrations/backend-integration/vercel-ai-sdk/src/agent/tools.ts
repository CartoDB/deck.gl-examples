/**
 * Tool definitions for Vercel AI SDK v6
 *
 * Uses @carto/agentic-deckgl converters for Vercel AI SDK format
 * Combines local map tools with remote MCP server tools
 *
 * CONSOLIDATED PATTERN: Uses 3 tools instead of 40+
 */

import { tool, type Tool } from 'ai';
import {
  getToolsForVercelAI,
  consolidatedToolNames,
  isFrontendToolResult,
  type VercelAIToolDef,
  type ToolName,
} from '@carto/agentic-deckgl';
import { getMCPTools, getMCPToolNames } from './mcp-tools.js';
import { getCustomTools, getCustomToolNames } from './custom-tools.js';

/**
 * Create local map tools for Vercel AI SDK v6
 *
 * Uses CONSOLIDATED tool pattern (1 tool instead of 40+):
 * - set-deck-state (handles viewState, basemap, layers, widgets, effects)
 */
export function createMapTools(): Record<string, Tool> {
  // Pass consolidated tool names to filter to the single tool
  const toolDefs = getToolsForVercelAI(consolidatedToolNames as ToolName[]);

  return Object.fromEntries(
    toolDefs.map((def: VercelAIToolDef & { name: string }) => [
      def.name,
      tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: def.execute,
      }),
    ])
  );
}

/**
 * Get all tools (local map tools + custom tools + MCP tools)
 *
 * Precedence order (highest to lowest):
 * 1. Local map tools
 * 2. Custom tools
 * 3. MCP tools
 */
export function getAllTools(): Record<string, Tool> {
  const mcpTools = getMCPTools();
  const customTools = getCustomTools();
  const localTools = createMapTools();

  // Local and custom tools override MCP tools on conflict
  return { ...mcpTools, ...customTools, ...localTools };
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
 * Get local tool names only (consolidated 3 tools)
 */
export function getToolNames(): string[] {
  return [...consolidatedToolNames];
}

// Re-export utilities
export { isFrontendToolResult };
