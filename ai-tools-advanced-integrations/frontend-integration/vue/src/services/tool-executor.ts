/**
 * Tool Executor
 *
 * Factory function that creates a tool executor for AI tool calls.
 * Pure function with no React dependencies — used inside MapAIToolsContext.
 */
import { vectorTableSource } from '@deck.gl/carto';
import { TOOL_NAMES } from '@carto/agentic-deckgl';
import type { LayerSpec } from '../utils/layer-merge';
import { mergeLayerSpecs, validateLayerColumns } from '../utils/layer-merge';
import { environment } from '../config/environment';

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: Error;
}

export type Basemap = 'dark-matter' | 'positron' | 'voyager';

export interface DeckLayersConfig {
  layers: LayerSpec[];
  widgets: Record<string, unknown>[];
  effects: Record<string, unknown>[];
}

interface SetDeckStateParams {
  initialViewState?: {
    latitude: number;
    longitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
    transitionDuration?: number;
  };
  mapStyle?: Basemap;
  layers?: LayerSpec[];
  widgets?: Record<string, unknown>[];
  effects?: Record<string, unknown>[];
  layerOrder?: string[];
  removeLayerIds?: string[];
  removeWidgetIds?: string[];
}

export interface DeckStateActions {
  setInitialViewState: (vs: {
    latitude: number;
    longitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
    transitionDuration?: number;
  }) => void;
  setBasemap: (basemap: Basemap) => void;
  setDeckLayers: (config: DeckLayersConfig) => void;
  setActiveLayerId: (id: string | undefined) => void;
  getDeckSpec: () => DeckLayersConfig;
}

// ==================== MARKER CONSTANTS ====================

const MARKER_LAYER_ID = '__location-marker__';
const LOCATION_MARKER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.3"/></filter></defs><g filter="url(#shadow)"><path d="M24 4C16.268 4 10 10.268 10 18c0 10.5 14 26 14 26s14-15.5 14-26c0-7.732-6.268-14-14-14z" fill="#333333"/><path d="M24 4C16.268 4 10 10.268 10 18c0 10.5 14 26 14 26s14-15.5 14-26c0-7.732-6.268-14-14-14z" fill="none" stroke="#666666" stroke-width="1.5"/><circle cx="24" cy="18" r="6" fill="#FFFFFF"/></g></svg>';
const LOCATION_MARKER_SVG_DATA_URL = `data:image/svg+xml;base64,${btoa(LOCATION_MARKER_SVG)}`;

export type ExecuteToolFn = (toolName: string, params: unknown) => Promise<ToolResult>;

type ToolExecutorFn = (params: unknown) => ToolResult | Promise<ToolResult>;

function executeSetDeckState(actions: DeckStateActions, params: unknown, widgetActions?: WidgetActions): ToolResult {
  const paramsObj = params as SetDeckStateParams;
  const updatedParts: string[] = [];

  // Step 1: Update view state
  if (paramsObj.initialViewState) {
    const vs = paramsObj.initialViewState;
    actions.setInitialViewState({
      latitude: vs.latitude,
      longitude: vs.longitude,
      zoom: vs.zoom,
      pitch: vs.pitch ?? 0,
      bearing: vs.bearing ?? 0,
      transitionDuration: vs.transitionDuration,
    });
    updatedParts.push('viewState');
  }

  // Step 2: Update basemap
  if (paramsObj.mapStyle) {
    actions.setBasemap(paramsObj.mapStyle);
    updatedParts.push('basemap');
  }

  // Step 3: Process layers/widgets/effects
  const hasDeckConfigFields =
    'layers' in paramsObj ||
    'removeLayerIds' in paramsObj ||
    'removeWidgetIds' in paramsObj ||
    'layerOrder' in paramsObj ||
    'widgets' in paramsObj ||
    'effects' in paramsObj;

  if (hasDeckConfigFields) {
    const currentConfig = actions.getDeckSpec();

    // Process layer removals FIRST
    let workingLayers = currentConfig.layers ?? [];
    if (paramsObj.removeLayerIds && paramsObj.removeLayerIds.length > 0) {
      const idsToRemove = new Set(paramsObj.removeLayerIds);
      workingLayers = workingLayers.filter(
        (layer) => !idsToRemove.has(layer['id'] as string)
      );
    }

    // Determine final layers
    let finalLayers: LayerSpec[];
    const hasLayersProperty = 'layers' in paramsObj;
    const layersValue = paramsObj.layers;
    const isLayersArray = Array.isArray(layersValue);
    const isLayersEmpty = isLayersArray && layersValue.length === 0;

    if (hasLayersProperty) {
      if (isLayersEmpty) {
        finalLayers = [];
      } else if (isLayersArray && layersValue.length > 0) {
        finalLayers = mergeLayerSpecs(workingLayers, layersValue);
      } else {
        finalLayers = workingLayers;
      }
    } else {
      finalLayers = workingLayers;
    }

    // Apply layer ordering
    const { layerOrder } = paramsObj;
    if (layerOrder && layerOrder.length > 0) {
      const layerMap = new Map(finalLayers.map((l) => [l['id'] as string, l]));
      const orderedLayers: LayerSpec[] = [];

      for (const id of layerOrder) {
        const layer = layerMap.get(id);
        if (layer) {
          orderedLayers.push(layer);
          layerMap.delete(id);
        }
      }

      for (const layer of layerMap.values()) {
        orderedLayers.push(layer);
      }

      finalLayers = orderedLayers;
    }

    // Determine final widgets
    let finalWidgets: Record<string, unknown>[];
    if ('widgets' in paramsObj) {
      if (paramsObj.widgets && paramsObj.widgets.length === 0) {
        finalWidgets = [];
      } else if (paramsObj.widgets) {
        finalWidgets = paramsObj.widgets;
      } else {
        finalWidgets = currentConfig.widgets ?? [];
      }
    } else {
      finalWidgets = currentConfig.widgets ?? [];
    }

    // Route Vega-Lite widget specs to WidgetActions
    if (widgetActions && finalWidgets.length > 0) {
      const vegaWidgets = finalWidgets.filter(
        (w: any) => w.type && w.source && w.vegaLiteSpec
      );
      const deckWidgets = finalWidgets.filter(
        (w: any) => !(w.type && w.source && w.vegaLiteSpec)
      );
      for (const vw of vegaWidgets) {
        widgetActions.addWidget(vw as any);
      }
      finalWidgets = deckWidgets;
    }

    // Handle widget removal
    if (widgetActions && paramsObj.removeWidgetIds) {
      for (const id of paramsObj.removeWidgetIds) {
        widgetActions.removeWidget(id);
      }
    }

    // Determine final effects
    let finalEffects: Record<string, unknown>[];
    if ('effects' in paramsObj) {
      if (paramsObj.effects && paramsObj.effects.length === 0) {
        finalEffects = [];
      } else if (paramsObj.effects) {
        finalEffects = paramsObj.effects;
      } else {
        finalEffects = currentConfig.effects ?? [];
      }
    } else {
      finalEffects = currentConfig.effects ?? [];
    }

    // Ensure system layers (__ prefix) always render on top
    const userFinalLayers = finalLayers.filter(l => !((l['id'] as string) || '').startsWith('__'));
    const systemFinalLayers = finalLayers.filter(l => ((l['id'] as string) || '').startsWith('__'));
    finalLayers = [...userFinalLayers, ...systemFinalLayers];

    const config: DeckLayersConfig = {
      layers: finalLayers,
      widgets: finalWidgets,
      effects: finalEffects,
    };

    for (const layer of config.layers) {
      validateLayerColumns(layer);
    }

    actions.setDeckLayers(config);

    // Track active layer (skip system layers with __ prefix)
    if (finalLayers.length > 0) {
      const userLayers = finalLayers.filter(l => {
        const id = (l['id'] as string) || '';
        return !id.startsWith('__');
      });
      const lastUserLayerId = userLayers.length > 0
        ? (userLayers[userLayers.length - 1]['id'] as string) : undefined;
      if (lastUserLayerId) {
        actions.setActiveLayerId(lastUserLayerId);
      }
    } else {
      actions.setActiveLayerId(undefined);
    }

    updatedParts.push(
      `${config.layers.length} layer(s), ${config.widgets.length} widget(s), ${config.effects.length} effect(s)`
    );
  }

  return {
    success: true,
    message: `Updated: ${updatedParts.join(', ')}`,
  };
}

function executeSetMarker(actions: DeckStateActions, params: unknown): ToolResult {
  const { action = 'add', latitude, longitude } = params as {
    action?: 'add' | 'remove' | 'clear-all';
    latitude?: number;
    longitude?: number;
  };
  try {
    const currentSpec = actions.getDeckSpec();
    const COORDINATE_TOLERANCE = 0.00001;

    // Get existing marker layer and its data points (if any)
    const existingMarkerLayer = currentSpec.layers.find(
      (layer) => layer['id'] === MARKER_LAYER_ID
    );
    const existingData = (existingMarkerLayer?.['data'] as Array<{ coordinates: number[] }>) ?? [];
    const layersWithoutMarker = currentSpec.layers.filter(
      (layer) => layer['id'] !== MARKER_LAYER_ID
    );

    // Handle clear-all: remove the entire marker layer
    if (action === 'clear-all') {
      actions.setDeckLayers({
        layers: layersWithoutMarker,
        widgets: currentSpec.widgets ?? [],
        effects: currentSpec.effects ?? [],
      });
      return { success: true, message: `All markers cleared (${existingData.length} removed).` };
    }

    // For add and remove, latitude/longitude are required
    if (latitude == null || longitude == null) {
      return { success: false, message: `Latitude and longitude are required for action "${action}".` };
    }

    // Handle remove: filter out the marker at the given coordinates
    if (action === 'remove') {
      const updatedData = existingData.filter(
        (d) =>
          !(Math.abs(d.coordinates[0] - longitude) < COORDINATE_TOLERANCE &&
            Math.abs(d.coordinates[1] - latitude) < COORDINATE_TOLERANCE)
      );

      if (updatedData.length === existingData.length) {
        return { success: false, message: `No marker found near [${latitude}, ${longitude}].` };
      }

      if (updatedData.length === 0) {
        actions.setDeckLayers({
          layers: layersWithoutMarker,
          widgets: currentSpec.widgets ?? [],
          effects: currentSpec.effects ?? [],
        });
      } else {
        const markerLayer: LayerSpec = {
          '@@type': 'IconLayer',
          id: MARKER_LAYER_ID,
          data: updatedData,
          getPosition: '@@=coordinates',
          iconAtlas: LOCATION_MARKER_SVG_DATA_URL,
          iconMapping: {
            marker: { x: 0, y: 0, width: 48, height: 48, anchorY: 48 }
          },
          getIcon: '@@="marker"',
          getSize: 48,
          sizeScale: 1,
          pickable: false,
          visible: true,
        };
        actions.setDeckLayers({
          layers: [...layersWithoutMarker, markerLayer],
          widgets: currentSpec.widgets ?? [],
          effects: currentSpec.effects ?? [],
        });
      }

      return { success: true, message: `Marker removed at [${latitude}, ${longitude}]. Remaining markers: ${updatedData.length}` };
    }

    // Handle add (default): add a new marker, skip duplicates
    const alreadyExists = existingData.some(
      (d) =>
        Math.abs(d.coordinates[0] - longitude) < COORDINATE_TOLERANCE &&
        Math.abs(d.coordinates[1] - latitude) < COORDINATE_TOLERANCE
    );
    const updatedData = alreadyExists
      ? existingData
      : [...existingData, { coordinates: [longitude, latitude] }];

    const markerLayer: LayerSpec = {
      '@@type': 'IconLayer',
      id: MARKER_LAYER_ID,
      data: updatedData,
      getPosition: '@@=coordinates',
      iconAtlas: LOCATION_MARKER_SVG_DATA_URL,
      iconMapping: {
        marker: { x: 0, y: 0, width: 48, height: 48, anchorY: 48 }
      },
      getIcon: '@@="marker"',
      getSize: 48,
      sizeScale: 1,
      pickable: false,
      visible: true,
    };

    actions.setDeckLayers({
      layers: [...layersWithoutMarker, markerLayer],
      widgets: currentSpec.widgets ?? [],
      effects: currentSpec.effects ?? [],
    });

    return { success: true, message: `Marker placed at [${latitude}, ${longitude}]. Total markers: ${updatedData.length}` };
  } catch (error) {
    return {
      success: false,
      message: `Failed to set marker: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export interface WidgetActions {
  addWidget: (spec: any) => void;
  removeWidget: (id: string) => void;
  clearWidgets: () => void;
}

export interface MaskLayerActions {
  setMaskGeometry: (geojson: any) => void;
  enableDrawMode: () => void;
  clearMask: () => void;
}

// Update with your geom column name(s) if different
const GEOM_COLUMNS = ['geom'];

async function fetchGeometryFromTable(tableName: string): Promise<Record<string, unknown>> {
  const source = await vectorTableSource({
    apiBaseUrl: environment.apiBaseUrl,
    accessToken: environment.accessToken,
    connectionName: environment.connectionName,
    tableName,
    columns: GEOM_COLUMNS,
  });

  const { rows } = await source.widgetSource.getTable({
    columns: GEOM_COLUMNS,
    limit: 1,
  });

  if (rows.length > 0) {
    for (const col of GEOM_COLUMNS) {
      const val = rows[0][col];
      if (val) {
        return typeof val === 'string' ? JSON.parse(val) : val as unknown as Record<string, unknown>;
      }
    }
  }

  throw new Error(`No geometry found in table "${tableName}"`);
}

async function executeSetMaskLayer(maskActions: MaskLayerActions, params: unknown): Promise<ToolResult> {
  const { action, geometry, tableName } = params as {
    action: 'set' | 'enable-draw' | 'clear';
    geometry?: Record<string, unknown>;
    tableName?: string;
  };
  try {
    switch (action) {
      case 'set': {
        let resolvedGeometry = geometry;

        if (!resolvedGeometry && tableName) {
          resolvedGeometry = await fetchGeometryFromTable(tableName);
        }

        if (!resolvedGeometry) {
          return { success: false, message: 'Either geometry or tableName is required for action "set".' };
        }
        maskActions.setMaskGeometry(resolvedGeometry);
        return { success: true, message: 'Mask geometry applied. All data layers are now masked to the specified area.' };
      }
      case 'enable-draw':
        maskActions.enableDrawMode();
        return { success: true, message: 'Drawing mode enabled. Draw a polygon on the map to define the mask area.' };
      case 'clear':
        maskActions.clearMask();
        return { success: true, message: 'Mask cleared. All data layers are now fully visible.' };
      default:
        return { success: false, message: `Unknown mask action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      message: `Failed to set mask layer: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function createToolExecutor(actions: DeckStateActions, maskActions?: MaskLayerActions, widgetActions?: WidgetActions): ExecuteToolFn {
  const executors: Record<string, ToolExecutorFn> = {
    [TOOL_NAMES.SET_DECK_STATE]: (params) => executeSetDeckState(actions, params, widgetActions),
    [TOOL_NAMES.SET_MARKER]: (params) => executeSetMarker(actions, params),
    ...(maskActions ? {
      [TOOL_NAMES.SET_MASK_LAYER]: (params) => executeSetMaskLayer(maskActions, params),
    } : {}),
  };

  return async (toolName, params) => {
    const executor = executors[toolName];
    if (!executor) {
      return { success: false, message: `Unknown tool: ${toolName}` };
    }

    try {
      return await executor(params);
    } catch (error) {
      return {
        success: false,
        message: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  };
}
