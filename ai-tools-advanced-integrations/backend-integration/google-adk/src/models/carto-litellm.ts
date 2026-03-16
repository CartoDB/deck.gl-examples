/**
 * Custom BaseLlm: CARTO LiteLLM Proxy (OpenAI-compatible)
 *
 * Bridges ADK's Content/Part format with OpenAI's Chat Completions API
 * via the CARTO LiteLLM proxy. Handles format conversion, tool call ID
 * round-tripping, streaming, and error recovery.
 *
 * Extracted and refined from poc/test-adk-litellm.ts.
 */

import OpenAI from 'openai';
import { BaseLlm } from '@google/adk';
import type { Content, FunctionDeclaration, Part } from '@google/genai';

/**
 * LlmResponse interface matching @google/adk's internal type.
 * Defined locally because it's not re-exported from the main entry.
 */
export interface LlmResponse {
  content?: Content;
  partial?: boolean;
  turnComplete?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export class CartoLiteLlm extends BaseLlm {
  private client: OpenAI;

  /**
   * Maps functionCall.id (ADK-generated) -> OpenAI tool_call.id
   * Populated when yielding tool calls, consumed when converting tool responses.
   */
  private toolCallIdMap = new Map<string, string>();

  constructor(opts: { model: string; baseURL: string; apiKey: string }) {
    super({ model: opts.model });
    this.client = new OpenAI({
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
    });
  }

  // ── Format conversion: ADK -> OpenAI ──────────────────────────

  /**
   * Convert ADK Content[] to OpenAI ChatCompletionMessageParam[]
   *
   * Key mapping: ADK uses a flat Part[] array within Content, while
   * OpenAI requires specific message structures:
   * - Multiple functionCalls -> single assistant message with tool_calls[]
   * - Each functionResponse -> separate tool message with matching tool_call_id
   */
  private contentsToMessages(
    contents: Content[],
    systemInstruction?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    for (const content of contents) {
      if (!content.parts?.length) continue;

      const textParts: string[] = [];
      const functionCalls: { id: string; name: string; args: string }[] = [];
      const functionResponses: { toolCallId: string; content: string }[] = [];

      for (const part of content.parts) {
        if (part.text) {
          textParts.push(part.text);
        }

        if (part.functionCall) {
          const fcId = (part.functionCall as any).id;
          const openaiId = fcId
            || this.toolCallIdMap.get(part.functionCall.name!)
            || `call_${part.functionCall.name}_${Date.now()}`;

          functionCalls.push({
            id: openaiId,
            name: part.functionCall.name!,
            args: JSON.stringify(part.functionCall.args || {}),
          });
        }

        if (part.functionResponse) {
          // ADK preserves functionCall.id -> functionResponse.id through internal execution.
          // Use functionResponse.id directly — do NOT look up by tool name (breaks with duplicates).
          const frId = part.functionResponse.id;
          const frName = part.functionResponse.name;
          const openaiId = frId || `call_${frName}_${Date.now()}`;

          functionResponses.push({
            toolCallId: openaiId,
            content: JSON.stringify(part.functionResponse.response || {}),
          });
        }
      }

      // Emit messages in correct OpenAI order
      if (content.role === 'model') {
        if (functionCalls.length > 0) {
          // CRITICAL: Multiple tool calls must be in a SINGLE assistant message
          messages.push({
            role: 'assistant',
            content: textParts.length > 0 ? textParts.join('\n') : null,
            tool_calls: functionCalls.map((fc) => ({
              id: fc.id,
              type: 'function' as const,
              function: { name: fc.name, arguments: fc.args },
            })),
          });
        } else if (textParts.length > 0) {
          messages.push({ role: 'assistant', content: textParts.join('\n') });
        }
      } else {
        // User text
        if (textParts.length > 0) {
          messages.push({ role: 'user', content: textParts.join('\n') });
        }
      }

      // Tool responses — each as a separate tool message
      for (const fr of functionResponses) {
        messages.push({
          role: 'tool',
          tool_call_id: fr.toolCallId,
          content: fr.content,
        });
      }
    }

    return messages;
  }

  /**
   * Convert ADK FunctionDeclarations to OpenAI tool definitions
   */
  private toolsToOpenAI(
    config?: any,
  ): OpenAI.ChatCompletionTool[] | undefined {
    const toolGroups = config?.tools;
    if (!toolGroups?.length) return undefined;

    const openaiTools: OpenAI.ChatCompletionTool[] = [];

    for (const group of toolGroups) {
      if (!group.functionDeclarations) continue;
      for (const decl of group.functionDeclarations as FunctionDeclaration[]) {
        openaiTools.push({
          type: 'function',
          function: {
            name: decl.name!,
            description: decl.description || '',
            parameters: this.convertSchemaToJsonSchema(decl.parameters),
          },
        });
      }
    }

    return openaiTools.length > 0 ? openaiTools : undefined;
  }

  /**
   * Convert Google's schema format (OBJECT, STRING, etc.) to JSON Schema
   */
  private convertSchemaToJsonSchema(schema: any): Record<string, unknown> {
    if (!schema) return { type: 'object', properties: {} };

    const typeMap: Record<string, string> = {
      OBJECT: 'object',
      STRING: 'string',
      NUMBER: 'number',
      INTEGER: 'integer',
      BOOLEAN: 'boolean',
      ARRAY: 'array',
    };

    const result: Record<string, unknown> = {
      type: typeMap[schema.type] || schema.type?.toLowerCase() || 'object',
    };

    if (schema.description) result.description = schema.description;

    if (schema.properties) {
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(schema.properties)) {
        props[key] = this.convertSchemaToJsonSchema(val);
      }
      result.properties = props;
    }

    if (schema.required) result.required = schema.required;
    if (schema.items) result.items = this.convertSchemaToJsonSchema(schema.items);
    if (schema.enum) result.enum = schema.enum;

    return result;
  }

  // ── Format conversion: OpenAI -> ADK ──────────────────────────

  /**
   * Convert OpenAI ChatCompletion response to ADK LlmResponse.
   * Stores tool call IDs in the map for later matching.
   */
  private openaiResponseToLlmResponse(
    choice: OpenAI.ChatCompletion.Choice,
  ): LlmResponse {
    const parts: Part[] = [];

    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        // Store the OpenAI ID for later matching
        this.toolCallIdMap.set(tc.function.name, tc.id);
        this.toolCallIdMap.set(`${tc.function.name}_${tc.id}`, tc.id);

        parts.push({
          functionCall: {
            name: tc.function.name,
            id: tc.id, // Preserve the OpenAI ID in the ADK part
            args: JSON.parse(tc.function.arguments),
          },
        });
      }
    }

    return {
      content: {
        role: 'model',
        parts,
      },
    };
  }

  // ── Core BaseLlm implementation ──────────────────────────────

  async *generateContentAsync(
    llmRequest: any,
    stream = false,
  ): AsyncGenerator<LlmResponse, void> {
    this.maybeAppendUserContent(llmRequest);

    // Handle both string and Content object for systemInstruction
    const systemInstruction =
      typeof llmRequest.config?.systemInstruction === 'string'
        ? llmRequest.config.systemInstruction
        : llmRequest.config?.systemInstruction?.parts?.[0]?.text;

    const messages = this.contentsToMessages(
      llmRequest.contents,
      systemInstruction,
    );
    const tools = this.toolsToOpenAI(llmRequest.config);

    console.log(
      `[CartoLiteLlm] request: ${messages.length} msgs, ${tools?.length ?? 0} tools, stream=${stream}`,
    );

    if (stream) {
      yield* this.handleStreaming(messages, tools);
    } else {
      yield* this.handleNonStreaming(messages, tools);
    }
  }

  private async *handleStreaming(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools?: OpenAI.ChatCompletionTool[],
  ): AsyncGenerator<LlmResponse, void> {
    try {
      const streamResponse = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools,
        stream: true,
      });

      let accumulatedText = '';
      const currentToolCalls = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();

      for await (const chunk of streamResponse) {
        const delta = chunk.choices?.[0]?.delta;
        const finishReason = chunk.choices?.[0]?.finish_reason;

        if (!delta && !finishReason) continue;

        if (delta?.content) {
          accumulatedText += delta.content;
          yield {
            content: {
              role: 'model',
              parts: [{ text: accumulatedText }],
            },
            partial: true,
          };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!currentToolCalls.has(idx)) {
              currentToolCalls.set(idx, { id: '', name: '', arguments: '' });
            }
            const current = currentToolCalls.get(idx)!;
            if (tc.id) current.id = tc.id;
            if (tc.function?.name) current.name = tc.function.name;
            if (tc.function?.arguments) current.arguments += tc.function.arguments;
          }
        }

        if (finishReason) {
          const parts: Part[] = [];

          if (accumulatedText) {
            parts.push({ text: accumulatedText });
          }

          for (const [, tc] of currentToolCalls) {
            // Store ID mapping
            this.toolCallIdMap.set(tc.name, tc.id);
            this.toolCallIdMap.set(`${tc.name}_${tc.id}`, tc.id);

            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.arguments);
            } catch {
              console.warn(`[CartoLiteLlm] Failed to parse tool args: ${tc.arguments}`);
            }
            parts.push({
              functionCall: { name: tc.name, id: tc.id, args },
            });
          }

          if (parts.length > 0) {
            yield {
              content: { role: 'model', parts },
              partial: false,
              turnComplete: true,
            };
          }
        }
      }
    } catch (apiError: any) {
      console.error(`[CartoLiteLlm] Streaming API error: ${apiError.status} ${apiError.message?.substring(0, 200)}`);
      // Yield error response instead of throwing (avoids ADK JSON.parse bug)
      yield {
        errorCode: String(apiError.status || 'UNKNOWN'),
        errorMessage: apiError.message?.substring(0, 500) || 'Streaming API error',
      };
    }
  }

  private async *handleNonStreaming(
    messages: OpenAI.ChatCompletionMessageParam[],
    tools?: OpenAI.ChatCompletionTool[],
  ): AsyncGenerator<LlmResponse, void> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools,
      });

      const choice = response.choices[0];
      if (choice) {
        yield this.openaiResponseToLlmResponse(choice);
      }
    } catch (apiError: any) {
      console.error(`[CartoLiteLlm] API error: ${apiError.status} ${apiError.message?.substring(0, 200)}`);
      // Yield error response instead of throwing (avoids ADK JSON.parse bug)
      yield {
        errorCode: String(apiError.status || 'UNKNOWN'),
        errorMessage: apiError.message?.substring(0, 500) || 'API error',
      };
    }
  }

  async connect(): Promise<any> {
    throw new Error('Live connection not supported for CARTO LiteLLM proxy');
  }
}
