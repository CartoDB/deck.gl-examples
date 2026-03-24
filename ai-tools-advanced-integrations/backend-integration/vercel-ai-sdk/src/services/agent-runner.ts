/**
 * Agent Runner for Vercel AI SDK v6
 *
 * Uses ToolLoopAgent for streaming agent execution
 */

import { ToolLoopAgent, stepCountIs, type ModelMessage } from 'ai';
import { WebSocket } from 'ws';
import { getAllTools, getAllToolNames, isFrontendToolResult } from '../agent/tools.js';
import { getCustomToolNames } from '../agent/custom-tools.js';
import { getProvider } from '../agent/providers.js';
import { buildSystemPrompt } from '../prompts/system-prompt.js';
import type { InitialState, ConversationMessage } from '../types/messages.js';
import type { FrontendToolResult } from '@carto/agentic-deckgl';

/**
 * Credential fields to strip from data sent to frontend
 * These are sensitive and should never be transmitted over WebSocket
 */
const CREDENTIAL_FIELDS = ['accessToken', 'apiBaseUrl', 'connectionName', 'connection'];

/**
 * Pattern to detect malformed keys with extra quotes around @@ prefixes
 * Gemini sometimes generates keys like "'@@type'" instead of "@@type"
 */
const MALFORMED_KEY_PATTERN = /^['"]?(@@[^'"]+)['"]?$/;

/**
 * Sanitize malformed object keys that Gemini may generate
 * Fixes keys like "'@@type'" → "@@type" and "'@@function'" → "@@function"
 */
export const sanitizeMalformedKeys = (data: unknown): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeMalformedKeys);
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Fix malformed keys with extra quotes around @@ prefixes
      const match = key.match(MALFORMED_KEY_PATTERN);
      const cleanKey = match ? match[1] : key;
      result[cleanKey] = sanitizeMalformedKeys(value);
    }
    return result;
  }

  // Handle string values that might contain malformed JSON
  if (typeof data === 'string') {
    // Fix malformed keys in JSON strings (e.g., "'@@type'" → "@@type")
    return data
      .replace(/"'@@([^']+)'"/g, '"@@$1"')
      .replace(/'@@([^']+)'/g, '"@@$1"');
  }

  return data;
};

/**
 * Recursively strip credential fields from data before sending to frontend
 * This ensures sensitive information is never transmitted over WebSocket
 */
export const stripCredentials = (data: unknown): unknown => {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(stripCredentials);
  }
  
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!CREDENTIAL_FIELDS.includes(key)) {
        result[key] = stripCredentials(value);
      }
    }
    return result;
  }
  
  return data;
};

/**
 * Create a Map Control Agent using ToolLoopAgent
 *
 * Uses all available tools (local + MCP)
 */
let stepCounter = 0;

function createMapAgent(initialState?: InitialState) {
  const model = getProvider();
  const tools = getAllTools();
  const toolNames = getAllToolNames();
  stepCounter = 0;

  // Extract userContext from initialState
  const userContext = initialState?.userContext;

  return new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(toolNames, initialState, userContext),
    tools,
    stopWhen: stepCountIs(50), // Stop after 50 steps max (MCP async jobs need polling)
    onStepFinish: (stepResult) => {
      stepCounter++;
      console.log(`[Agent] Step ${stepCounter} finished with ${stepResult.toolCalls.length} tool calls`);
    },
  });
}

/**
 * Extract latitude and longitude from MCP result data.
 * Searches through rows for lat/lng fields.
 */
function extractCoordinatesFromMcpResult(output: unknown): { latitude: number; longitude: number } | null {
  if (!output || typeof output !== 'object') return null;

  const obj = output as Record<string, unknown>;

  // Try direct fields (parsed JSON result)
  if (typeof obj.data === 'object' && obj.data !== null) {
    const data = obj.data as Record<string, unknown>;
    if (Array.isArray(data.rows) && data.rows.length > 0) {
      const row = data.rows[0] as Record<string, unknown>;
      if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
        return { latitude: row.latitude, longitude: row.longitude };
      }
    }
  }

  // Try text-wrapped result (when MCP returns text instead of parsed JSON)
  if (typeof obj.text === 'string') {
    try {
      const parsed = JSON.parse(obj.text);
      if (parsed?.data?.rows?.[0]) {
        const row = parsed.data.rows[0];
        if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
          return { latitude: row.latitude, longitude: row.longitude };
        }
      }
    } catch {
      // Not parseable, ignore
    }
  }

  return null;
}

/**
 * Run the map agent and stream results via WebSocket
 */
export async function runMapAgent(
  userMessage: string,
  ws: WebSocket,
  sessionId: string,
  conversationHistory: ConversationMessage[],
  initialState?: InitialState,
  onConversationMessage?: (message: ConversationMessage) => void,
): Promise<ConversationMessage | null> {
  const messageId = `msg_${Date.now()}`;

  try {
    // Create the agent with all available tools (local + MCP)
    const agent = createMapAgent(initialState);

    // Build messages array from history, adding the new user message
    const messages: ModelMessage[] = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    // Stream the agent response - must await the stream() call first
    const streamResult = await agent.stream({
      messages,
    });

    let fullText = '';

    // --- MCP layer tracking ---
    // Track workflowOutputTableName from MCP tool calls to ensure layers are added
    let pendingMcpTableName: string | null = null;
    let mcpResultCoordinates: { latitude: number; longitude: number } | null = null;
    let layerAddedWithMcpTable = false;

    // Process the stream
    for await (const part of streamResult.fullStream) {
      // Debug: log all stream events
      if (part.type !== 'text-delta') {
        console.log(`[Agent] Stream event: ${part.type}`, JSON.stringify(part).substring(0, 300));
      }

      switch (part.type) {
        case 'text-delta': {
          // AI SDK v6: part.text is the actual delta (not accumulated)
          const delta = part.text;
          if (delta) {
            fullText += delta;
            ws.send(
              JSON.stringify({
                type: 'stream_chunk',
                content: delta,
                messageId,
                isComplete: false,
              })
            );
          }
          break;
        }

        case 'tool-call': {
          // Notify client that a tool is being called
          console.log(`[Agent] Tool call: ${part.toolName}`);
          // Sanitize malformed keys in tool input (Gemini fix)
          const sanitizedInput = sanitizeMalformedKeys(part.input);

          // Track workflowOutputTableName from async_workflow_job_get_results calls
          if (part.toolName.includes('async_workflow_job_get_results')) {
            const input = part.input as Record<string, unknown>;
            if (input.workflowOutputTableName && typeof input.workflowOutputTableName === 'string') {
              pendingMcpTableName = input.workflowOutputTableName;
              console.log(`[Agent] Tracking MCP workflowOutputTableName: ${pendingMcpTableName}`);
            }
          }

          ws.send(
            JSON.stringify({
              type: 'tool_call_start',
              toolName: part.toolName,
              input: sanitizedInput,
              callId: part.toolCallId,
            })
          );
          break;
        }

        case 'tool-result':
          // Check if this is a frontend tool result (local map tools)
          if (isFrontendToolResult(part.output)) {
            const frontendResult = part.output as FrontendToolResult;
            console.log(`[Agent] Frontend tool call detected: ${frontendResult.toolName}`);
            console.log(`[Agent] Frontend tool data:`, JSON.stringify(frontendResult.data).substring(0, 500));

            // Track if set-deck-state was called with layers containing the MCP table
            if (frontendResult.toolName === 'set-deck-state' && pendingMcpTableName) {
              const data = frontendResult.data as Record<string, unknown>;
              if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
                // Check if any layer references the pending MCP table
                const layersJson = JSON.stringify(data.layers);
                if (layersJson.includes(pendingMcpTableName)) {
                  layerAddedWithMcpTable = true;
                  console.log(`[Agent] Layer with MCP tableName confirmed in set-deck-state`);
                }
              }
            }

            // Sanitize malformed keys (Gemini fix) and strip credentials before sending to frontend
            const sanitizedData = stripCredentials(sanitizeMalformedKeys(frontendResult.data));
            ws.send(
              JSON.stringify({
                type: 'tool_call',
                toolName: frontendResult.toolName,
                data: sanitizedData,
                callId: part.toolCallId,
                message: `Executing ${frontendResult.toolName}`
              })
            );
          } else {
            // Backend tool result - check if it's a custom tool or MCP tool
            const customToolNames = getCustomToolNames();
            const isCustomTool = customToolNames.includes(part.toolName);
            const toolType = isCustomTool ? 'Custom' : 'MCP';

            // Log the full result for debugging
            const resultStr = JSON.stringify(part.output);
            console.log(`[Agent] ${toolType} tool result for ${part.toolName}:`);
            console.log(`[Agent] Result type: ${typeof part.output}`);
            console.log(`[Agent] Result length: ${resultStr.length} chars`);
            console.log(`[Agent] Result preview: ${resultStr.substring(0, 5000)}`);

            // Extract coordinates from MCP workflow results for fallback layer
            if (part.toolName.includes('async_workflow_job_get_results') && pendingMcpTableName) {
              const coords = extractCoordinatesFromMcpResult(part.output);
              if (coords) {
                mcpResultCoordinates = coords;
                console.log(`[Agent] Extracted coordinates from MCP result: lat=${coords.latitude}, lng=${coords.longitude}`);
              }

              // Store MCP table name in conversation history for follow-up mask requests
              if (onConversationMessage) {
                onConversationMessage({
                  role: 'assistant',
                  content: `[MCP Result Table Available] The MCP workflow result is stored in table "${pendingMcpTableName}". When the user asks to filter or mask by this area, call set-mask-layer { action: "set", tableName: "${pendingMcpTableName}" }.`,
                });
                console.log(`[Agent] Stored MCP table name in conversation history for mask layer use`);
              }
            }

            // Check if result contains an error (MCP error responses)
            const result = part.output as { error?: boolean; message?: string; details?: unknown } | null | undefined;
            if (result && typeof result === 'object' && 'error' in result && result.error === true) {
              console.error(`[Agent] ${toolType} tool ${part.toolName} returned an error:`, result.message);
              console.error(`[Agent] Error details:`, result.details);

              // Send error result to frontend - strip credentials from error details too
              ws.send(
                JSON.stringify({
                  type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                  toolName: part.toolName,
                  result: stripCredentials(part.output),
                  callId: part.toolCallId,
                  success: false,
                  error: result.message || 'Tool execution failed',
                })
              );
            } else {
              // Check if result is null or undefined
              if (part.output === null || part.output === undefined) {
                console.warn(`[Agent] WARNING: ${toolType} tool ${part.toolName} returned null/undefined result!`);
              }

              // Strip credentials before sending to frontend
              ws.send(
                JSON.stringify({
                  type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                  toolName: part.toolName,
                  result: stripCredentials(part.output),
                  callId: part.toolCallId,
                })
              );
            }
          }
          break;

        case 'finish-step':
          console.log(`[Agent] Step completed for session ${sessionId}`);
          break;

        case 'error':
          console.error('[Agent] Stream error:', part.error);
          ws.send(
            JSON.stringify({
              type: 'error',
              content: String(part.error),
            })
          );
          break;
      }
    }

    // Log agent loop termination for debugging
    console.log('[Agent] Stream processing complete');
    console.log('[Agent] Final text length:', fullText.length);
    console.log('[Agent] Total steps:', stepCounter);

    // --- Fallback: auto-inject set-deck-state with layer if LLM failed to add it ---
    if (pendingMcpTableName && !layerAddedWithMcpTable) {
      console.log(`[Agent] WARNING: LLM did not add a layer for MCP table: ${pendingMcpTableName}`);
      console.log(`[Agent] Injecting fallback set-deck-state with VectorTileLayer`);

      const fallbackLayerSpec: Record<string, unknown> = {
        layers: [{
          '@@type': 'VectorTileLayer',
          id: `mcp-result-${Date.now()}`,
          data: {
            '@@function': 'vectorTableSource',
            tableName: pendingMcpTableName,
          },
          opacity: 0.6,
          getFillColor: [66, 135, 245, 120],
          stroked: true,
          getLineColor: [255, 255, 255, 200],
          lineWidthMinPixels: 1,
          pickable: true,
        }],
      };

      // Add view state if we have coordinates from the MCP result
      if (mcpResultCoordinates) {
        fallbackLayerSpec.initialViewState = {
          latitude: mcpResultCoordinates.latitude,
          longitude: mcpResultCoordinates.longitude,
          zoom: 14,
        };
      }

      ws.send(
        JSON.stringify({
          type: 'tool_call',
          toolName: 'set-deck-state',
          data: stripCredentials(fallbackLayerSpec),
          callId: `auto_layer_${Date.now()}`,
          message: 'Auto-adding MCP result layer',
        })
      );
      console.log(`[Agent] Fallback layer injected for table: ${pendingMcpTableName}`);
    }

    // Send completion
    ws.send(
      JSON.stringify({
        type: 'stream_chunk',
        content: '',
        messageId,
        isComplete: true,
      })
    );

    // Get final text for history
    const text = await streamResult.text;
    return {
      role: 'assistant',
      content: text || fullText || 'I performed the requested actions.',
    };
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('[Agent] Error:', err);
    ws.send(
      JSON.stringify({
        type: 'error',
        content: err.message || 'An error occurred',
        code: err.code,
      })
    );
    return null;
  }
}
