/**
 * Custom tools for OpenAI Agents SDK
 *
 * Define custom backend-executed tools here.
 * These tools run on the server (unlike map tools which execute on the frontend).
 */

import { tool, type FunctionTool } from '@openai/agents';
import { z } from 'zod';

const CARTO_LDS_API_BASE_URL = process.env.CARTO_LDS_API_BASE_URL;
const CARTO_LDS_API_KEY = process.env.CARTO_LDS_API_KEY;

/**
 * LDS Geocode tool - converts addresses, cities, or countries to coordinates using CARTO LDS API
 */
const geocodeSchema = z.object({
  address: z.string().optional().describe('Full address or street address to geocode'),
  city: z.string().optional().describe('City name to geocode'),
  country: z.string().describe('ISO 3166-1 alpha-2 country code (e.g., "ES", "US", "FR", "DE"). Must be a 2-letter code, not a full country name. Required.'),
});

const ldsGeocodeTool = tool({
  name: 'lds-geocode',
  description: 'Get the coordinates in latitude and longitude of an address or city using CARTO LDS geocoding API. Country is required, and at least one of address or city must be provided.',
  // Pre-convert Zod v4 to JSON Schema (see tools.ts zodV4ToJsonSchema docs)
  parameters: z.toJSONSchema(geocodeSchema) as any,
  strict: false,
  execute: async (input: unknown) => {
    const { address, city, country } = input as { address?: string; city?: string; country: string };
    console.log('[Geocode] ============ EXECUTE FUNCTION CALLED ============');
    console.log('[Geocode] Input parameters:', { address, city, country });
    console.log('[Geocode] CARTO_LDS_API_KEY configured:', !!CARTO_LDS_API_KEY);
    console.log('[Geocode] CARTO_LDS_API_BASE_URL:', CARTO_LDS_API_BASE_URL);

    // Validate that at least address or city is provided (country is required by schema)
    if (!address && !city) {
      console.log('[Geocode] ERROR: Neither address nor city provided');
      return JSON.stringify({
        error: 'At least one of address or city must be provided (country is required)',
      });
    }

    // Check if CARTO_LDS_API_KEY is configured
    if (!CARTO_LDS_API_KEY) {
      console.error('[Geocode] ERROR: CARTO_LDS_API_KEY environment variable is not set');
      return JSON.stringify({
        error: 'Geocoding service is not configured. CARTO_LDS_API_KEY is missing.',
      });
    }

    try {
      // Build query parameters
      const params = new URLSearchParams();
      const addressParts: string[] = [];
      if (address) addressParts.push(address);
      if (city) addressParts.push(city);

      if (addressParts.length > 0) {
        params.append('address', addressParts.join(', '));
      }

      if (country) {
        params.append('country', country);
      }

      const url = `${CARTO_LDS_API_BASE_URL}?${params.toString()}`;
      console.log('[Geocode] URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CARTO_LDS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[Geocode] Fetch completed. Status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Geocode] API error response:', errorText);
        return JSON.stringify({
          error: `Geocoding API error: ${response.status} ${response.statusText}`,
        });
      }

      const data = await response.json();
      console.log('[Geocode] Response data (first 500 chars):', JSON.stringify(data).substring(0, 500));

      // The CARTO LDS API returns an array with objects containing error and value properties
      if (Array.isArray(data) && data.length > 0) {
        const firstResult = data[0];

        if (firstResult.error) {
          return JSON.stringify({
            error: `Geocoding error: ${firstResult.error}`,
            query: { address, city, country },
          });
        }

        if (firstResult.value && Array.isArray(firstResult.value) && firstResult.value.length > 0) {
          const location = firstResult.value[0];

          if (location.latitude !== undefined && location.longitude !== undefined) {
            const result = {
              latitude: location.latitude,
              longitude: location.longitude,
              address: location.streetName || addressParts.join(', '),
              city: location.city || city,
              state: location.state,
              country: location.country || country,
              countryCode: location.countryCode,
              matchConfidence: location.matchConfidence,
              provider: location.provider,
            };

            console.log('[Geocode] SUCCESS - Returning result:', result);
            return JSON.stringify(result);
          }
        }
      }

      // If no results found
      console.log('[Geocode] No valid results found in response');
      return JSON.stringify({
        error: 'No results found for the provided location',
        query: { address, city, country },
      });

    } catch (error) {
      console.error('[Geocode] EXCEPTION caught:', error);
      return JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown geocoding error',
      });
    }
  },
});

/**
 * Get all custom tools as FunctionTool array
 */
export function getCustomTools(): FunctionTool[] {
  return [ldsGeocodeTool];
}

/**
 * Get custom tool names
 */
export function getCustomToolNames(): string[] {
  return getCustomTools().map((t) => t.name);
}
