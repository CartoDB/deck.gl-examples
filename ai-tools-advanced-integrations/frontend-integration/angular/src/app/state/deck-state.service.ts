/**
 * DeckState Service
 *
 * Centralized state management for deck.gl map.
 * Angular service equivalent of Vanilla's DeckState class.
 *
 * All state changes go through this service, and subscribers are notified.
 * The deck-map service subscribes and calls renderFromState on changes.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import type { MapViewState } from '@deck.gl/core';

/**
 * Basemap style options
 */
export type Basemap = 'dark-matter' | 'positron' | 'voyager';

/**
 * Layer specification in JSON format for JSONConverter
 */
export type LayerSpec = Record<string, unknown>;

/**
 * Deck.gl specification in JSON format (unified)
 */
export interface DeckSpec {
  initialViewState: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
    transitionDuration?: number;
  };
  layers: LayerSpec[];
  widgets: Record<string, unknown>[];
  effects: Record<string, unknown>[];
}

/**
 * Complete deck state data
 */
export interface DeckStateData {
  deckSpec: DeckSpec;
  basemap: Basemap;
  activeLayerId?: string;
}

/**
 * State change event with changed keys
 */
interface StateChange {
  state: DeckStateData;
  changedKeys: string[];
}

/**
 * Default initial view state
 */
export const DEFAULT_VIEW_STATE: MapViewState = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 3,
  bearing: 0,
  pitch: 0
};

/**
 * Default deck specification
 */
const DEFAULT_DECK_SPEC: DeckSpec = {
  initialViewState: {
    longitude: -110.5556199,
    latitude: 41.8097343,
    zoom: 3,
    pitch: 0,
    bearing: 0
  },
  layers: [],
  widgets: [],
  effects: []
};

@Injectable({
  providedIn: 'root'
})
export class DeckStateService {
  // Private state subjects
  private deckSpecSubject = new BehaviorSubject<DeckSpec>({ ...DEFAULT_DECK_SPEC });
  private basemapSubject = new BehaviorSubject<Basemap>('positron');
  private activeLayerIdSubject = new BehaviorSubject<string | undefined>(undefined);
  private changedKeysSubject = new BehaviorSubject<string[]>([]);

  // Track initial layer IDs to distinguish from chat-generated layers
  private initialLayerIds: Set<string> = new Set();

  // Track layer centers (captured when layer is first added)
  private layerCenters = new Map<string, { longitude: number; latitude: number; zoom: number }>();

  // Public observables
  public deckSpec$ = this.deckSpecSubject.asObservable();
  public basemap$ = this.basemapSubject.asObservable();
  public activeLayerId$ = this.activeLayerIdSubject.asObservable();

  /**
   * Combined state observable - emits whenever any state changes
   */
  public state$: Observable<StateChange> = combineLatest([
    this.deckSpecSubject,
    this.basemapSubject,
    this.activeLayerIdSubject,
    this.changedKeysSubject
  ]).pipe(
    map(([deckSpec, basemap, activeLayerId, changedKeys]) => ({
      state: {
        deckSpec,
        basemap,
        activeLayerId
      },
      changedKeys
    })),
    distinctUntilChanged((prev, curr) =>
      JSON.stringify(prev.state) === JSON.stringify(curr.state) &&
      JSON.stringify(prev.changedKeys) === JSON.stringify(curr.changedKeys)
    )
  );

  /**
   * Layers observable for components that only need layer info
   */
  public layers$: Observable<LayerSpec[]> = this.deckSpecSubject.pipe(
    map(spec => spec.layers),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  // ==================== GETTERS ====================

  getViewState(): MapViewState {
    const { longitude, latitude, zoom, pitch, bearing } = this.deckSpecSubject.value.initialViewState;
    return { longitude, latitude, zoom, pitch, bearing };
  }

  getDeckSpec(): DeckSpec {
    const spec = this.deckSpecSubject.value;
    return {
      initialViewState: { ...spec.initialViewState },
      layers: [...spec.layers],
      widgets: [...spec.widgets],
      effects: [...spec.effects]
    };
  }

  getBasemap(): Basemap {
    return this.basemapSubject.value;
  }

  getActiveLayerId(): string | undefined {
    return this.activeLayerIdSubject.value;
  }

  getState(): DeckStateData {
    return {
      deckSpec: this.getDeckSpec(),
      basemap: this.getBasemap(),
      activeLayerId: this.getActiveLayerId()
    };
  }

  getLayers(): LayerSpec[] {
    return [...this.deckSpecSubject.value.layers];
  }

  /**
   * Get the center coordinates for a layer (captured when layer was first added)
   */
  getLayerCenter(layerId: string): { longitude: number; latitude: number; zoom: number } | undefined {
    return this.layerCenters.get(layerId);
  }

  // ==================== SETTERS ====================

  /**
   * Update initialViewState (partial update supported)
   */
  setInitialViewState(partial: Partial<MapViewState> & { transitionDuration?: number }): void {
    const current = this.deckSpecSubject.value;
    const updated: DeckSpec = {
      ...current,
      initialViewState: {
        ...current.initialViewState,
        ...partial
      }
    };
    this.deckSpecSubject.next(updated);
    this.notifyChange(['initialViewState']);
  }

  /**
   * Set the deck layers, widgets, and effects
   * Preserves initialViewState, updates layers/widgets/effects
   * Captures current viewState as center for newly added layers
   */
  setDeckLayers(config: { layers: LayerSpec[]; widgets: Record<string, unknown>[]; effects: Record<string, unknown>[] }): void {
    const current = this.deckSpecSubject.value;
    const existingLayerIds = new Set(current.layers.map(l => l['id'] as string));

    // Capture center for new layers based on current initialViewState
    const currentViewState = current.initialViewState;
    const newLayers = config.layers ?? [];
    for (const layer of newLayers) {
      const layerId = layer['id'] as string;
      if (layerId && !existingLayerIds.has(layerId) && !this.layerCenters.has(layerId)) {
        this.layerCenters.set(layerId, {
          longitude: currentViewState.longitude,
          latitude: currentViewState.latitude,
          zoom: currentViewState.zoom
        });
      }
    }

    this.deckSpecSubject.next({
      ...current,
      layers: newLayers,
      widgets: config.widgets ?? [],
      effects: config.effects ?? []
    });
    this.notifyChange(['layers']);
  }

  /**
   * Update only the layers, preserving initialViewState, widgets and effects
   * Captures current viewState as center for newly added layers
   */
  setLayers(layers: LayerSpec[]): void {
    const current = this.deckSpecSubject.value;
    const existingLayerIds = new Set(current.layers.map(l => l['id'] as string));

    // Capture center for new layers based on current initialViewState
    const currentViewState = current.initialViewState;
    for (const layer of layers) {
      const layerId = layer['id'] as string;
      if (layerId && !existingLayerIds.has(layerId) && !this.layerCenters.has(layerId)) {
        this.layerCenters.set(layerId, {
          longitude: currentViewState.longitude,
          latitude: currentViewState.latitude,
          zoom: currentViewState.zoom
        });
      }
    }

    this.deckSpecSubject.next({
      ...current,
      layers
    });
    this.notifyChange(['layers']);
  }

  /**
   * Set the basemap style
   */
  setBasemap(basemap: Basemap): void {
    this.basemapSubject.next(basemap);
    this.notifyChange(['basemap']);
  }

  /**
   * Set the active layer ID
   */
  setActiveLayerId(layerId: string): void {
    this.activeLayerIdSubject.next(layerId);
    this.notifyChange(['activeLayerId']);
  }

  // ==================== UTILITIES ====================

  /**
   * Set initial layer IDs to track which layers are not chat-generated
   */
  setInitialLayerIds(ids: string[]): void {
    this.initialLayerIds = new Set(ids);
  }

  /**
   * Clear all chat-generated layers, keeping only initial layers
   */
  clearChatGeneratedLayers(): void {
    const currentLayers = this.getLayers();
    const initialLayers = currentLayers.filter(
      layer => this.initialLayerIds.has(layer['id'] as string)
    );

    // Clear layer centers for removed layers
    const removedLayerIds = currentLayers
      .filter(layer => !this.initialLayerIds.has(layer['id'] as string))
      .map(layer => layer['id'] as string);
    for (const layerId of removedLayerIds) {
      this.layerCenters.delete(layerId);
    }

    this.setLayers(initialLayers);
    // Clear active layer if it was a chat-generated layer
    const activeLayerId = this.getActiveLayerId();
    if (activeLayerId && !this.initialLayerIds.has(activeLayerId)) {
      this.activeLayerIdSubject.next(undefined);
    }
  }

  // ==================== PRIVATE ====================

  private notifyChange(changedKeys: string[]): void {
    this.changedKeysSubject.next(changedKeys);
  }
}
