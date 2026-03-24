import { reactive, readonly } from 'vue';
import type { LayerSpec } from '../utils/layer-merge';

export type Basemap = 'dark-matter' | 'positron' | 'voyager';

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface DeckSpec {
  initialViewState: ViewState & { transitionDuration?: number };
  layers: LayerSpec[];
  widgets: Record<string, unknown>[];
  effects: Record<string, unknown>[];
}

export interface DeckStateData {
  deckSpec: DeckSpec;
  basemap: Basemap;
  activeLayerId?: string;
}

const DEFAULT_VIEW_STATE: ViewState = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 3,
  bearing: 0,
  pitch: 0,
};

// Module-scoped singleton
let _instance: ReturnType<typeof createDeckState> | null = null;

function createDeckState() {
  const data = reactive<DeckStateData>({
    deckSpec: {
      initialViewState: { ...DEFAULT_VIEW_STATE },
      layers: [],
      widgets: [],
      effects: [],
    },
    basemap: 'positron',
    activeLayerId: undefined,
  });

  // Non-reactive mutable refs (like React's useRef)
  const layerCenters = new Map<string, { longitude: number; latitude: number; zoom: number }>();
  const initialLayerIds = new Set<string>();
  let currentViewState: ViewState = { ...DEFAULT_VIEW_STATE };

  function setInitialViewState(partial: Partial<ViewState> & { transitionDuration?: number }) {
    const { transitionDuration, ...viewStatePartial } = partial;
    currentViewState = { ...currentViewState, ...viewStatePartial };
    Object.assign(data.deckSpec.initialViewState, viewStatePartial);
    data.deckSpec.initialViewState.transitionDuration = transitionDuration ?? 1000;
  }

  function updateCurrentViewState(vs: Partial<ViewState>) {
    currentViewState = { ...currentViewState, ...vs };
  }

  function setDeckLayers(config: { layers: LayerSpec[]; widgets: Record<string, unknown>[]; effects: Record<string, unknown>[] }) {
    const existingLayerIds = new Set(data.deckSpec.layers.map((l) => l['id'] as string));
    for (const layer of config.layers ?? []) {
      const layerId = layer['id'] as string;
      if (layerId && !existingLayerIds.has(layerId) && !layerCenters.has(layerId)) {
        layerCenters.set(layerId, {
          longitude: currentViewState.longitude ?? 0,
          latitude: currentViewState.latitude ?? 0,
          zoom: currentViewState.zoom ?? 12,
        });
      }
    }
    data.deckSpec.layers = config.layers;
    data.deckSpec.widgets = config.widgets;
    data.deckSpec.effects = config.effects;
  }

  function setLayers(layers: LayerSpec[]) {
    const existingLayerIds = new Set(data.deckSpec.layers.map((l) => l['id'] as string));
    for (const layer of layers) {
      const layerId = layer['id'] as string;
      if (layerId && !existingLayerIds.has(layerId) && !layerCenters.has(layerId)) {
        layerCenters.set(layerId, {
          longitude: currentViewState.longitude ?? 0,
          latitude: currentViewState.latitude ?? 0,
          zoom: currentViewState.zoom ?? 12,
        });
      }
    }
    data.deckSpec.layers = layers;
  }

  function setBasemap(basemap: Basemap) { data.basemap = basemap; }
  function setActiveLayerId(id: string | undefined) { data.activeLayerId = id; }
  function getViewState(): ViewState { return { ...currentViewState }; }
  function getDeckSpec(): DeckSpec {
    return JSON.parse(JSON.stringify(data.deckSpec));
  }
  function getLayerCenter(layerId: string) { return layerCenters.get(layerId); }

  function clearChatGeneratedLayers() {
    const removedLayerIds = data.deckSpec.layers
      .filter((layer) => !initialLayerIds.has(layer['id'] as string))
      .map((layer) => layer['id'] as string);
    for (const layerId of removedLayerIds) {
      layerCenters.delete(layerId);
    }
    data.deckSpec.layers = data.deckSpec.layers.filter((layer) =>
      initialLayerIds.has(layer['id'] as string)
    );
    if (data.activeLayerId && !initialLayerIds.has(data.activeLayerId)) {
      data.activeLayerId = undefined;
    }
  }

  function setInitialLayerIds(ids: string[]) {
    initialLayerIds.clear();
    ids.forEach((id) => initialLayerIds.add(id));
  }

  return {
    state: readonly(data),
    setInitialViewState,
    updateCurrentViewState,
    setDeckLayers,
    setLayers,
    setBasemap,
    setActiveLayerId,
    getViewState,
    getDeckSpec,
    getLayerCenter,
    clearChatGeneratedLayers,
    setInitialLayerIds,
  };
}

export function useDeckState() {
  if (!_instance) _instance = createDeckState();
  return _instance;
}

export { DEFAULT_VIEW_STATE };
