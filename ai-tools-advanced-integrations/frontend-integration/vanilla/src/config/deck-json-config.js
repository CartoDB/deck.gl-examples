/**
 * @deck.gl/json Configuration
 *
 * Provides full JSONConverter integration for:
 * - @@# constant references (colors, interpolators)
 * - @@= accessor expressions
 * - @@function custom function calls
 * - @@type class instantiation
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
import { environment } from './environment.js';

/**
 * Color constants for JSONConverter @@# references
 */
const COLOR_CONSTANTS = {
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

/**
 * Helper to log source promise resolution
 */
function logSourceResult(name, result) {
  if (result && typeof result.then === 'function') {
    result.then(
      (resolved) =>
        console.log(`[CARTO Source] ${name} resolved:`, {
          hasTiles: !!resolved?.tiles,
          tilesLength: resolved?.tiles?.length,
          accessToken: resolved?.accessToken ? '[PRESENT]' : '[MISSING]',
        }),
      (error) =>
        console.error(`[CARTO Source] ${name} failed:`, error?.message || error)
    );
  }
}

const CUSTOM_FUNCTIONS = {
  colorWithAlpha: ({ color, alpha }) => {
    const baseColor =
      typeof color === 'string' ? COLOR_CONSTANTS[color] || [128, 128, 128, 200] : color;
    return [baseColor[0], baseColor[1], baseColor[2], alpha];
  },

  scale: ({ value, factor }) => value * factor,

  clamp: ({ value, min, max }) => Math.max(min, Math.min(max, value)),

  lerp: ({ a, b, t }) => a + (b - a) * t,

  propertyColor: ({ property, min, max, lowColor, highColor }) => {
    const low = typeof lowColor === 'string' ? COLOR_CONSTANTS[lowColor] : lowColor;
    const high = typeof highColor === 'string' ? COLOR_CONSTANTS[highColor] : highColor;

    return (d) => {
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

  vectorTableSource: (config) => {
    console.log('[CARTO Source] vectorTableSource config:', config);
    if (!config.tableName) {
      console.error('[CARTO Source] vectorTableSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
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
    const result = vectorTableSource(sourceConfig);
    logSourceResult('vectorTableSource', result);
    return result;
  },

  vectorQuerySource: (config) => {
    console.log('[CARTO Source] vectorQuerySource config:', config);
    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] vectorQuerySource missing sqlQuery or sql');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      sqlQuery,
      spatialDataColumn: config.spatialDataColumn,
    };
    if (config.filters) {
      sourceConfig.filters = config.filters;
    }
    const result = vectorQuerySource(sourceConfig);
    logSourceResult('vectorQuerySource', result);
    return result;
  },

  vectorTilesetSource: (config) => {
    console.log('[CARTO Source] vectorTilesetSource config:', config);
    if (!config.tableName) {
      console.error('[CARTO Source] vectorTilesetSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    const result = vectorTilesetSource({
      apiBaseUrl: config.apiBaseUrl || credentials.apiBaseUrl,
      accessToken: config.accessToken || credentials.accessToken,
      connectionName: config.connectionName || credentials.connectionName,
      tableName: config.tableName,
    });
    logSourceResult('vectorTilesetSource', result);
    return result;
  },

  h3TableSource: (config) => {
    console.log('[CARTO Source] h3TableSource config:', config);
    if (!config.tableName) {
      console.error('[CARTO Source] h3TableSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
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
    const result = h3TableSource(sourceConfig);
    logSourceResult('h3TableSource', result);
    return result;
  },

  h3QuerySource: (config) => {
    console.log('[CARTO Source] h3QuerySource config:', config);
    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] h3QuerySource missing sqlQuery or sql');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
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
    const result = h3QuerySource(sourceConfig);
    logSourceResult('h3QuerySource', result);
    return result;
  },

  h3TilesetSource: (config) => {
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
    logSourceResult('h3TilesetSource', result);
    return result;
  },

  quadbinTableSource: (config) => {
    console.log('[CARTO Source] quadbinTableSource config:', config);
    if (!config.tableName) {
      console.error('[CARTO Source] quadbinTableSource missing tableName');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
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
    const result = quadbinTableSource(sourceConfig);
    logSourceResult('quadbinTableSource', result);
    return result;
  },

  quadbinQuerySource: (config) => {
    console.log('[CARTO Source] quadbinQuerySource config:', config);
    const sqlQuery = config.sqlQuery || config.sql;
    if (!sqlQuery) {
      console.error('[CARTO Source] quadbinQuerySource missing sqlQuery or sql');
      return null;
    }
    const credentials = getCartoCredentials();
    const sourceConfig = {
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
    const result = quadbinQuerySource(sourceConfig);
    logSourceResult('quadbinQuerySource', result);
    return result;
  },

  quadbinTilesetSource: (config) => {
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
    logSourceResult('quadbinTilesetSource', result);
    return result;
  },

  rasterSource: (config) => {
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
    logSourceResult('rasterSource', result);
    return result;
  },

  // ============================================================================
  // CARTO Styling Functions
  // ============================================================================

  colorBins: (config) => {
    return colorBins({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'PurpOr',
      nullColor: config.nullColor,
    });
  },

  colorCategories: (config) => {
    return colorCategories({
      attr: config.attr,
      domain: config.domain,
      colors: config.colors || 'Bold',
      nullColor: config.nullColor,
      othersColor: config.othersColor,
    });
  },

  colorContinuous: (config) => {
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
  },
  constants: {
    FlyToInterpolator: new FlyToInterpolator(),
    LinearInterpolator: new LinearInterpolator(),
    ...COLOR_CONSTANTS,
  },
  functions: CUSTOM_FUNCTIONS,
  enumerations: {
    COORDINATE_SYSTEM,
  },
};

let jsonConverterInstance = null;

export function getJsonConverter() {
  if (!jsonConverterInstance) {
    jsonConverterInstance = new JSONConverter({ configuration: deckJsonConfiguration });
  }
  return jsonConverterInstance;
}
