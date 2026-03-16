/**
 * User Context Types
 *
 * Structured user selections for business location analysis.
 * This context is passed to the AI to provide relevant analysis scope.
 */

/**
 * Priority weighting for proximity analysis
 */
export interface ProximityWeight {
  id: string;
  name: string;
  weight: number; // 1-10 scale
}

/**
 * User context for business location analysis
 */
export interface UserContext {
  /**
   * Target country for analysis (default: United States)
   */
  country?: string;

  /**
   * Type of business being analyzed
   * Maps to business_types in semantic layer
   */
  businessType?: string;

  /**
   * Selected demographic factors to consider
   */
  demographics?: string[];

  /**
   * Weighted proximity priorities for POI analysis
   */
  proximityPriorities?: ProximityWeight[];

  /**
   * Optional: specific area/region of interest
   */
  targetArea?: {
    name?: string;
    bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  };
}
