/**
 * Semantic configuration for the application.
 *
 * Fetches welcome chips and message from the backend semantic model.
 * Falls back to hardcoded defaults if the backend is unavailable.
 */

export interface WelcomeChip {
  id: string;
  label: string;
  prompt: string;
}

export interface SemanticConfig {
  welcomeMessage: string;
  welcomeChips: WelcomeChip[];
}

/** Hardcoded fallback config used when backend is unreachable */
const FALLBACK_CONFIG: SemanticConfig = {
  welcomeMessage:
    'Welcome! Ask me about county demographics, education levels, election results, or spatial features across the US.',
  welcomeChips: [
    {
      id: 'high_education_counties',
      label: 'Counties with 40%+ higher education',
      prompt:
        'Show me counties where more than 40% of residents have higher education',
    },
    {
      id: 'population_density_urban',
      label: 'Population density in urban areas',
      prompt:
        'Show population density by H3 cell filtering by urban areas (High_density_urban, Very_High_density_urban, Low_density_urban, Medium_density_urban)',
    },
    {
      id: 'demographics_buffer_nyc',
      label: 'MCP Demographics around Times Square',
      prompt:
        'What are the demographics within 5 minutes driving of Times Square, New York?',
    },
    {
      id: 'healthcare_pois_manhattan',
      label: 'MCP Healthcare POIs near Central Park',
      prompt:
        'Find healthcare points of interest within 2 km of Central Park, New York',
    },
  ],
};

/**
 * Fetch semantic config from the backend.
 * Returns fallback config on failure.
 */
export async function fetchSemanticConfig(
  apiBaseUrl = 'http://localhost:3003'
): Promise<SemanticConfig> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/semantic-config`);
    if (!response.ok) {
      console.warn(
        '[SemanticConfig] Backend returned non-OK status, using fallback'
      );
      return FALLBACK_CONFIG;
    }
    const data = (await response.json()) as SemanticConfig;
    // If backend returns empty chips, use fallback
    if (!data.welcomeChips || data.welcomeChips.length === 0) {
      return FALLBACK_CONFIG;
    }
    return data;
  } catch {
    console.warn(
      '[SemanticConfig] Could not fetch from backend, using fallback'
    );
    return FALLBACK_CONFIG;
  }
}

/** Synchronous access to fallback config (for components that can't await) */
export const SEMANTIC_CONFIG = FALLBACK_CONFIG;
