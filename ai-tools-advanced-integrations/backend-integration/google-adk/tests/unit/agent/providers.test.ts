import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock CartoLiteLlm constructor
vi.mock('../../../src/models/carto-litellm.js', () => ({
  CartoLiteLlm: class MockCartoLiteLlm {
    model: string;
    baseURL: string;
    apiKey: string;
    constructor(opts: { model: string; baseURL: string; apiKey: string }) {
      this.model = opts.model;
      this.baseURL = opts.baseURL;
      this.apiKey = opts.apiKey;
    }
  },
}));

// Import after mock — must re-import per test to reset the singleton
describe('getModelName', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default model when env var is not set', async () => {
    delete process.env.CARTO_AI_API_MODEL;
    vi.resetModules();
    const { getModelName } = await import('../../../src/agent/providers.js');
    expect(getModelName()).toBe('gpt-4o');
  });

  it('returns configured model when env var is set', async () => {
    process.env.CARTO_AI_API_MODEL = 'gpt-4-turbo';
    vi.resetModules();
    const { getModelName } = await import('../../../src/agent/providers.js');
    expect(getModelName()).toBe('gpt-4-turbo');
  });
});

describe('getModel', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CARTO_AI_API_BASE_URL = 'https://test.example.com';
    process.env.CARTO_AI_API_KEY = 'test-key';
    process.env.CARTO_AI_API_MODEL = 'gpt-4o';
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a CartoLiteLlm instance', async () => {
    const { getModel } = await import('../../../src/agent/providers.js');
    const model = getModel();
    expect(model).toBeDefined();
    expect((model as any).model).toBe('gpt-4o');
  });

  it('returns singleton on repeated calls', async () => {
    const { getModel } = await import('../../../src/agent/providers.js');
    const model1 = getModel();
    const model2 = getModel();
    expect(model1).toBe(model2);
  });

  it('passes env vars to CartoLiteLlm constructor', async () => {
    const { getModel } = await import('../../../src/agent/providers.js');
    const model = getModel() as any;
    expect(model.baseURL).toBe('https://test.example.com');
    expect(model.apiKey).toBe('test-key');
  });
});
