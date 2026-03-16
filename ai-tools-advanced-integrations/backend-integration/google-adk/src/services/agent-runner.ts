/**
 * Agent Runner for Google ADK
 *
 * Creates an LlmAgent and uses InMemoryRunner with streaming to process messages
 * and emit WebSocket events matching the same protocol as the other backends.
 *
 * Key differences from OpenAI Agents SDK version:
 * - ADK handles the tool execution loop internally (no manual tool loop)
 * - Events contain Content.parts[] with text/functionCall/functionResponse
 * - ADK streaming sends accumulated text (not deltas) — compute delta ourselves
 * - isFrontendToolResult() works on objects directly (no JSON.parse needed)
 */

import {
  LlmAgent,
  InMemoryRunner,
  isFinalResponse,
  stringifyContent,
  StreamingMode,
} from '@google/adk';
import { createUserContent } from '@google/genai';
import { WebSocket } from 'ws';
import { getAllTools, getAllToolNames, isFrontendToolResult } from '../agent/tools.js';
import { getCustomToolNames } from '../agent/custom-tools.js';
import { getModel } from '../agent/providers.js';
import { buildSystemPrompt } from '../prompts/system-prompt.js';
import { sanitizeMalformedKeys, stripCredentials } from './utils.js';
import type { InitialState, ConversationMessage } from '../types/messages.js';

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
    const tools = getAllTools();
    const toolNames = getAllToolNames();
    const userContext = initialState?.userContext;

    // Create agent with system prompt
    const agent = new LlmAgent({
      name: 'MapControlAgent',
      model: getModel(),
      description: 'AI agent for map control and spatial analysis',
      instruction: buildSystemPrompt(toolNames, initialState, userContext),
      tools,
    });

    // Create runner and session
    const runner = new InMemoryRunner({ agent, appName: 'carto_map_agent' });
    const adkSessionId = `session_${sessionId}_${Date.now()}`;
    await runner.sessionService.createSession({
      appName: 'carto_map_agent',
      userId: sessionId,
      sessionId: adkSessionId,
    });

    // Embed conversation history as context in user message
    let contextualMessage = userMessage;
    if (conversationHistory.length > 0) {
      const historyText = conversationHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');
      contextualMessage = `[Previous conversation context]\n${historyText}\n\n[Current request]\n${userMessage}`;
    }

    // Track state for WebSocket messaging
    let fullText = '';
    let lastSentLength = 0; // For computing text deltas from accumulated text
    let stepCounter = 0;

    // MCP layer tracking
    let pendingMcpTableName: string | null = null;
    let mcpResultCoordinates: { latitude: number; longitude: number } | null = null;
    let layerAddedWithMcpTable = false;

    // Run agent with streaming
    for await (const event of runner.runAsync({
      userId: sessionId,
      sessionId: adkSessionId,
      newMessage: createUserContent(contextualMessage),
      runConfig: { streamingMode: StreamingMode.SSE },
    })) {
      if (!event.content?.parts) continue;

      for (const part of event.content.parts) {
        // --- Streaming text ---
        if (part.text && (event as any).partial) {
          // ADK sends accumulated text, compute delta
          const delta = part.text.substring(lastSentLength);
          lastSentLength = part.text.length;
          if (delta) {
            fullText += delta;
            ws.send(JSON.stringify({
              type: 'stream_chunk',
              content: delta,
              messageId,
              isComplete: false,
            }));
          }
        }

        // --- Tool calls ---
        if (part.functionCall) {
          const toolName = part.functionCall.name!;
          const callId = (part.functionCall as any).id || `call_${Date.now()}`;
          const inputArgs = part.functionCall.args || {};
          const sanitizedInput = sanitizeMalformedKeys(inputArgs);

          console.log(`[Agent] Tool call: ${toolName}`);

          // Track workflowOutputTableName from async_workflow_job_get_results calls
          if (toolName.includes('async_workflow_job_get_results')) {
            const input = inputArgs as Record<string, unknown>;
            if (input.workflowOutputTableName && typeof input.workflowOutputTableName === 'string') {
              pendingMcpTableName = input.workflowOutputTableName;
              console.log(`[Agent] Tracking MCP workflowOutputTableName: ${pendingMcpTableName}`);
            }
          }

          ws.send(JSON.stringify({
            type: 'tool_call_start',
            toolName,
            input: sanitizedInput,
            callId,
          }));
        }

        // --- Tool responses ---
        if (part.functionResponse) {
          stepCounter++;
          const toolName = part.functionResponse.name!;
          const callId = (part.functionResponse as any).id || `call_${Date.now()}`;
          const output = part.functionResponse.response;

          console.log(`[Agent] Step ${stepCounter} - Tool output for: ${toolName}`);

          // Check if frontend tool — isFrontendToolResult works on objects directly
          if (isFrontendToolResult(output)) {
            const frontendResult = output as { toolName: string; data: unknown };

            console.log(`[Agent] Frontend tool call detected: ${frontendResult.toolName}`);

            // Track if set-deck-state was called with layers containing the MCP table
            if (frontendResult.toolName === 'set-deck-state' && pendingMcpTableName) {
              const data = frontendResult.data as Record<string, unknown>;
              if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
                const layersJson = JSON.stringify(data.layers);
                if (layersJson.includes(pendingMcpTableName)) {
                  layerAddedWithMcpTable = true;
                  console.log(`[Agent] Layer with MCP tableName confirmed in set-deck-state`);
                }
              }
            }

            // Sanitize and strip credentials before sending to frontend
            const sanitizedData = stripCredentials(sanitizeMalformedKeys(frontendResult.data));
            ws.send(JSON.stringify({
              type: 'tool_call',
              toolName: frontendResult.toolName,
              data: sanitizedData,
              callId,
              message: `Executing ${frontendResult.toolName}`,
            }));
          } else {
            // Backend tool result - check if it's a custom tool or MCP tool
            const customToolNames = getCustomToolNames();
            const isCustomTool = customToolNames.includes(toolName);
            const toolType = isCustomTool ? 'Custom' : 'MCP';

            console.log(`[Agent] ${toolType} tool result for ${toolName}:`);
            console.log(`[Agent] Result preview: ${JSON.stringify(output).substring(0, 5000)}`);

            // Extract coordinates from MCP workflow results for fallback layer
            if (toolName.includes('async_workflow_job_get_results') && pendingMcpTableName) {
              const coords = extractCoordinatesFromMcpResult(output);
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

            // Check for errors in result
            const resultObj = output as any;
            if (resultObj && typeof resultObj === 'object' && 'error' in resultObj && resultObj.error === true) {
              console.error(`[Agent] ${toolType} tool ${toolName} returned an error:`, resultObj.message);

              ws.send(JSON.stringify({
                type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                toolName,
                result: stripCredentials(output),
                callId,
                success: false,
                error: resultObj.message || 'Tool execution failed',
              }));
            } else {
              ws.send(JSON.stringify({
                type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                toolName,
                result: stripCredentials(output),
                callId,
              }));
            }
          }
        }
      }

      // --- Final response ---
      if (isFinalResponse(event)) {
        const finalText = stringifyContent(event).trim();
        if (finalText && finalText !== fullText) {
          // Send any remaining text not yet streamed
          const remaining = finalText.substring(fullText.length);
          if (remaining) {
            ws.send(JSON.stringify({
              type: 'stream_chunk',
              content: remaining,
              messageId,
              isComplete: false,
            }));
            fullText = finalText;
          }
        }
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

      ws.send(JSON.stringify({
        type: 'tool_call',
        toolName: 'set-deck-state',
        data: stripCredentials(fallbackLayerSpec),
        callId: `auto_layer_${Date.now()}`,
        message: 'Auto-adding MCP result layer',
      }));
      console.log(`[Agent] Fallback layer injected for table: ${pendingMcpTableName}`);
    }

    // Send completion
    ws.send(JSON.stringify({
      type: 'stream_chunk',
      content: '',
      messageId,
      isComplete: true,
    }));

    return {
      role: 'assistant',
      content: fullText || 'I performed the requested actions.',
    };
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('[Agent] Error:', err);
    ws.send(JSON.stringify({
      type: 'error',
      content: err.message || 'An error occurred',
      code: err.code,
    }));
    return null;
  }
}
