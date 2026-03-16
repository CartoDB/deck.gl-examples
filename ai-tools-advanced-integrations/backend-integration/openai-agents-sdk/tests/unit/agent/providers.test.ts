import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock OpenAI constructor as a class
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      baseURL: string;
      apiKey: string;
      constructor(opts: { baseURL: string; apiKey: string }) {
        this.baseURL = opts.baseURL;
        this.apiKey = opts.apiKey;
      }
    },
  };
});

// Mock @openai/agents - providers.ts imports from here
vi.mock('@openai/agents', () => ({
  setDefaultOpenAIClient: vi.fn(),
  setOpenAIAPI: vi.fn(),
  setTracingDisabled: vi.fn(),
  OpenAIChatCompletionsModel: class MockModel {
    client: unknown;
    modelId: string;
    constructor(client: unknown, model: string) {
      this.client = client;
      this.modelId = model;
    }
  },
}));

import { configureProvider, getModel, getModelName } from '../../../src/agent/providers.js';
import { setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';

describe('configureProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when CARTO_AI_API_BASE_URL is missing', () => {
    process.env.CARTO_AI_API_KEY = 'test-key';
    delete process.env.CARTO_AI_API_BASE_URL;
    expect(() => configureProvider()).toThrow('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  });

  it('throws when CARTO_AI_API_KEY is missing', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    delete process.env.CARTO_AI_API_KEY;
    expect(() => configureProvider()).toThrow('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  });

  it('configures provider when both env vars are set', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';

    configureProvider();

    expect(setDefaultOpenAIClient).toHaveBeenCalledOnce();
    expect(setOpenAIAPI).toHaveBeenCalledWith('chat_completions');
    expect(setTracingDisabled).toHaveBeenCalledWith(true);
  });
});

describe('getModelName', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default model when env var is not set', () => {
    delete process.env.CARTO_AI_API_MODEL;
    expect(getModelName()).toBe('gpt-4o');
  });

  it('returns configured model when env var is set', () => {
    process.env.CARTO_AI_API_MODEL = 'gpt-4-turbo';
    expect(getModelName()).toBe('gpt-4-turbo');
  });
});

describe('getModel', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    vi.clearAllMocks();
    // Need to configure provider first to set the client
    configureProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a model instance', () => {
    process.env.CARTO_AI_API_MODEL = 'gpt-4o';
    const model = getModel();
    expect(model).toBeDefined();
    expect((model as any).modelId).toBe('gpt-4o');
  });
});
