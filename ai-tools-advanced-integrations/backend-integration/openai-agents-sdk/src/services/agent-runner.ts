/**
 * Agent Runner for OpenAI Agents SDK
 *
 * Creates an Agent and uses run() with streaming to process messages
 * and emit WebSocket events matching the same protocol as the Vercel AI SDK backend.
 */

import {
  Agent,
  run,
  type RunItemStreamEvent,
  type RunRawModelStreamEvent,
  type RunToolCallItem,
  type RunToolCallOutputItem,
  type RunMessageOutputItem,
  type Model,
} from '@openai/agents';
import { WebSocket } from 'ws';
import { getAllTools, getAllToolNames, parseFrontendToolResult } from '../agent/tools.js';
import { getCustomToolNames } from '../agent/custom-tools.js';
import { getModel } from '../agent/providers.js';
import { buildSystemPrompt } from '../prompts/system-prompt.js';
import { sanitizeMalformedKeys, stripCredentials } from './utils.js';
import type { InitialState, ConversationMessage } from '../types/messages.js';

/**
 * Build AgentInputItem array from conversation history + new user message
 *
 * Converts flat {role, content} history into the format expected by the Agents SDK.
 */
function buildInput(
  conversationHistory: ConversationMessage[],
  userMessage: string,
): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];

  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      items.push({
        role: 'user',
        content: msg.content,
      });
    } else {
      items.push({
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: msg.content }],
      });
    }
  }

  // Add the new user message
  items.push({
    role: 'user',
    content: userMessage,
  });

  return items;
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
    const tools = getAllTools();
    const toolNames = getAllToolNames();

    // Extract userContext from initialState
    const userContext = initialState?.userContext;

    // Create the agent
    const agent = new Agent({
      name: 'MapControlAgent',
      instructions: buildSystemPrompt(toolNames, initialState, userContext),
      model: getModel() as Model,
      tools,
    });

    // Build input from conversation history + new user message
    const input = buildInput(conversationHistory, userMessage);

    // Run the agent with streaming
    const result = await run(agent, input as any, {
      stream: true,
      maxTurns: 50,
    });

    let fullText = '';
    let stepCounter = 0;

    // --- MCP layer tracking ---
    // Track workflowOutputTableName from MCP tool calls to ensure layers are added
    let pendingMcpTableName: string | null = null;
    let mcpResultCoordinates: { latitude: number; longitude: number } | null = null;
    let layerAddedWithMcpTable = false;

    // Track tool call IDs to tool names for correlation
    const toolCallNames = new Map<string, string>();

    // Track whether text was streamed after the last tool output.
    // The OpenAI Agents SDK may not stream text deltas for the agent's
    // response after tool calls (e.g., with Chat Completions mode).
    // In that case, the text arrives as a message_output_created event
    // and we need to send it to the frontend manually.
    let textStreamedSinceLastTool = true;

    // Process the stream
    for await (const event of result) {
      if (event.type === 'raw_model_stream_event') {
        const rawEvent = event as RunRawModelStreamEvent;
        const data = rawEvent.data as Record<string, unknown>;

        // Extract text delta from the SDK's normalized stream events.
        // OpenAIChatCompletionsModel converts raw Chat Completions SSE into the
        // Agents SDK internal format before emitting, so we handle:
        //   - output_text_delta  (SDK normalized format — most common)
        //   - response.output_text.delta (Responses API native)
        //   - choices[].delta.content (raw Chat Completions fallback)
        let delta: string | undefined;

        if (data.type === 'output_text_delta' || data.type === 'response.output_text.delta') {
          delta = (data as { delta?: string }).delta;
        } else if (data.type === 'response.content_part.delta') {
          delta = (data as { delta?: string }).delta;
        } else {
          // Raw Chat Completions fallback (in case a model provider doesn't normalize)
          const choices = (data as { choices?: Array<{ delta?: { content?: string } }> }).choices;
          if (choices?.[0]?.delta?.content) {
            delta = choices[0].delta.content;
          }
        }

        if (delta) {
          fullText += delta;
          textStreamedSinceLastTool = true;
          ws.send(
            JSON.stringify({
              type: 'stream_chunk',
              content: delta,
              messageId,
              isComplete: false,
            })
          );
        }
      } else if (event.type === 'run_item_stream_event') {
        const itemEvent = event as RunItemStreamEvent;

        switch (itemEvent.name) {
          case 'tool_called': {
            const toolCallItem = itemEvent.item as RunToolCallItem;
            const rawItem = toolCallItem.rawItem as Record<string, unknown>;
            const toolName = (rawItem.name as string) ?? 'unknown';
            const callId = (rawItem.callId as string) ?? `call_${Date.now()}`;

            // Store the tool name for later correlation
            toolCallNames.set(callId, toolName);

            console.log(`[Agent] Tool call: ${toolName}`);

            // Sanitize malformed keys in tool input (Gemini fix)
            let inputArgs: unknown;
            try {
              const rawArgs = rawItem.arguments;
              inputArgs = typeof rawArgs === 'string'
                ? JSON.parse(rawArgs)
                : rawArgs;
            } catch {
              inputArgs = rawItem.arguments;
            }

            const sanitizedInput = sanitizeMalformedKeys(inputArgs);

            // Track workflowOutputTableName from async_workflow_job_get_results calls
            if (toolName.includes('async_workflow_job_get_results')) {
              const input = inputArgs as Record<string, unknown>;
              if (input.workflowOutputTableName && typeof input.workflowOutputTableName === 'string') {
                pendingMcpTableName = input.workflowOutputTableName;
                console.log(`[Agent] Tracking MCP workflowOutputTableName: ${pendingMcpTableName}`);
              }
            }

            ws.send(
              JSON.stringify({
                type: 'tool_call_start',
                toolName,
                input: sanitizedInput,
                callId,
              })
            );
            break;
          }

          case 'tool_output': {
            stepCounter++;
            textStreamedSinceLastTool = false;
            const outputItem = itemEvent.item as RunToolCallOutputItem;
            const outputString = typeof outputItem.output === 'string'
              ? outputItem.output
              : JSON.stringify(outputItem.output);

            // Try to correlate with tool name from the raw item
            const rawItem = outputItem.rawItem as Record<string, unknown>;
            const callId = (rawItem.callId as string) ?? `call_${Date.now()}`;
            const toolName = toolCallNames.get(callId) ?? 'unknown';

            console.log(`[Agent] Step ${stepCounter} - Tool output for: ${toolName}`);

            // Check if this is a frontend tool result (local map tools)
            const frontendResult = parseFrontendToolResult(outputString);

            if (frontendResult) {
              console.log(`[Agent] Frontend tool call detected: ${frontendResult.toolName}`);
              console.log(`[Agent] Frontend tool data:`, JSON.stringify(frontendResult.data).substring(0, 500));

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
              ws.send(
                JSON.stringify({
                  type: 'tool_call',
                  toolName: frontendResult.toolName,
                  data: sanitizedData,
                  callId,
                  message: `Executing ${frontendResult.toolName}`,
                })
              );
            } else {
              // Backend tool result - check if it's a custom tool or MCP tool
              const customToolNames = getCustomToolNames();
              const isCustomTool = customToolNames.includes(toolName);
              const toolType = isCustomTool ? 'Custom' : 'MCP';

              console.log(`[Agent] ${toolType} tool result for ${toolName}:`);
              console.log(`[Agent] Result preview: ${outputString.substring(0, 5000)}`);

              // Extract coordinates from MCP workflow results for fallback layer
              if (toolName.includes('async_workflow_job_get_results') && pendingMcpTableName) {
                let resultForCoords: unknown;
                try {
                  resultForCoords = JSON.parse(outputString);
                } catch {
                  resultForCoords = null;
                }
                if (resultForCoords) {
                  const coords = extractCoordinatesFromMcpResult(resultForCoords);
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
              }

              // Parse the output to check for errors
              let parsedOutput: unknown;
              try {
                parsedOutput = JSON.parse(outputString);
              } catch {
                parsedOutput = { text: outputString };
              }

              const resultObj = parsedOutput as { error?: boolean; message?: string; details?: unknown } | null | undefined;
              if (resultObj && typeof resultObj === 'object' && 'error' in resultObj && resultObj.error === true) {
                console.error(`[Agent] ${toolType} tool ${toolName} returned an error:`, resultObj.message);

                ws.send(
                  JSON.stringify({
                    type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                    toolName,
                    result: stripCredentials(parsedOutput),
                    callId,
                    success: false,
                    error: resultObj.message || 'Tool execution failed',
                  })
                );
              } else {
                ws.send(
                  JSON.stringify({
                    type: isCustomTool ? 'custom_tool_result' : 'mcp_tool_result',
                    toolName,
                    result: stripCredentials(parsedOutput),
                    callId,
                  })
                );
              }
            }
            break;
          }

          case 'message_output_created': {
            // The SDK may not emit text deltas for responses after tool calls
            // (e.g., when using Chat Completions mode). In that case, the
            // complete text only appears here. Send any unsent text to the frontend.
            if (!textStreamedSinceLastTool) {
              const messageItem = itemEvent.item as RunMessageOutputItem;
              const rawItem = messageItem.rawItem as Record<string, unknown>;
              const content = rawItem.content as Array<{ type: string; text?: string }>;

              if (Array.isArray(content)) {
                let outputText = '';
                for (const part of content) {
                  if (part.type === 'output_text' && part.text) {
                    outputText += part.text;
                  }
                }

                if (outputText) {
                  console.log(`[Agent] Sending non-streamed text (${outputText.length} chars)`);
                  fullText += outputText;
                  ws.send(
                    JSON.stringify({
                      type: 'stream_chunk',
                      content: outputText,
                      messageId,
                      isComplete: false,
                    })
                  );
                }
              }
            }
            break;
          }

          default:
            // agent_updated, handoff, reasoning, etc. - log for debugging
            console.log(`[Agent] Stream event: ${itemEvent.name}`);
            break;
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
    const finalOutput = result.finalOutput;
    return {
      role: 'assistant',
      content: typeof finalOutput === 'string' ? finalOutput : fullText || 'I performed the requested actions.',
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
