import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock @ai-sdk/openai
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ type: 'chat', modelId: model })),
    responses: vi.fn((model: string) => ({ type: 'responses', modelId: model })),
  })),
}));

import { getProvider } from '../../../src/agent/providers.js';
import { createOpenAI } from '@ai-sdk/openai';

describe('getProvider', () => {
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
    expect(() => getProvider()).toThrow('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  });

  it('throws when CARTO_AI_API_KEY is missing', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    delete process.env.CARTO_AI_API_KEY;
    expect(() => getProvider()).toThrow('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  });

  it('calls createOpenAI with correct config', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';

    getProvider();

    expect(createOpenAI).toHaveBeenCalledWith({
      baseURL: 'https://test.example.com',
      apiKey: 'test-key',
      name: 'carto',
    });
  });

  it('defaults to gpt-4o model', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    delete process.env.CARTO_AI_API_MODEL;

    const model = getProvider() as any;
    expect(model.modelId).toBe('gpt-4o');
  });

  it('uses configured model from env var', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    process.env.CARTO_AI_API_MODEL = 'gpt-4-turbo';

    const model = getProvider() as any;
    expect(model.modelId).toBe('gpt-4-turbo');
  });

  it('defaults to chat API type', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    delete process.env.CARTO_AI_API_TYPE;

    const model = getProvider() as any;
    expect(model.type).toBe('chat');
  });

  it('uses responses API type when configured', () => {
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    process.env.CARTO_AI_API_TYPE = 'responses';

    const model = getProvider() as any;
    expect(model.type).toBe('responses');
  });
});
