/**
 * Tool Executor
 *
 * Unified executor for the set-deck-state tool.
 * Port of Angular's ConsolidatedExecutorsService.
 */

import { vectorTableSource } from '@deck.gl/carto';
import { TOOL_NAMES } from '@carto/agentic-deckgl';
import { mergeLayerSpecs, validateLayerColumns } from '../utils/layer-merge.js';
import { environment } from '../config/environment.js';

// ==================== MARKER CONSTANTS ====================

const MARKER_LAYER_ID = '__location-marker__';
const LOCATION_MARKER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.3"/></filter></defs><g filter="url(#shadow)"><path d="M24 4C16.268 4 10 10.268 10 18c0 10.5 14 26 14 26s14-15.5 14-26c0-7.732-6.268-14-14-14z" fill="#333333"/><path d="M24 4C16.268 4 10 10.268 10 18c0 10.5 14 26 14 26s14-15.5 14-26c0-7.732-6.268-14-14-14z" fill="none" stroke="#666666" stroke-width="1.5"/><circle cx="24" cy="18" r="6" fill="#FFFFFF"/></g></svg>';
const LOCATION_MARKER_SVG_DATA_URL = `data:image/svg+xml;base64,${btoa(LOCATION_MARKER_SVG)}`;

export class ToolExecutor {
  constructor(deckState, maskLayerManager, widgetManager) {
    this._deckState = deckState;
    this._maskLayerManager = maskLayerManager || null;
    this._widgetManager = widgetManager || null;
    this._executors = this._createExecutors();
  }

  async execute(toolName, params) {
    const executor = this._executors[toolName];
    if (!executor) {
      return { success: false, message: `Unknown tool: ${toolName}` };
    }

    try {
      return await Promise.resolve(executor(params));
    } catch (error) {
      return {
        success: false,
        message: `Execution error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  _createExecutors() {
    const executors = {
      [TOOL_NAMES.SET_DECK_STATE]: (params) => {
        const updatedParts = [];
        try {
          // Step 1: Update view state
          if (params.initialViewState) {
            const vs = params.initialViewState;
            this._deckState.setInitialViewState({
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
          if (params.mapStyle) {
            this._deckState.setBasemap(params.mapStyle);
            updatedParts.push('basemap');
          }

          // Step 3: Process deck config
          const hasDeckConfigFields =
            'layers' in params ||
            'removeLayerIds' in params ||
            'removeWidgetIds' in params ||
            'layerOrder' in params ||
            'widgets' in params ||
            'effects' in params;

          if (hasDeckConfigFields) {
            const currentSpec = this._deckState.getDeckSpec();

            // Process layer removals FIRST
            let workingLayers = currentSpec.layers ?? [];
            if (params.removeLayerIds && params.removeLayerIds.length > 0) {
              const idsToRemove = new Set(params.removeLayerIds);
              workingLayers = workingLayers.filter(
                (layer) => !idsToRemove.has(layer['id'])
              );
            }

            // Determine final layers
            let finalLayers;
            const hasLayersProperty = 'layers' in params;
            const layersValue = params.layers;
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
            if (params.layerOrder && params.layerOrder.length > 0) {
              const layerMap = new Map(finalLayers.map((l) => [l['id'], l]));
              const orderedLayers = [];

              for (const id of params.layerOrder) {
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
            let finalWidgets;
            if ('widgets' in params) {
              if (params.widgets && params.widgets.length === 0) {
                finalWidgets = [];
              } else if (params.widgets) {
                finalWidgets = params.widgets;
              } else {
                finalWidgets = currentSpec.widgets ?? [];
              }
            } else {
              finalWidgets = currentSpec.widgets ?? [];
            }

            // Route Vega-Lite widget specs to WidgetManager
            if (this._widgetManager && finalWidgets.length > 0) {
              const vegaWidgets = finalWidgets.filter(
                (w) => w.type && w.source && w.vegaLiteSpec
              );
              const deckWidgets = finalWidgets.filter(
                (w) => !(w.type && w.source && w.vegaLiteSpec)
              );
              for (const vw of vegaWidgets) {
                this._widgetManager.addWidget(vw);
              }
              finalWidgets = deckWidgets;
            }

            // Handle widget removal
            if (this._widgetManager && params.removeWidgetIds) {
              for (const id of params.removeWidgetIds) {
                this._widgetManager.removeWidget(id);
              }
            }

            // Determine final effects
            let finalEffects;
            if ('effects' in params) {
              if (params.effects && params.effects.length === 0) {
                finalEffects = [];
              } else if (params.effects) {
                finalEffects = params.effects;
              } else {
                finalEffects = currentSpec.effects ?? [];
              }
            } else {
              finalEffects = currentSpec.effects ?? [];
            }

            // Ensure system layers (__ prefix) always render on top
            const userFinalLayers = finalLayers.filter(l => !(l['id'] || '').startsWith('__'));
            const systemFinalLayers = finalLayers.filter(l => (l['id'] || '').startsWith('__'));
            finalLayers = [...userFinalLayers, ...systemFinalLayers];

            const config = {
              layers: finalLayers,
              widgets: finalWidgets,
              effects: finalEffects,
            };

            // Validate columns
            for (const layer of config.layers) {
              validateLayerColumns(layer);
            }

            this._deckState.setDeckLayers(config);

            // Track active layer (skip system layers with __ prefix)
            if (finalLayers.length > 0) {
              const userLayers = finalLayers.filter(l => {
                const id = l['id'] || '';
                return !id.startsWith('__');
              });
              const lastUserLayerId = userLayers.length > 0
                ? userLayers[userLayers.length - 1]['id'] : undefined;
              if (lastUserLayerId) {
                this._deckState.setActiveLayerId(lastUserLayerId);
              }
            } else {
              this._deckState.setActiveLayerId(undefined);
            }

            updatedParts.push(
              `${config.layers.length} layer(s), ${config.widgets.length} widget(s), ${config.effects.length} effect(s)`
            );
          }

          return {
            success: true,
            message: `Updated: ${updatedParts.join(', ')}`,
          };
        } catch (error) {
          return {
            success: false,
            message: `Failed to set deck state: ${error instanceof Error ? error.message : String(error)}`,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      },

      // ==================== SET MARKER ====================
      [TOOL_NAMES.SET_MARKER]: (params) => {
        const { action = 'add', latitude, longitude } = params;
        try {
          const currentSpec = this._deckState.getDeckSpec();
          const COORDINATE_TOLERANCE = 0.00001;

          // Get existing marker layer and its data points (if any)
          const existingMarkerLayer = currentSpec.layers.find(
            (layer) => layer['id'] === MARKER_LAYER_ID
          );
          const existingData = existingMarkerLayer?.['data'] ?? [];
          const layersWithoutMarker = currentSpec.layers.filter(
            (layer) => layer['id'] !== MARKER_LAYER_ID
          );

          // Handle clear-all: remove the entire marker layer
          if (action === 'clear-all') {
            this._deckState.setDeckLayers({
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
              this._deckState.setDeckLayers({
                layers: layersWithoutMarker,
                widgets: currentSpec.widgets ?? [],
                effects: currentSpec.effects ?? [],
              });
            } else {
              const markerLayer = {
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
              this._deckState.setDeckLayers({
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

          const markerLayer = {
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

          this._deckState.setDeckLayers({
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
      },
    };

    // Add mask layer executor if maskLayerManager is provided
    if (this._maskLayerManager) {
      const maskManager = this._maskLayerManager;
      executors[TOOL_NAMES.SET_MASK_LAYER] = async (params) => {
        const { action, geometry, tableName } = params;
        try {
          switch (action) {
            case 'set': {
              let resolvedGeometry = geometry;

              if (!resolvedGeometry && tableName) {
                // Update with your geom column name(s) if different
                const geomColumns = ['geom'];
                const source = await vectorTableSource({
                  apiBaseUrl: environment.apiBaseUrl,
                  accessToken: environment.accessToken,
                  connectionName: environment.connectionName,
                  tableName,
                  columns: geomColumns,
                });
                const { rows } = await source.widgetSource.getTable({
                  columns: geomColumns,
                  limit: 1,
                });
                if (rows.length > 0) {
                  for (const col of geomColumns) {
                    const val = rows[0][col];
                    if (val) {
                      resolvedGeometry = typeof val === 'string' ? JSON.parse(val) : val;
                      break;
                    }
                  }
                }
                if (!resolvedGeometry) {
                  return { success: false, message: `No geometry found in table "${tableName}".` };
                }
              }

              if (!resolvedGeometry) {
                return { success: false, message: 'Either geometry or tableName is required for action "set".' };
              }
              maskManager.setMaskGeometry(resolvedGeometry);
              return { success: true, message: 'Mask geometry applied. All data layers are now masked to the specified area.' };
            }
            case 'enable-draw':
              maskManager.enableDrawMode();
              return { success: true, message: 'Drawing mode enabled. Draw a polygon on the map to define the mask area.' };
            case 'clear':
              maskManager.clearMask();
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
      };
    }

    return executors;
  }
}
