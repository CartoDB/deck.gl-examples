/**
 * Deck Map Composable
 *
 * Manages deck.gl and MapLibre instances imperatively.
 * Uses renderFromState pattern with JSONConverter for layer rendering.
 * Singleton composable.
 */

import { watch } from 'vue';
import { Deck, Layer } from '@deck.gl/core';
import { MaskExtension } from '@deck.gl/extensions';
import { log as lumaLog } from '@luma.gl/core';
import { BASEMAP } from '@deck.gl/carto';
import maplibregl from 'maplibre-gl';
import { useDeckState, type Basemap, type DeckSpec, type DeckStateData, DEFAULT_VIEW_STATE } from './useDeckState';
import { useMaskLayer } from './useMaskLayer';
import { getJsonConverter } from '../config/deck-json-config';
import { getTooltipContent } from '../utils/tooltip';
import { environment } from '../config/environment';

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * Basemap URL mapping
 */
const BASEMAP_URLS: Record<Basemap, string> = {
  'dark-matter': BASEMAP.DARK_MATTER,
  'positron': BASEMAP.POSITRON,
  'voyager': BASEMAP.VOYAGER,
};

// Module-scoped singleton
let _instance: ReturnType<typeof createDeckMapComposable> | null = null;

function createDeckMapComposable() {
  const deckState = useDeckState();
  const maskLayer = useMaskLayer();

  let deck: Deck<any> | null = null;
  let map: maplibregl.Map | null = null;
  let unwatchState: (() => void) | null = null;
  let onViewStateChangeCallback: ((vs: ViewState) => void) | null = null;
  let cachedConvertedLayers: any[] = [];

  /**
   * Initialize deck.gl and MapLibre instances
   */
  async function initialize(
    containerId: string,
    canvasId: string
  ): Promise<{ deck: Deck<any>; map: maplibregl.Map }> {
    const initialViewState = deckState.getViewState();

    // Create MapLibre map
    map = new maplibregl.Map({
      container: containerId,
      style: BASEMAP_URLS[deckState.state.basemap],
      interactive: false,
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
    });

    await new Promise<void>((resolve) => {
      map!.on('load', () => {
        console.log('[useDeckMap] MapLibre loaded');
        resolve();
      });
    });

    // Suppress verbose luma.gl logging (ShaderFactory debug messages)
    lumaLog.level = 0;

    // Create deck.gl instance
    deck = new Deck({
      canvas: canvasId,
      initialViewState: {
        ...initialViewState,
        transitionDuration: 0,
      },
      controller: true,
      layers: [],
      onViewStateChange: ({ viewState: vs }) => {
        const viewState = vs as unknown as ViewState;
        if (map) {
          map.jumpTo({
            center: [viewState.longitude, viewState.latitude],
            zoom: viewState.zoom,
            bearing: viewState.bearing,
            pitch: viewState.pitch,
          });
        }
        // Update deck state's current view state
        deckState.updateCurrentViewState(viewState);
        // Emit view state changes for UI
        if (onViewStateChangeCallback) {
          onViewStateChangeCallback(viewState);
        }
      },
      // Tooltip for all pickable layers - shows top 5 relevant properties
      getTooltip: (info) => getTooltipContent(info),
      _animate: true,
    } as ConstructorParameters<typeof Deck>[0]);

    // Emit initial view state
    if (onViewStateChangeCallback) {
      onViewStateChangeCallback({
        longitude: initialViewState.longitude ?? DEFAULT_VIEW_STATE.longitude,
        latitude: initialViewState.latitude ?? DEFAULT_VIEW_STATE.latitude,
        zoom: initialViewState.zoom ?? DEFAULT_VIEW_STATE.zoom,
        pitch: initialViewState.pitch ?? 0,
        bearing: initialViewState.bearing ?? 0,
      });
    }

    console.log('[useDeckMap] Initialized');
    return { deck, map };
  }

  /**
   * Start watching deck state for changes.
   * Uses separate watchers with getter functions so Vue can properly
   * detect old vs new values (deep watch on a reactive object gives
   * the same reference for both, making diffing impossible).
   */
  function startWatching() {
    const watchers: (() => void)[] = [];

    watchers.push(watch(
      () => deckState.state.basemap,
      () => {
        renderFromState(deckState.state as unknown as DeckStateData, ['basemap']);
      }
    ));

    watchers.push(watch(
      () => deckState.state.deckSpec.initialViewState,
      () => {
        renderFromState(deckState.state as unknown as DeckStateData, ['initialViewState']);
      },
      { deep: true }
    ));

    watchers.push(watch(
      () => deckState.state.deckSpec.layers,
      () => {
        renderFromState(deckState.state as unknown as DeckStateData, ['layers']);
      },
      { deep: true }
    ));

    // Watch mask layer state changes — use light render during drawing to avoid API calls
    watchers.push(watch(
      () => maskLayer.state,
      () => {
        if (maskLayer.state.isDrawing) {
          updateMaskLayersOnly();
        } else {
          renderFromState(deckState.state as unknown as DeckStateData, ['layers']);
        }
      },
      { deep: true }
    ));

    unwatchState = () => watchers.forEach(unwatch => unwatch());
  }

  /**
   * Render from state - central rendering function
   * Converts DeckStateData to rendered deck.gl layers via JSONConverter
   */
  function renderFromState(state: DeckStateData, changedKeys: string[]): void {
    if (!deck || !map) {
      console.warn('[useDeckMap] Not initialized');
      return;
    }

    const jsonConverter = getJsonConverter();
    console.log('[useDeckMap] Rendering state update:', changedKeys);

    // Update basemap
    if (changedKeys.includes('basemap')) {
      const basemapUrl = BASEMAP_URLS[state.basemap];
      if (basemapUrl) {
        map.setStyle(basemapUrl);
        console.log('[useDeckMap] Basemap updated:', state.basemap);
      }
    }

    // Update view state and/or layers via unified JSONConverter
    if (changedKeys.includes('initialViewState') || changedKeys.includes('layers')) {
      // Clone the spec to avoid mutating the original
      const spec = JSON.parse(JSON.stringify(state.deckSpec));

      // Inject layer IDs and CARTO credentials
      spec.layers = (spec.layers || []).map((layer: Record<string, unknown>, i: number) => {
        const layerWithId = { ...layer, id: layer.id || `layer-${i}` };
        return injectCartoCredentials(layerWithId);
      });

      console.log('[useDeckMap] Converting full spec with', spec.layers.length, 'layers');

      try {
        // Convert the entire spec (initialViewState + layers + widgets + effects)
        const deckProps = jsonConverter.convert(spec);

        // Cache raw converted layers BEFORE MaskExtension injection (for light render during drawing)
        let convertedLayers = (deckProps as any).layers || [];
        cachedConvertedLayers = convertedLayers;

        // Always inject MaskExtension (pre-registers MaskEffect for first-polygon fix)
        convertedLayers = maskLayer.injectMaskExtension(convertedLayers);

        // Append mask layers (GeoJsonLayer + optional EditableGeoJsonLayer)
        const maskLayers = maskLayer.getMaskLayers();
        const allLayers = [...convertedLayers, ...maskLayers];

        // Set all props on deck with error handling
        deck.setProps({
          ...deckProps,
          layers: allLayers,
          controller: { dragPan: !maskLayer.state.isDrawing, doubleClickZoom: !maskLayer.state.isDrawing },
          onError: (error: Error, layer: Layer | null) => {
            console.error('[useDeckMap] Layer rendering error:', {
              error: error.message,
              stack: error.stack,
              layerId: layer?.id,
              layerType: layer?.constructor?.name,
            });
          },
        });

        scheduleRedraws();
        console.log('[useDeckMap] Set deck props from unified spec');
      } catch (error) {
        console.error('[useDeckMap] Failed to convert spec:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }

  /**
   * Light render path: update only mask layers without re-running JSONConverter.
   * Used during active drawing to avoid triggering CARTO API calls on every vertex.
   */
  function updateMaskLayersOnly(): void {
    if (!deck) return;

    // Always inject MaskExtension with dynamic maskId
    let dataLayers = maskLayer.injectMaskExtension(cachedConvertedLayers);

    const maskLayers = maskLayer.getMaskLayers();
    const allLayers = [...dataLayers, ...maskLayers];

    deck.setProps({
      layers: allLayers,
      controller: { dragPan: false, doubleClickZoom: false },
    });

    scheduleRedraws();
  }

  /**
   * Inject CARTO credentials into layer data sources
   */
  function injectCartoCredentials(layerJson: Record<string, unknown>): Record<string, unknown> {
    const layer = JSON.parse(JSON.stringify(layerJson));

    if (layer['data'] && typeof layer['data'] === 'object') {
      const data = layer['data'] as Record<string, unknown>;
      const funcName = data['@@function'] as string | undefined;

      if (funcName && funcName.toLowerCase().includes('source')) {
        // Always use credentials from environment
        data['accessToken'] = environment.accessToken;
        data['apiBaseUrl'] = environment.apiBaseUrl;
        data['connectionName'] = environment.connectionName;
      }
    }

    return layer;
  }

  /**
   * Schedule multiple redraws to ensure updates are visible
   */
  function scheduleRedraws(): void {
    if (!deck) return;

    const deckInstance = deck;
    requestAnimationFrame(() => deckInstance.redraw('all' as any));
    setTimeout(() => deckInstance.redraw('all' as any), 50);
    setTimeout(() => deckInstance.redraw('all' as any), 1100);
  }

  /**
   * Force a redraw
   */
  function redraw(): void {
    scheduleRedraws();
  }

  function getDeck(): Deck<any> | null {
    return deck;
  }

  function getMap(): maplibregl.Map | null {
    return map;
  }

  function destroy(): void {
    if (unwatchState) {
      unwatchState();
      unwatchState = null;
    }

    if (deck) {
      deck.finalize();
      deck = null;
    }
    if (map) {
      map.remove();
      map = null;
    }
  }

  function onViewStateChange(callback: (vs: ViewState) => void) {
    onViewStateChangeCallback = callback;
  }

  return {
    initialize,
    startWatching,
    renderFromState,
    redraw,
    getDeck,
    getMap,
    destroy,
    onViewStateChange,
  };
}

export function useDeckMap() {
  if (!_instance) {
    _instance = createDeckMapComposable();
  }
  return _instance;
}
