/**
 * CARTO LLM Provider for Vercel AI SDK v6
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * Get the CARTO language model
 */
export function getProvider(): LanguageModel {
  const CARTO_AI_API_BASE_URL = process.env.CARTO_AI_API_BASE_URL;
  const CARTO_AI_API_KEY = process.env.CARTO_AI_API_KEY;
  const CARTO_AI_API_MODEL = process.env.CARTO_AI_API_MODEL || 'gpt-4o';
  const CARTO_AI_API_TYPE = process.env.CARTO_AI_API_TYPE || 'chat';

  if (!CARTO_AI_API_BASE_URL || !CARTO_AI_API_KEY) {
    throw new Error('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  }

  const carto = createOpenAI({
    baseURL: CARTO_AI_API_BASE_URL,
    apiKey: CARTO_AI_API_KEY,
    name: 'carto',
  });

  // Use 'chat' for LiteLLM/proxies, 'responses' for native OpenAI Agents API
  if (CARTO_AI_API_TYPE === 'responses') {
    return carto.responses(CARTO_AI_API_MODEL);
  }
  return carto.chat(CARTO_AI_API_MODEL);
}
