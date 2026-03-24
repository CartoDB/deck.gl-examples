/**
 * Custom tools for Vercel AI SDK v6
 *
 * Define custom backend-executed tools here.
 * These tools run on the server (unlike map tools which execute on the frontend).
 */

import { tool, type Tool } from 'ai';
import { z } from 'zod';

const CARTO_LDS_API_BASE_URL = process.env.CARTO_LDS_API_BASE_URL;
const CARTO_LDS_API_KEY = process.env.CARTO_LDS_API_KEY;

/**
 * LDS Geocode tool - converts addresses, cities, or countries to coordinates using CARTO LDS API
 */
const ldsGeocodeTool = tool({
  description: 'Get the coordinates in latitude and longitude of an address or city using CARTO LDS geocoding API. Country is required, and at least one of address or city must be provided.',
  inputSchema: z.object({
    address: z.string().optional().describe('Full address or street address to geocode'),
    city: z.string().optional().describe('City name to geocode'),
    country: z.string().describe('ISO 3166-1 alpha-2 country code (e.g., "ES", "US", "FR", "DE"). Must be a 2-letter code, not a full country name. Required.'),
  }),
  execute: async ({ address, city, country }) => {
    console.log('[Geocode] ============ EXECUTE FUNCTION CALLED ============');
    console.log('[Geocode] Input parameters:', { address, city, country });
    console.log('[Geocode] CARTO_LDS_API_KEY configured:', !!CARTO_LDS_API_KEY);
    console.log('[Geocode] CARTO_LDS_API_BASE_URL:', CARTO_LDS_API_BASE_URL);

    // Validate that at least address or city is provided (country is required by schema)
    if (!address && !city) {
      console.log('[Geocode] ERROR: Neither address nor city provided');
      return {
        error: 'At least one of address or city must be provided (country is required)',
      };
    }

    console.log('[Geocode] Validation passed');

    // Check if CARTO_LDS_API_KEY is configured
    if (!CARTO_LDS_API_KEY) {
      console.error('[Geocode] ERROR: CARTO_LDS_API_KEY environment variable is not set');
      return {
        error: 'Geocoding service is not configured. CARTO_LDS_API_KEY is missing.',
      };
    }

    console.log('[Geocode] CARTO_LDS_API_KEY check passed');

    try {
      // Build query parameters
      const params = new URLSearchParams();

      // Combine address and city into the address parameter for the API
      const addressParts: string[] = [];
      if (address) addressParts.push(address);
      if (city) addressParts.push(city);

      console.log('[Geocode] Address parts:', addressParts);

      if (addressParts.length > 0) {
        params.append('address', addressParts.join(', '));
      }

      if (country) {
        params.append('country', country);
      }

      const url = `${CARTO_LDS_API_BASE_URL}?${params.toString()}`;

      console.log('[Geocode] ======================================');
      console.log('[Geocode] URL:', url);
      console.log('[Geocode] Query params:', params.toString());
      console.log('[Geocode] ======================================');
      console.log('[Geocode] Making fetch request...');

      // Make request to CARTO LDS API
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
        console.error('[Geocode] API error status:', response.status, response.statusText);
        return {
          error: `Geocoding API error: ${response.status} ${response.statusText}`,
        };
      }

      console.log('[Geocode] Response OK, parsing JSON...');
      const data = await response.json();
      console.log('[Geocode] Response data (first 500 chars):', JSON.stringify(data).substring(0, 500));
      console.log('[Geocode] Response structure:', Array.isArray(data) ? 'Array' : typeof data);

      // The CARTO LDS API returns an array with objects containing error and value properties
      // Format: [{"error": null, "value": [{"latitude": ..., "longitude": ..., ...}]}]
      if (Array.isArray(data) && data.length > 0) {
        console.log('[Geocode] Processing array response...');
        const firstResult = data[0];

        console.log('[Geocode] First result error:', firstResult.error);
        console.log('[Geocode] First result value:', firstResult.value ? `${firstResult.value.length} items` : 'null');

        if (firstResult.error) {
          console.log('[Geocode] API returned error:', firstResult.error);
          return {
            error: `Geocoding error: ${firstResult.error}`,
            query: { address, city, country },
          };
        }

        if (firstResult.value && Array.isArray(firstResult.value) && firstResult.value.length > 0) {
          const location = firstResult.value[0];
          console.log('[Geocode] Location data:', location);

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
            return result;
          }
        }
      }

      // If no results found
      console.log('[Geocode] No valid results found in response');
      return {
        error: 'No results found for the provided location',
        query: { address, city, country },
      };

    } catch (error) {
      console.error('[Geocode] EXCEPTION caught:', error);
      console.error('[Geocode] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        error: error instanceof Error ? error.message : 'Unknown geocoding error',
      };
    }
  },
});

/**
 * Get all custom tools
 *
 * Returns a record of tool name -> Tool object
 */
export function getCustomTools(): Record<string, Tool> {
  return {
    'lds-geocode': ldsGeocodeTool,
  };
}

/**
 * Get custom tool names
 */
export function getCustomToolNames(): string[] {
  return Object.keys(getCustomTools());
}
