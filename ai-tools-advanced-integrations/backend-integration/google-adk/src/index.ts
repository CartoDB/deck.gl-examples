/**
 * Backend Google ADK Entry Point
 */

import 'dotenv/config';
import { startServer } from './server.js';
import { getModelName } from './agent/providers.js';
import { initializeMCPClients } from './agent/mcp-tools.js';

// Check for CARTO API credentials
const hasCarto = !!process.env.CARTO_AI_API_KEY && !!process.env.CARTO_AI_API_BASE_URL;

if (!hasCarto) {
  console.error('Error: CARTO API credentials are required');
  console.error('Please set CARTO_AI_API_KEY and CARTO_AI_API_BASE_URL');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT || '3003', 10);

/**
 * Fetch available models from LiteLLM endpoint
 */
async function fetchAvailableModels(): Promise<string[]> {
  const baseUrl = process.env.CARTO_AI_API_BASE_URL;
  const apiKey = process.env.CARTO_AI_API_KEY;

  if (!baseUrl || !apiKey) {
    return [];
  }

  try {
    const modelsUrl = `${baseUrl}/models`;
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-litellm-api-key': apiKey,
      },
    });

    if (!response.ok) {
      console.warn(`[Models] Failed to fetch models: ${response.status}`);
      return [];
    }

    const data = await response.json() as { data?: Array<{ id?: string }> };

    // Extract model IDs from the response
    if (data.data && Array.isArray(data.data)) {
      return data.data
        .map((model) => model.id)
        .filter((id): id is string => typeof id === 'string')
        .sort();
    }

    return [];
  } catch (error) {
    console.warn(`[Models] Error fetching models: ${(error as Error).message}`);
    return [];
  }
}

async function main() {
  console.log('Starting Google ADK backend...');
  console.log(`Current model: ${getModelName()}`);

  // Fetch and display available models
  const models = await fetchAvailableModels();
  if (models.length > 0) {
    console.log('[Models] Available models at CARTO:');
    models.forEach((model) => console.log(`  - ${model}`));
  }

  // Initialize MCP clients (if configured)
  try {
    await initializeMCPClients();
  } catch (error) {
    console.error('MCP initialization failed:', (error as Error).message);
  }

  startServer(PORT);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
