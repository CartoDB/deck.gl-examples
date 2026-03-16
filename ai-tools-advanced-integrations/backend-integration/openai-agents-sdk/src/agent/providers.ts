/**
 * CARTO LLM Provider for OpenAI Agents SDK
 *
 * Configures the OpenAI client and model for use with the Agents SDK.
 * Uses CARTO's LiteLLM proxy which speaks OpenAI-compatible Chat Completions protocol.
 */

import OpenAI from 'openai';
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  OpenAIChatCompletionsModel,
} from '@openai/agents';
import { setTracingDisabled } from '@openai/agents';
import type { Model } from '@openai/agents';

// Store configured client for model creation
let configuredClient: OpenAI | undefined;

/**
 * Configure the OpenAI provider for the Agents SDK
 *
 * Creates an OpenAI client pointed at CARTO_AI_API_BASE_URL and registers it
 * as the default client for the SDK. Uses chat_completions API type since
 * CARTO's LiteLLM proxy speaks OpenAI-compatible Chat Completions protocol.
 */
export function configureProvider(): void {
  const CARTO_AI_API_BASE_URL = process.env.CARTO_AI_API_BASE_URL;
  const CARTO_AI_API_KEY = process.env.CARTO_AI_API_KEY;

  if (!CARTO_AI_API_BASE_URL || !CARTO_AI_API_KEY) {
    throw new Error('CARTO_AI_API_BASE_URL and CARTO_AI_API_KEY are required');
  }

  const client = new OpenAI({
    baseURL: CARTO_AI_API_BASE_URL,
    apiKey: CARTO_AI_API_KEY,
  });

  configuredClient = client;

  // Cast needed: top-level `openai` package may have different types than
  // the nested copy inside `@openai/agents-openai/node_modules/openai`
  // but they are runtime-compatible
  setDefaultOpenAIClient(client as any);
  setOpenAIAPI('chat_completions');
  setTracingDisabled(true);
}

/**
 * Get the configured model for use with Agent
 */
export function getModel(): Model {
  const modelName = getModelName();
  // OpenAIChatCompletionsModel constructor: (client: OpenAI, model: string)
  return new OpenAIChatCompletionsModel(configuredClient as any, modelName);
}

/**
 * Get the configured model name
 */
export function getModelName(): string {
  return process.env.CARTO_AI_API_MODEL || 'gpt-4o';
}
