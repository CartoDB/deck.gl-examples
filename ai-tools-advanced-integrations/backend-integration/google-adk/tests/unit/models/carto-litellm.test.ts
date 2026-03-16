import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI client
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      baseURL: string;
      apiKey: string;
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
      constructor(opts: { baseURL: string; apiKey: string }) {
        this.baseURL = opts.baseURL;
        this.apiKey = opts.apiKey;
      }
    },
  };
});

// Mock BaseLlm from @google/adk — it's an abstract class
vi.mock('@google/adk', () => ({
  BaseLlm: class MockBaseLlm {
    model: string;
    constructor(opts: { model: string }) {
      this.model = opts.model;
    }
    maybeAppendUserContent(_request: any) {
      // no-op mock
    }
  },
}));

import { CartoLiteLlm } from '../../../src/models/carto-litellm.js';

function createInstance(): CartoLiteLlm {
  return new CartoLiteLlm({
    model: 'gpt-4o',
    baseURL: 'https://test.example.com',
    apiKey: 'test-key',
  });
}

// ─── Constructor ─────────────────────────────────────────────

describe('CartoLiteLlm constructor', () => {
  it('creates instance with model name', () => {
    const llm = createInstance();
    expect(llm.model).toBe('gpt-4o');
  });

  it('connect() throws', async () => {
    const llm = createInstance();
    await expect(llm.connect()).rejects.toThrow('Live connection not supported');
  });
});

// ─── contentsToMessages (private, tested via generateContentAsync) ───

describe('contentsToMessages', () => {
  // Access private method for testing
  function callContentsToMessages(llm: CartoLiteLlm, contents: any[], systemInstruction?: string) {
    return (llm as any).contentsToMessages(contents, systemInstruction);
  }

  it('includes system message when systemInstruction provided', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [], 'You are a helpful assistant');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
  });

  it('converts user text content', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      { role: 'user', parts: [{ text: 'Hello' }] },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('converts model text content to assistant message', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('converts model functionCall to assistant with tool_calls', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      {
        role: 'model',
        parts: [{
          functionCall: {
            name: 'set-deck-state',
            id: 'call_123',
            args: { zoom: 10 },
          },
        }],
      },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect((messages[0] as any).tool_calls).toHaveLength(1);
    expect((messages[0] as any).tool_calls[0].function.name).toBe('set-deck-state');
    expect((messages[0] as any).tool_calls[0].id).toBe('call_123');
  });

  it('converts functionResponse to tool message', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      {
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'set-deck-state',
            id: 'call_123',
            response: { success: true },
          },
        }],
      },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
    expect((messages[0] as any).tool_call_id).toBe('call_123');
  });

  it('skips contents with no parts', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      { role: 'user', parts: [] },
      { role: 'user', parts: [{ text: 'real message' }] },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'real message' });
  });

  it('joins multiple text parts with newlines', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      { role: 'user', parts: [{ text: 'line1' }, { text: 'line2' }] },
    ]);
    expect(messages[0]).toEqual({ role: 'user', content: 'line1\nline2' });
  });

  it('handles multiple functionCalls in one content as single assistant message', () => {
    const llm = createInstance();
    const messages = callContentsToMessages(llm, [
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'tool-a', id: 'call_a', args: {} } },
          { functionCall: { name: 'tool-b', id: 'call_b', args: {} } },
        ],
      },
    ]);
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).tool_calls).toHaveLength(2);
  });
});

// ─── toolsToOpenAI ──────────────────────────────────────────

describe('toolsToOpenAI', () => {
  function callToolsToOpenAI(llm: CartoLiteLlm, config: any) {
    return (llm as any).toolsToOpenAI(config);
  }

  it('returns undefined when no tools', () => {
    const llm = createInstance();
    expect(callToolsToOpenAI(llm, undefined)).toBeUndefined();
    expect(callToolsToOpenAI(llm, {})).toBeUndefined();
    expect(callToolsToOpenAI(llm, { tools: [] })).toBeUndefined();
  });

  it('converts FunctionDeclaration to OpenAI tool format', () => {
    const llm = createInstance();
    const config = {
      tools: [{
        functionDeclarations: [{
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING', description: 'Name field' },
            },
            required: ['name'],
          },
        }],
      }],
    };

    const tools = callToolsToOpenAI(llm, config);
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('test-tool');
    expect(tools[0].function.description).toBe('A test tool');
    expect(tools[0].function.parameters.type).toBe('object');
    expect(tools[0].function.parameters.properties.name.type).toBe('string');
  });

  it('returns undefined when functionDeclarations group produces no tools', () => {
    const llm = createInstance();
    const config = { tools: [{}] }; // no functionDeclarations
    expect(callToolsToOpenAI(llm, config)).toBeUndefined();
  });
});

// ─── convertSchemaToJsonSchema ──────────────────────────────

describe('convertSchemaToJsonSchema', () => {
  function callConvert(llm: CartoLiteLlm, schema: any) {
    return (llm as any).convertSchemaToJsonSchema(schema);
  }

  it('returns default for null/undefined schema', () => {
    const llm = createInstance();
    expect(callConvert(llm, null)).toEqual({ type: 'object', properties: {} });
    expect(callConvert(llm, undefined)).toEqual({ type: 'object', properties: {} });
  });

  it('maps Google type names to JSON Schema types', () => {
    const llm = createInstance();
    const typeMap: Record<string, string> = {
      OBJECT: 'object',
      STRING: 'string',
      NUMBER: 'number',
      INTEGER: 'integer',
      BOOLEAN: 'boolean',
      ARRAY: 'array',
    };

    for (const [googleType, jsonType] of Object.entries(typeMap)) {
      const result = callConvert(llm, { type: googleType });
      expect(result.type).toBe(jsonType);
    }
  });

  it('preserves description', () => {
    const llm = createInstance();
    const result = callConvert(llm, { type: 'STRING', description: 'A name' });
    expect(result.description).toBe('A name');
  });

  it('converts nested properties recursively', () => {
    const llm = createInstance();
    const result = callConvert(llm, {
      type: 'OBJECT',
      properties: {
        nested: {
          type: 'OBJECT',
          properties: {
            deep: { type: 'STRING' },
          },
        },
      },
    });
    expect(result.properties.nested.type).toBe('object');
    expect(result.properties.nested.properties.deep.type).toBe('string');
  });

  it('handles required fields', () => {
    const llm = createInstance();
    const result = callConvert(llm, {
      type: 'OBJECT',
      properties: { name: { type: 'STRING' } },
      required: ['name'],
    });
    expect(result.required).toEqual(['name']);
  });

  it('handles array items', () => {
    const llm = createInstance();
    const result = callConvert(llm, {
      type: 'ARRAY',
      items: { type: 'STRING' },
    });
    expect(result.type).toBe('array');
    expect(result.items.type).toBe('string');
  });

  it('handles enum values', () => {
    const llm = createInstance();
    const result = callConvert(llm, {
      type: 'STRING',
      enum: ['a', 'b', 'c'],
    });
    expect(result.enum).toEqual(['a', 'b', 'c']);
  });

  it('falls back to lowercase for unknown types', () => {
    const llm = createInstance();
    const result = callConvert(llm, { type: 'CustomType' });
    expect(result.type).toBe('customtype');
  });
});

// ─── generateContentAsync (non-streaming) ────────────────────

describe('generateContentAsync', () => {
  let llm: CartoLiteLlm;

  beforeEach(() => {
    llm = createInstance();
  });

  it('yields a text response for non-streaming', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: 'Hello!',
          tool_calls: undefined,
        },
      }],
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, false)) {
      responses.push(r);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].content.role).toBe('model');
    expect(responses[0].content.parts[0].text).toBe('Hello!');
  });

  it('yields tool calls in response', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'set-deck-state',
              arguments: '{"zoom":10}',
            },
          }],
        },
      }],
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Zoom in' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, false)) {
      responses.push(r);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].content.parts[0].functionCall.name).toBe('set-deck-state');
    expect(responses[0].content.parts[0].functionCall.id).toBe('call_abc');
    expect(responses[0].content.parts[0].functionCall.args).toEqual({ zoom: 10 });
  });

  it('yields error response on API error', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    const apiError = new Error('Rate limit exceeded');
    (apiError as any).status = 429;
    mockCreate.mockRejectedValueOnce(apiError);

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, false)) {
      responses.push(r);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].errorCode).toBe('429');
    expect(responses[0].errorMessage).toContain('Rate limit');
  });

  it('handles systemInstruction as string', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'OK' } }],
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: { systemInstruction: 'Be helpful' },
    };

    for await (const _r of llm.generateContentAsync(llmRequest, false)) {
      // consume
    }

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Be helpful' });
  });

  it('handles systemInstruction as Content object', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'OK' } }],
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {
        systemInstruction: {
          parts: [{ text: 'System prompt here' }],
        },
      },
    };

    for await (const _r of llm.generateContentAsync(llmRequest, false)) {
      // consume
    }

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'System prompt here' });
  });
});

// ─── generateContentAsync (streaming) ────────────────────────

describe('generateContentAsync (streaming)', () => {
  let llm: CartoLiteLlm;

  beforeEach(() => {
    llm = createInstance();
  });

  it('yields partial text chunks then final response', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;

    // Simulate a streaming response with async iterable
    const chunks = [
      { choices: [{ delta: { content: 'Hel' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'lo!' }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ];

    mockCreate.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) yield chunk;
      },
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, true)) {
      responses.push(r);
    }

    // 2 partial text chunks + 1 final
    expect(responses.length).toBe(3);
    expect(responses[0].partial).toBe(true);
    expect(responses[0].content.parts[0].text).toBe('Hel');
    expect(responses[1].partial).toBe(true);
    expect(responses[1].content.parts[0].text).toBe('Hello!');
    expect(responses[2].partial).toBe(false);
    expect(responses[2].turnComplete).toBe(true);
  });

  it('yields tool calls from streaming chunks', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;

    const chunks = [
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_stream',
              function: { name: 'set-deck-state', arguments: '{"zo' },
            }],
          },
          finish_reason: null,
        }],
      },
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: 'om":5}' },
            }],
          },
          finish_reason: null,
        }],
      },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ];

    mockCreate.mockResolvedValueOnce({
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) yield chunk;
      },
    });

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Zoom in' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, true)) {
      responses.push(r);
    }

    const final = responses[responses.length - 1];
    expect(final.content.parts[0].functionCall.name).toBe('set-deck-state');
    expect(final.content.parts[0].functionCall.args).toEqual({ zoom: 5 });
    expect(final.content.parts[0].functionCall.id).toBe('call_stream');
  });

  it('yields error response on streaming API error', async () => {
    const mockCreate = (llm as any).client.chat.completions.create;
    const apiError = new Error('Connection reset');
    (apiError as any).status = 500;
    mockCreate.mockRejectedValueOnce(apiError);

    const llmRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      config: {},
    };

    const responses: any[] = [];
    for await (const r of llm.generateContentAsync(llmRequest, true)) {
      responses.push(r);
    }

    expect(responses).toHaveLength(1);
    expect(responses[0].errorCode).toBe('500');
  });
});

// ─── Tool call ID round-tripping ─────────────────────────────

describe('tool call ID round-tripping', () => {
  it('stores OpenAI tool_call ID and maps it back via functionResponse', () => {
    const llm = createInstance();

    // Simulate receiving an OpenAI response with tool calls
    const choice = {
      message: {
        content: null,
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: { name: 'my-tool', arguments: '{}' },
        }],
      },
    };

    // Call the private method to process the response
    const response = (llm as any).openaiResponseToLlmResponse(choice);

    // The functionCall should preserve the OpenAI ID
    expect(response.content.parts[0].functionCall.id).toBe('call_abc123');
    expect(response.content.parts[0].functionCall.name).toBe('my-tool');

    // Now when converting a functionResponse back, it should use the stored ID
    const messages = (llm as any).contentsToMessages([
      {
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'my-tool',
            id: 'call_abc123',
            response: { success: true },
          },
        }],
      },
    ]);

    expect(messages[0].role).toBe('tool');
    expect(messages[0].tool_call_id).toBe('call_abc123');
  });
});
