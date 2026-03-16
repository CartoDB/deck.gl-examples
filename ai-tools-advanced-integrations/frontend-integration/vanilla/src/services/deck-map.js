/**
 * Deck Map Manager
 *
 * Manages deck.gl and MapLibre instances.
 * Port of Angular's DeckMapService.
 */

import { EventEmitter } from '../state/event-emitter.js';
import { Deck } from '@deck.gl/core';
import { log as lumaLog } from '@luma.gl/core';
import { BASEMAP } from '@deck.gl/carto';
import maplibregl from 'maplibre-gl';
import { getJsonConverter } from '../config/deck-json-config.js';
import { getTooltipContent } from '../utils/tooltip.js';
import { DEFAULT_VIEW_STATE } from '../state/deck-state.js';

const BASEMAP_URLS = {
  'dark-matter': BASEMAP.DARK_MATTER,
  positron: BASEMAP.POSITRON,
  voyager: BASEMAP.VOYAGER,
};

export class DeckMapManager extends EventEmitter {
  constructor(deckState, environment, maskLayerManager) {
    super();
    this._deckState = deckState;
    this._environment = environment;
    this._maskLayerManager = maskLayerManager || null;
    this._deck = null;
    this._map = null;
    this._stateUnsubscribe = null;
    this._maskUnsubscribe = null;
    this._cachedConvertedLayers = [];
  }

  async initialize(containerId, canvasId) {
    const initialViewState = this._deckState.getViewState();

    // Create MapLibre map
    this._map = new maplibregl.Map({
      container: containerId,
      style: BASEMAP_URLS[this._deckState.getBasemap()],
      interactive: false,
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
    });

    await new Promise((resolve) => {
      this._map.on('load', () => {
        console.log('[DeckMapManager] MapLibre loaded');
        resolve();
      });
    });

    // Suppress verbose luma.gl logging
    lumaLog.level = 0;

    // Create deck.gl instance
    this._deck = new Deck({
      canvas: canvasId,
      initialViewState: {
        ...initialViewState,
        transitionDuration: 0,
      },
      controller: true,
      layers: [],
      onViewStateChange: ({ viewState: vs }) => {
        if (this._map) {
          this._map.jumpTo({
            center: [vs.longitude, vs.latitude],
            zoom: vs.zoom,
            bearing: vs.bearing,
            pitch: vs.pitch,
          });
        }
        this.emit('viewStateChange', {
          longitude: vs.longitude,
          latitude: vs.latitude,
          zoom: vs.zoom,
          pitch: vs.pitch,
          bearing: vs.bearing,
        });
      },
      getTooltip: (info) => getTooltipContent(info),
      _animate: true,
    });

    // Emit initial view state
    this.emit('viewStateChange', {
      longitude: initialViewState.longitude ?? DEFAULT_VIEW_STATE.longitude,
      latitude: initialViewState.latitude ?? DEFAULT_VIEW_STATE.latitude,
      zoom: initialViewState.zoom ?? DEFAULT_VIEW_STATE.zoom,
      pitch: initialViewState.pitch ?? 0,
      bearing: initialViewState.bearing ?? 0,
    });

    // Subscribe to state changes
    this._stateUnsubscribe = this._deckState.on('change', ({ state, changedKeys }) => {
      if (changedKeys.length > 0) {
        this._renderFromState(state, changedKeys);
      }
    });

    // Subscribe to mask layer changes — use light render during drawing to avoid API calls
    if (this._maskLayerManager) {
      this._maskUnsubscribe = this._maskLayerManager.on('change', () => {
        if (this._maskLayerManager.getState().isDrawing) {
          this._updateMaskLayersOnly();
        } else {
          const currentState = this._deckState.getState();
          this._renderFromState(currentState, ['layers']);
        }
      });
    }

    console.log('[DeckMapManager] Initialized');
    return { deck: this._deck, map: this._map };
  }

  _renderFromState(state, changedKeys) {
    if (!this._deck || !this._map) {
      console.warn('[DeckMapManager] Not initialized');
      return;
    }

    console.log('[DeckMapManager] Rendering state update:', changedKeys);

    // Update basemap
    if (changedKeys.includes('basemap')) {
      const basemapUrl = BASEMAP_URLS[state.basemap];
      if (basemapUrl) {
        this._map.setStyle(basemapUrl);
      }
    }

    // Update view state and/or layers via unified JSONConverter
    if (changedKeys.includes('initialViewState') || changedKeys.includes('layers')) {
      const jsonConverter = getJsonConverter();

      const initialViewState = state.deckSpec.initialViewState;

      // Deep clone layers for credential injection
      const layersClone = JSON.parse(JSON.stringify(state.deckSpec.layers || []));

      // Inject credentials into all layers
      const layersWithCredentials = layersClone.map((layer, index) => {
        const layerId = layer['id'] || `layer-${index}`;
        return this._injectCartoCredentials({ ...layer, id: layerId });
      });

      // Construct spec with fresh initialViewState and cloned/injected layers
      const spec = {
        initialViewState,
        layers: layersWithCredentials,
        widgets: state.deckSpec.widgets || [],
        effects: state.deckSpec.effects || [],
      };

      try {
        const deckProps = jsonConverter.convert(spec);
        if (deckProps) {
          // Cache raw converted layers BEFORE MaskExtension injection (for light render during drawing)
          let convertedLayers = deckProps.layers || [];
          this._cachedConvertedLayers = convertedLayers;

          // Always inject MaskExtension (pre-registers MaskEffect for first-polygon fix)
          if (this._maskLayerManager) {
            convertedLayers = this._maskLayerManager.injectMaskExtension(convertedLayers);
          }

          // Append mask layers (GeoJsonLayer + optional EditableGeoJsonLayer)
          if (this._maskLayerManager) {
            const maskLayers = this._maskLayerManager.getMaskLayers();
            convertedLayers = [...convertedLayers, ...maskLayers];
          }

          const isDrawing = this._maskLayerManager ? this._maskLayerManager.getState().isDrawing : false;
          this._deck.setProps({
            ...deckProps,
            layers: convertedLayers,
            controller: { dragPan: !isDrawing, doubleClickZoom: !isDrawing },
            onError: (error, layer) => {
              console.error('[DeckMapManager] Layer rendering error:', {
                error: error.message,
                layerId: layer?.id,
              });
            },
          });
          this._scheduleRedraws();
        }
      } catch (error) {
        console.error('[DeckMapManager] Failed to convert spec:', error);
      }
    }
  }

  /**
   * Light render path: update only mask layers without re-running JSONConverter.
   * Used during active drawing to avoid triggering CARTO API calls on every vertex.
   */
  _updateMaskLayersOnly() {
    if (!this._deck || !this._maskLayerManager) return;

    // Always inject MaskExtension with dynamic maskId
    let dataLayers = this._maskLayerManager.injectMaskExtension(this._cachedConvertedLayers);

    const maskLayers = this._maskLayerManager.getMaskLayers();
    const allLayers = [...dataLayers, ...maskLayers];

    this._deck.setProps({
      layers: allLayers,
      controller: { dragPan: false, doubleClickZoom: false },
    });

    this._scheduleRedraws();
  }

  _injectCartoCredentials(layerJson) {
    const layer = JSON.parse(JSON.stringify(layerJson));

    if (layer['data'] && typeof layer['data'] === 'object') {
      const data = layer['data'];
      const funcName = data['@@function'];

      if (funcName && funcName.toLowerCase().includes('source')) {
        data['accessToken'] = this._environment.accessToken;
        data['apiBaseUrl'] = this._environment.apiBaseUrl;
        data['connectionName'] = this._environment.connectionName;
      }
    }

    return layer;
  }

  _scheduleRedraws() {
    if (!this._deck) return;
    const deck = this._deck;
    requestAnimationFrame(() => deck.redraw('all'));
    setTimeout(() => deck.redraw('all'), 50);
    setTimeout(() => deck.redraw('all'), 1100);
  }

  redraw() {
    this._scheduleRedraws();
  }

  getDeck() {
    return this._deck;
  }

  getMap() {
    return this._map;
  }

  destroy() {
    if (this._maskUnsubscribe) {
      this._maskUnsubscribe();
      this._maskUnsubscribe = null;
    }
    if (this._stateUnsubscribe) {
      this._stateUnsubscribe();
      this._stateUnsubscribe = null;
    }
    if (this._deck) {
      this._deck.finalize();
      this._deck = null;
    }
    if (this._map) {
      this._map.remove();
      this._map = null;
    }
  }
}
