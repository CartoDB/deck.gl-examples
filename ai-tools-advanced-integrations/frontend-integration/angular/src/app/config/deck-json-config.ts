/**
 * @deck.gl/json Configuration for Angular frontend
 *
 * Provides full JSONConverter integration for:
 * - @@# constant references (colors, interpolators)
 * - @@= accessor expressions
 * - @@function custom function calls
 * - @@type class instantiation
 *
 * Adapted from frontend-vanilla/src/config/deckJsonConfig.ts
 */

import { JSONConverter, _parseExpressionString as parseExpressionString } from '@deck.gl/json';
import { FlyToInterpolator, LinearInterpolator, COORDINATE_SYSTEM } from '@deck.gl/core';
import { Tile3DLayer, TripsLayer } from '@deck.gl/geo-layers';
import {
  GeoJsonLayer,
  PathLayer,
  ScatterplotLayer,
  IconLayer,
  ArcLayer,
  LineLayer,
  PolygonLayer,
  PointCloudLayer,
  TextLayer
} from '@deck.gl/layers';
import {
  VectorTileLayer,
  H3TileLayer,
  QuadbinTileLayer,
  RasterTileLayer,
  vectorTableSource,
  vectorQuerySource,
  vectorTilesetSource,
  h3TableSource,
  h3QuerySource,
  h3TilesetSource,
  quadbinTableSource,
  quadbinQuerySource,
  quadbinTilesetSource,
  rasterSource,
  colorBins,
  colorCategories,
  colorContinuous
} from '@deck.gl/carto';
import { environment } from '../../environments/environment';

/**
 * Color constants for JSONConverter @@# references
 */
const COLOR_CONSTANTS: Record<string, number[]> = {
  // Primary colors
  Red: [255, 0, 0, 200],
  Green: [0, 255, 0, 200],
  Blue: [0, 0, 255, 200],
  // Secondary colors
  Yellow: [255, 255, 0, 200],
  Orange: [255, 165, 0, 200],
  Purple: [128, 0, 128, 200],
  Pink: [255, 192, 203, 200],
  Cyan: [0, 255, 255, 200],
  Magenta: [255, 0, 255, 200],
  // Neutral colors
  White: [255, 255, 255, 255],
  Black: [0, 0, 0, 255],
  Gray: [128, 128, 128, 200],
  LightGray: [192, 192, 192, 200],
  DarkGray: [64, 64, 64, 200],
  // Semantic colors
  Success: [16, 185, 129, 200],
  Warning: [245, 158, 11, 200],
  Error: [239, 68, 68, 200],
  Info: [59, 130, 246, 200],
  // Transparent
  Transparent: [0, 0, 0, 0],
  // Additional colors
  Brown: [139, 69, 19, 200],
  Navy: [0, 0, 128, 200],
  Olive: [128, 128, 0, 200],
  Teal: [0, 128, 128, 200],
  Silver: [192, 192, 192, 200],
  Gold: [255, 215, 0, 200],
  Indigo: [75, 0, 130, 200],
  Violet: [238, 130, 238, 200],
  // CARTO brand colors
  CartoPrimary: [3, 111, 226, 200],
  CartoSecondary: [255, 255, 255, 255],
};

/**
 * Get CARTO credentials from environment
 */
function getCartoCredentials() {
  return {
    apiBaseUrl: environment.apiBaseUrl,
    accessToken: environment.accessToken,
    connectionName: environment.connectionName,
  };
}

/**
 * Custom functions for JSONConverter @@function references
 */
const CUSTOM_FUNCTIONS: Record<string, (config: any) => any> = {
  /**
   * Create a color with custom alpha
   */
  colorWithAlpha: ({ color, alpha }: { color: string | number[], alpha: number }) => {
    const baseColor = typeof color === 'string'
      ? COLOR_CONSTANTS[color] || [128, 128, 128, 200]
      : color;
    return [baseColor[0], baseColor[1], baseColor[2], alpha];
  },

  /**
   * Scale a value by a factor
   */
  scale: ({ value, factor }: { value: number, factor: number }) => value * factor,

  /**
   * Clamp a value between min and max
   */
  clamp: ({ value, min, max }: { value: number, min: number, max: number }) =>
    Math.max(min, Math.min(max, value)),

  /**
   * Linear interpolation between two values
   */
  lerp: ({ a, b, t }: { a: number, b: number, t: number }) => a + (b - a) * t,

  /**
   * Create accessor function for property-based coloring
   */
  propertyColor: ({
    property,
    min,
    max,
    lowColor,
    highColor
  }: {
    property: string,
    min: number,
    max: number,
    lowColor: string | number[],
    highColor: string | number[]
  }) => {
    const low = typeof lowColor === 'string' ? COLOR_CONSTANTS[lowColor] : lowColor;
    const high = typeof highColor === 'string' ? COLOR_CONSTANTS[highColor] : highColor;

    return (d: any) => {
      const value = d.properties?.[property] ?? d[property] ?? 0;
      const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return [
        Math.round(low[0] + (high[0] - low[0]) * t),
        Math.round(low[1] + (high[1] - low[1]) * t),
        Math.round(low[2] + (high[2] - low[2]) * t),
        Math.round((low[3] ?? 255) + ((high[3] ?? 255) - (low[3] ?? 255)) * t),
      ];
    };
  },

  // ============================================================================
  // CARTO Data Sources
  // ============================================================================

  /**
   * Vector table source - vector tiles from CARTO table
   * Supports CARTO column filters for server-side data filtering
   */
  vectorTableSource: (config: any) => {
    console.log('[CARTO Source] vectorTableSource config:', config);

    // Validate required fields
    if (!config.tableName) {
      console.error('[CARTO Source] vectorTableSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
      columns: config.columns,
      spatialDataColumn: config.spatialDataColumn,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] vectorTableSource filters:', config.filters);
    }

    console.log('[CARTO Source] vectorTableSource resolved config:', sourceConfig);

    const result = vectorTableSource(sourceConfig);

    // Log promise resolution
    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] vectorTableSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length,
          accessToken: resolved?.accessToken ? '[PRESENT]' : '[MISSING]'
        }),
        (error: any) => console.error('[CARTO Source] vectorTableSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Vector query source - vector tiles from SQL query
   * Supports CARTO column filters for server-side data filtering
   */
  vectorQuerySource: (config: any) => {
    console.log('[CARTO Source] vectorQuerySource config:', config);

    // Validate required fields
    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] vectorQuerySource missing sqlQuery or sql');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      sqlQuery: sqlQuery,
      spatialDataColumn: config.spatialDataColumn,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] vectorQuerySource filters:', config.filters);
    }

    console.log('[CARTO Source] vectorQuerySource resolved config:', {
      ...sourceConfig,
      sqlQuery: sqlQuery.substring(0, 100) + (sqlQuery.length > 100 ? '...' : '')
    });

    const result = vectorQuerySource(sourceConfig);

    // Log promise resolution
    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] vectorQuerySource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length,
          accessToken: resolved?.accessToken ? '[PRESENT]' : '[MISSING]'
        }),
        (error: any) => console.error('[CARTO Source] vectorQuerySource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Vector tileset source - pre-computed vector tilesets
   */
  vectorTilesetSource: (config: any) => {
    console.log('[CARTO Source] vectorTilesetSource config:', config);

    // Validate required fields
    if (!config.tableName) {
      console.error('[CARTO Source] vectorTilesetSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    };

    console.log('[CARTO Source] vectorTilesetSource resolved config:', sourceConfig);

    const result = vectorTilesetSource(sourceConfig);

    // Log promise resolution
    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] vectorTilesetSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length,
          accessToken: resolved?.accessToken ? '[PRESENT]' : '[MISSING]'
        }),
        (error: any) => console.error('[CARTO Source] vectorTilesetSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * H3 table source - H3 hexagonal grid data from table
   * Supports CARTO column filters for server-side data filtering
   */
  h3TableSource: (config: any) => {
    console.log('[CARTO Source] h3TableSource config:', config);

    if (!config.tableName) {
      console.error('[CARTO Source] h3TableSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] h3TableSource filters:', config.filters);
    }

    const result = h3TableSource(sourceConfig);

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] h3TableSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] h3TableSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * H3 query source - H3 data from SQL query
   * Supports CARTO column filters for server-side data filtering
   */
  h3QuerySource: (config: any) => {
    console.log('[CARTO Source] h3QuerySource config:', config);

    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] h3QuerySource missing sqlQuery or sql');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      sqlQuery: sqlQuery,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] h3QuerySource filters:', config.filters);
    }

    const result = h3QuerySource(sourceConfig);

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] h3QuerySource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] h3QuerySource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * H3 tileset source - pre-computed H3 tilesets
   */
  h3TilesetSource: (config: any) => {
    console.log('[CARTO Source] h3TilesetSource config:', config);

    if (!config.tableName) {
      console.error('[CARTO Source] h3TilesetSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const result = h3TilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] h3TilesetSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] h3TilesetSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Quadbin table source - quadbin spatial index data from table
   * Supports CARTO column filters for server-side data filtering
   */
  quadbinTableSource: (config: any) => {
    console.log('[CARTO Source] quadbinTableSource config:', config);

    if (!config.tableName) {
      console.error('[CARTO Source] quadbinTableSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] quadbinTableSource filters:', config.filters);
    }

    const result = quadbinTableSource(sourceConfig);

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] quadbinTableSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] quadbinTableSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Quadbin query source - quadbin data from SQL query
   * Supports CARTO column filters for server-side data filtering
   */
  quadbinQuerySource: (config: any) => {
    console.log('[CARTO Source] quadbinQuerySource config:', config);

    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] quadbinQuerySource missing sqlQuery or sql');
      return null;
    }

    const credentials = getCartoCredentials();
    const sourceConfig: any = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      sqlQuery: sqlQuery,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };

    // Add filters if provided (CARTO column filters)
    if (config.filters) {
      sourceConfig.filters = config.filters;
      console.log('[CARTO Source] quadbinQuerySource filters:', config.filters);
    }

    const result = quadbinQuerySource(sourceConfig);

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] quadbinQuerySource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] quadbinQuerySource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Quadbin tileset source - pre-computed quadbin tilesets
   */
  quadbinTilesetSource: (config: any) => {
    console.log('[CARTO Source] quadbinTilesetSource config:', config);

    if (!config.tableName) {
      console.error('[CARTO Source] quadbinTilesetSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const result = quadbinTilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] quadbinTilesetSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] quadbinTilesetSource failed:', error?.message || error)
      );
    }

    return result;
  },

  /**
   * Raster source - raster tile data
   */
  rasterSource: (config: any) => {
    console.log('[CARTO Source] rasterSource config:', config);

    if (!config.tableName) {
      console.error('[CARTO Source] rasterSource missing tableName');
      return null;
    }

    const credentials = getCartoCredentials();
    const result = rasterSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });

    if (result && typeof result.then === 'function') {
      result.then(
        (resolved: any) => console.log('[CARTO Source] rasterSource resolved:', {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length
        }),
        (error: any) => console.error('[CARTO Source] rasterSource failed:', error?.message || error)
      );
    }

    return result;
  },

  // ============================================================================
  // CARTO Styling Functions
  // ============================================================================

  /**
   * Color bins - assign colors based on value ranges
   */
  colorBins: (config: any) => {
    return colorBins({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'PurpOr',
      nullColor: config.nullColor,
    });
  },

  /**
   * Color categories - assign colors based on categorical values
   */
  colorCategories: (config: any) => {
    return colorCategories({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'Bold',
      nullColor: config.nullColor,
      othersColor: config.othersColor,
    });
  },

  /**
   * Color continuous - assign colors based on continuous value interpolation
   */
  colorContinuous: (config: any) => {
    return colorContinuous({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'Sunset',
      nullColor: config.nullColor,
    });
  },
};

/**
 * @deck.gl/json configuration object
 */
const deckJsonConfiguration = {
  // Layer classes for @@type references
  classes: {
    // Core layers
    GeoJsonLayer,
    PathLayer,
    ScatterplotLayer,
    IconLayer,
    ArcLayer,
    LineLayer,
    PolygonLayer,
    PointCloudLayer,
    TextLayer,
    // Geo layers
    TripsLayer,
    Tile3DLayer,
    // CARTO layers
    VectorTileLayer,
    H3TileLayer,
    QuadbinTileLayer,
    RasterTileLayer,
    // Interpolators as classes
    FlyToInterpolator,
    LinearInterpolator,
  } as Record<string, any>,

  // Constants for @@# references
  constants: {
    // Interpolator instances
    FlyToInterpolator: new FlyToInterpolator(),
    LinearInterpolator: new LinearInterpolator(),
    // All color constants
    ...COLOR_CONSTANTS,
  } as Record<string, any>,

  // Functions for @@function references
  functions: CUSTOM_FUNCTIONS,

  // Enumerations for @@#ENUM.VALUE references
  enumerations: {
    COORDINATE_SYSTEM,
  } as Record<string, any>,
};

/**
 * Singleton JSONConverter instance
 */
let jsonConverterInstance: JSONConverter | null = null;

/**
 * Get or create the JSONConverter singleton
 */
export function getJsonConverter(): JSONConverter {
  if (!jsonConverterInstance) {
    jsonConverterInstance = new JSONConverter({ configuration: deckJsonConfiguration });
  }
  return jsonConverterInstance;
}

/**
 * Recursively resolve @@ references in any value
 */
function resolveValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle @@# constant reference
  if (typeof value === 'string' && value.startsWith('@@#')) {
    const constName = value.slice(3);
    if (constName.includes('.')) {
      const [enumName, enumValue] = constName.split('.');
      const enumObj = deckJsonConfiguration.enumerations[enumName];
      if (enumObj && enumObj[enumValue] !== undefined) {
        return enumObj[enumValue];
      }
    }
    const resolved = deckJsonConfiguration.constants[constName];
    return resolved !== undefined ? resolved : value;
  }

  // Handle @@function call
  if (typeof value === 'object' && value['@@function']) {
    const funcName = value['@@function'];
    const func = deckJsonConfiguration.functions[funcName];
    if (func) {
      const { '@@function': _, ...args } = value;
      return func(args);
    }
    console.warn(`[deckJsonConfig] Unknown function: ${funcName}`);
    return null;
  }

  // Handle @@type class instantiation
  if (typeof value === 'object' && value['@@type']) {
    const className = value['@@type'];
    const ClassRef = deckJsonConfiguration.classes[className];
    if (ClassRef) {
      const { '@@type': _, ...args } = value;
      const resolvedArgs = resolveValue(args);
      return new ClassRef(resolvedArgs);
    }
    console.warn(`[deckJsonConfig] Unknown class: ${className}`);
    return null;
  }

  // Handle @@= accessor expression
  if (typeof value === 'string' && value.startsWith('@@=')) {
    const expr = value.slice(3);
    if (expr === '-') {
      return (d: any) => d;
    }
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) {
      return (d: any) => d.properties?.[expr] ?? d[expr];
    }
    const arrayMatch = expr.match(/^\[([^\]]+)\]$/);
    if (arrayMatch) {
      const props = arrayMatch[1].split(',').map((p) => p.trim());
      return (d: any) => props.map((p) => d.properties?.[p] ?? d[p]);
    }

    try {
      const func = parseExpressionString(expr, deckJsonConfiguration);
      if (func && typeof func === 'function') {
        return func;
      }
    } catch (e) {
      console.warn(`[deckJsonConfig] Failed to parse @@= expression: ${expr}`, e);
    }

    console.warn(`[deckJsonConfig] Unsupported @@= expression: ${expr}`);
    return value;
  }

  // Recursively resolve arrays
  if (Array.isArray(value)) {
    return value.map(resolveValue);
  }

  // Recursively resolve objects
  if (typeof value === 'object') {
    const resolved: any = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val);
    }
    return resolved;
  }

  return value;
}

