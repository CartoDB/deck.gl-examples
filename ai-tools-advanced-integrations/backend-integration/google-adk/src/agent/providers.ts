/**
 * CARTO LLM Provider for Google ADK
 *
 * Instantiates CartoLiteLlm and provides model access.
 * Simpler than the OpenAI Agents SDK version — no setDefaultOpenAIClient needed.
 */

import { CartoLiteLlm } from '../models/carto-litellm.js';

let modelInstance: CartoLiteLlm | undefined;

/**
 * Get the CartoLiteLlm model instance (lazy singleton)
 */
export function getModel(): CartoLiteLlm {
  if (!modelInstance) {
    const baseURL = process.env.CARTO_AI_API_BASE_URL!;
    const apiKey = process.env.CARTO_AI_API_KEY!;
    const model = getModelName();
    modelInstance = new CartoLiteLlm({ model, baseURL, apiKey });
  }
  return modelInstance;
}

/**
 * Get the configured model name
 */
export function getModelName(): string {
  return process.env.CARTO_AI_API_MODEL || 'gpt-4o';
}
