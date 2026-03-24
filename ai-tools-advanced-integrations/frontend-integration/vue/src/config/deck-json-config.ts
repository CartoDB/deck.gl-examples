/**
 * @deck.gl/json Configuration for React frontend
 *
 * Provides full JSONConverter integration for:
 * - @@# constant references (colors, interpolators)
 * - @@= accessor expressions
 * - @@function custom function calls
 * - @@type class instantiation
 *
 * Ported from Angular's deck-json-config.ts
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
  TextLayer,
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
  colorContinuous,
} from '@deck.gl/carto';
import { environment } from './environment';

/**
 * Color constants for JSONConverter @@# references
 */
const COLOR_CONSTANTS: Record<string, number[]> = {
  Red: [255, 0, 0, 200],
  Green: [0, 255, 0, 200],
  Blue: [0, 0, 255, 200],
  Yellow: [255, 255, 0, 200],
  Orange: [255, 165, 0, 200],
  Purple: [128, 0, 128, 200],
  Pink: [255, 192, 203, 200],
  Cyan: [0, 255, 255, 200],
  Magenta: [255, 0, 255, 200],
  White: [255, 255, 255, 255],
  Black: [0, 0, 0, 255],
  Gray: [128, 128, 128, 200],
  LightGray: [192, 192, 192, 200],
  DarkGray: [64, 64, 64, 200],
  Success: [16, 185, 129, 200],
  Warning: [245, 158, 11, 200],
  Error: [239, 68, 68, 200],
  Info: [59, 130, 246, 200],
  Transparent: [0, 0, 0, 0],
  Brown: [139, 69, 19, 200],
  Navy: [0, 0, 128, 200],
  Olive: [128, 128, 0, 200],
  Teal: [0, 128, 128, 200],
  Silver: [192, 192, 192, 200],
  Gold: [255, 215, 0, 200],
  Indigo: [75, 0, 130, 200],
  Violet: [238, 130, 238, 200],
  CartoPrimary: [3, 111, 226, 200],
  CartoSecondary: [255, 255, 255, 255],
};

function getCartoCredentials() {
  return {
    apiBaseUrl: environment.apiBaseUrl,
    accessToken: environment.accessToken,
    connectionName: environment.connectionName,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const CUSTOM_FUNCTIONS: Record<string, (config: any) => any> = {
  colorWithAlpha: ({ color, alpha }: { color: string | number[]; alpha: number }) => {
    const baseColor =
      typeof color === 'string' ? COLOR_CONSTANTS[color] || [128, 128, 128, 200] : color;
    return [baseColor[0], baseColor[1], baseColor[2], alpha];
  },

  scale: ({ value, factor }: { value: number; factor: number }) => value * factor,

  clamp: ({ value, min, max }: { value: number; min: number; max: number }) =>
    Math.max(min, Math.min(max, value)),

  lerp: ({ a, b, t }: { a: number; b: number; t: number }) => a + (b - a) * t,

  propertyColor: ({
    property,
    min,
    max,
    lowColor,
    highColor,
  }: {
    property: string;
    min: number;
    max: number;
    lowColor: string | number[];
    highColor: string | number[];
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

  // CARTO Data Sources
  vectorTableSource: (config: any) => {
    console.log('[CARTO Source] vectorTableSource config:', config);
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
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return vectorTableSource(sourceConfig);
  },

  vectorQuerySource: (config: any) => {
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
      sqlQuery,
      spatialDataColumn: config.spatialDataColumn,
    };
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return vectorQuerySource(sourceConfig);
  },

  vectorTilesetSource: (config: any) => {
    if (!config.tableName) {
      console.error('[CARTO Source] vectorTilesetSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    return vectorTilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });
  },

  h3TableSource: (config: any) => {
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
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return h3TableSource(sourceConfig);
  },

  h3QuerySource: (config: any) => {
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
      sqlQuery,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return h3QuerySource(sourceConfig);
  },

  h3TilesetSource: (config: any) => {
    if (!config.tableName) {
      console.error('[CARTO Source] h3TilesetSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    return h3TilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });
  },

  quadbinTableSource: (config: any) => {
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
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return quadbinTableSource(sourceConfig);
  },

  quadbinQuerySource: (config: any) => {
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
      sqlQuery,
      aggregationExp: config.aggregationExp,
      aggregationResLevel: config.aggregationResLevel,
    };
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    return quadbinQuerySource(sourceConfig);
  },

  quadbinTilesetSource: (config: any) => {
    if (!config.tableName) {
      console.error('[CARTO Source] quadbinTilesetSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    return quadbinTilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });
  },

  rasterSource: (config: any) => {
    if (!config.tableName) {
      console.error('[CARTO Source] rasterSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    return rasterSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });
  },

  // CARTO Styling Functions
  colorBins: (config: any) => {
    return colorBins({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'PurpOr',
      nullColor: config.nullColor,
    });
  },

  colorCategories: (config: any) => {
    return colorCategories({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'Bold',
      nullColor: config.nullColor,
      othersColor: config.othersColor,
    });
  },

  colorContinuous: (config: any) => {
    return colorContinuous({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'Sunset',
      nullColor: config.nullColor,
    });
  },
};

const deckJsonConfiguration = {
  classes: {
    GeoJsonLayer,
    PathLayer,
    ScatterplotLayer,
    IconLayer,
    ArcLayer,
    LineLayer,
    PolygonLayer,
    PointCloudLayer,
    TextLayer,
    TripsLayer,
    Tile3DLayer,
    VectorTileLayer,
    H3TileLayer,
    QuadbinTileLayer,
    RasterTileLayer,
    FlyToInterpolator,
    LinearInterpolator,
  } as Record<string, any>,

  constants: {
    FlyToInterpolator: new FlyToInterpolator(),
    LinearInterpolator: new LinearInterpolator(),
    ...COLOR_CONSTANTS,
  } as Record<string, any>,

  functions: CUSTOM_FUNCTIONS,

  enumerations: {
    COORDINATE_SYSTEM,
  } as Record<string, any>,
};

let jsonConverterInstance: JSONConverter | null = null;

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

  if (Array.isArray(value)) {
    return value.map(resolveValue);
  }

  if (typeof value === 'object') {
    const resolved: any = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val);
    }
    return resolved;
  }

  return value;
}

// Export for use in useDeckProps hook
export { resolveValue, deckJsonConfiguration };
/* eslint-enable @typescript-eslint/no-explicit-any */
