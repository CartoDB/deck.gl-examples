/**
 * DeckState
 *
 * Centralized state management for deck.gl map.
 * Port of Angular's DeckStateService using EventEmitter instead of RxJS.
 */

import { EventEmitter } from './event-emitter.js';


export const DEFAULT_VIEW_STATE = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 3,
  bearing: 0,
  pitch: 0,
};

export class DeckState extends EventEmitter {
  constructor() {
    super();
    this._deckSpec = {
      initialViewState: { ...DEFAULT_VIEW_STATE },
      layers: [],
      widgets: [],
      effects: [],
    };
    this._basemap = 'positron';
    this._activeLayerId = undefined;

    // Track initial layer IDs to distinguish from chat-generated layers
    this._initialLayerIds = new Set();

    // Track layer centers (captured when layer is first added)
    this._layerCenters = new Map();
  }

  // ==================== GETTERS ====================

  getViewState() {
    // Return coordinates only (without transitionDuration/transitionInterpolator for backward compat)
    const { transitionDuration, transitionInterpolator, ...coords } = this._deckSpec.initialViewState;
    return { ...coords };
  }

  getDeckSpec() {
    return {
      initialViewState: { ...this._deckSpec.initialViewState },
      layers: [...this._deckSpec.layers],
      widgets: [...this._deckSpec.widgets],
      effects: [...this._deckSpec.effects],
    };
  }

  getBasemap() {
    return this._basemap;
  }

  getActiveLayerId() {
    return this._activeLayerId;
  }

  getState() {
    return {
      deckSpec: this.getDeckSpec(),
      basemap: this.getBasemap(),
      activeLayerId: this.getActiveLayerId(),
    };
  }

  getLayers() {
    return [...this._deckSpec.layers];
  }

  getLayerCenter(layerId) {
    return this._layerCenters.get(layerId);
  }

  // ==================== SETTERS ====================

  setInitialViewState(partial) {
    const { transitionDuration, ...viewStatePartial } = partial;

    // Merge the partial into existing initialViewState
    const merged = { ...this._deckSpec.initialViewState, ...viewStatePartial };

    // Add transitionDuration if specified, remove if not
    if (transitionDuration !== undefined && transitionDuration > 0) {
      merged.transitionDuration = transitionDuration;
    } else {
      delete merged.transitionDuration;
    }

    this._deckSpec.initialViewState = merged;
    this._notifyChange(['initialViewState']);
  }

  setDeckLayers(config) {
    const existingLayerIds = new Set(this._deckSpec.layers.map((l) => l['id']));

    // Capture center for new layers based on current initialViewState
    const newLayers = config.layers ?? [];
    for (const layer of newLayers) {
      const layerId = layer['id'];
      if (layerId && !existingLayerIds.has(layerId) && !this._layerCenters.has(layerId)) {
        this._layerCenters.set(layerId, {
          longitude: this._deckSpec.initialViewState.longitude ?? 0,
          latitude: this._deckSpec.initialViewState.latitude ?? 0,
          zoom: this._deckSpec.initialViewState.zoom ?? 12,
        });
      }
    }

    this._deckSpec = {
      ...this._deckSpec,
      layers: newLayers,
      widgets: config.widgets ?? [],
      effects: config.effects ?? [],
    };
    this._notifyChange(['layers']);
  }

  setLayers(layers) {
    const existingLayerIds = new Set(this._deckSpec.layers.map((l) => l['id']));

    // Capture center for new layers
    for (const layer of layers) {
      const layerId = layer['id'];
      if (layerId && !existingLayerIds.has(layerId) && !this._layerCenters.has(layerId)) {
        this._layerCenters.set(layerId, {
          longitude: this._deckSpec.initialViewState.longitude ?? 0,
          latitude: this._deckSpec.initialViewState.latitude ?? 0,
          zoom: this._deckSpec.initialViewState.zoom ?? 12,
        });
      }
    }

    this._deckSpec = {
      ...this._deckSpec,
      layers,
    };
    this._notifyChange(['layers']);
  }

  setBasemap(basemap) {
    this._basemap = basemap;
    this._notifyChange(['basemap']);
  }

  setActiveLayerId(layerId) {
    this._activeLayerId = layerId;
    this._notifyChange(['activeLayerId']);
  }

  // ==================== UTILITIES ====================

  setInitialLayerIds(ids) {
    this._initialLayerIds = new Set(ids);
  }

  clearChatGeneratedLayers() {
    const currentLayers = this.getLayers();
    const initialLayers = currentLayers.filter((layer) =>
      this._initialLayerIds.has(layer['id'])
    );

    // Clear layer centers for removed layers
    const removedLayerIds = currentLayers
      .filter((layer) => !this._initialLayerIds.has(layer['id']))
      .map((layer) => layer['id']);
    for (const layerId of removedLayerIds) {
      this._layerCenters.delete(layerId);
    }

    this.setLayers(initialLayers);

    // Clear active layer if it was a chat-generated layer
    if (this._activeLayerId && !this._initialLayerIds.has(this._activeLayerId)) {
      this._activeLayerId = undefined;
    }
  }

  // ==================== PRIVATE ====================

  _notifyChange(changedKeys) {
    this.emit('change', {
      state: this.getState(),
      changedKeys,
    });
  }
}
