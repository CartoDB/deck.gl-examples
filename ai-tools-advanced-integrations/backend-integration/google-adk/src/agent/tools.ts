/**
 * Tool definitions for Google ADK
 *
 * Uses @carto/agentic-deckgl converters for Google ADK format.
 * Combines local map tools with custom tools and remote MCP server tools.
 *
 * Key differences from OpenAI Agents SDK version:
 * - Uses getToolsForGoogleADK() instead of getToolsForOpenAIAgents()
 * - Creates FunctionTool instances with new FunctionTool({...})
 * - No zodV4ToJsonSchema() workaround needed — ADK handles zod natively
 * - isFrontendToolResult() works on objects directly (no parseFrontendToolResult)
 */

import { FunctionTool } from '@google/adk';
import {
  getToolsForGoogleADK,
  consolidatedToolNames,
  isFrontendToolResult,
  type GoogleADKToolDef,
  type ToolName,
} from '@carto/agentic-deckgl';
import { getMCPTools, getMCPToolNames } from './mcp-tools.js';
import { getCustomTools, getCustomToolNames } from './custom-tools.js';

/**
 * Create local map tools for Google ADK
 *
 * Uses CONSOLIDATED tool pattern (1 tool instead of 40+):
 * - set-deck-state (handles viewState, basemap, layers, widgets, effects)
 */
export function createMapTools(): FunctionTool[] {
  const toolDefs = getToolsForGoogleADK(consolidatedToolNames as ToolName[]);

  return toolDefs.map((def: GoogleADKToolDef) =>
    new FunctionTool({
      name: def.name,
      description: def.description,
      parameters: def.parameters, // Zod v4 schema — ADK handles directly
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
export { isFrontendToolResult };
