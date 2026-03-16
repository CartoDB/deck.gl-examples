/**
 * Mask Layer Service
 *
 * Manages editable mask layer state for spatial filtering.
 * Uses three-layer composition:
 * 1. GeoJsonLayer (operation: 'mask') — defines mask geometry
 * 2. EditableGeoJsonLayer — user interaction layer for drawing
 * 3. MaskExtension injected into data layers (handled by DeckMapService)
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';
import { GeoJsonLayer } from '@deck.gl/layers';
import {
  EditableGeoJsonLayer,
  DrawPolygonMode,
  ModifyMode,
  TranslateMode,
  ViewMode,
  CompositeMode,
} from '@deck.gl-community/editable-layers';

export const MASK_LAYER_ID = '__mask-layer__';
const EDITABLE_MASK_LAYER_ID = '__editable-mask__';

const FINISHED_EDIT_TYPES = new Set([
  'addFeature',
  'finishMovePosition',
  'translated',
  'addPosition',
  'removePosition',
  'scaled',
  'rotated',
  'extruded',
  'split',
]);

interface MaskLayerState {
  geometry: GeoJSON.FeatureCollection | null;
  committedGeometry: GeoJSON.FeatureCollection | null;
  isDrawing: boolean;
  mode: any;
  selectedFeatureIndexes: number[];
}

@Injectable({ providedIn: 'root' })
export class MaskLayerService {
  private maskState = new BehaviorSubject<MaskLayerState>({
    geometry: null,
    committedGeometry: null,
    isDrawing: false,
    mode: ViewMode,
    selectedFeatureIndexes: [],
  });

  public maskState$ = this.maskState.asObservable();
  public maskGeometry$ = this.maskState$.pipe(
    map((s) => s.geometry),
    distinctUntilChanged()
  );
  public committedMaskGeometry$ = this.maskState$.pipe(
    map((s) => s.committedGeometry),
    distinctUntilChanged()
  );
  public hasMask$ = this.maskGeometry$.pipe(
    map((g) => g !== null && g.features.length > 0)
  );

  private normalizeToFeatureCollection(
    input: any
  ): GeoJSON.FeatureCollection {
    if (input.type === 'FeatureCollection') return input;
    if (input.type === 'Feature')
      return { type: 'FeatureCollection', features: [input] };
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: input, properties: {} }],
    };
  }

  setMaskGeometry(geojson: any): void {
    const geometry = this.normalizeToFeatureCollection(geojson);
    this.maskState.next({
      ...this.maskState.getValue(),
      geometry,
      committedGeometry: geometry,
      isDrawing: true,
      mode: new CompositeMode([new TranslateMode(), new ModifyMode()]),
      selectedFeatureIndexes: geometry.features.length > 0 ? [0] : [],
    });
  }

  enableDrawMode(): void {
    const current = this.maskState.getValue();
    this.maskState.next({
      ...current,
      isDrawing: true,
      mode: DrawPolygonMode,
      geometry: current.geometry || { type: 'FeatureCollection', features: [] },
      selectedFeatureIndexes: [],
    });
  }

  disableDrawMode(): void {
    const current = this.maskState.getValue();
    this.maskState.next({
      ...current,
      isDrawing: false,
      mode: ViewMode,
    });
  }

  setDrawMode(modeName: string): void {
    const current = this.maskState.getValue();
    let mode: any;
    let selectedFeatureIndexes: number[] = [];
    switch (modeName) {
      case 'draw':
        mode = DrawPolygonMode;
        break;
      case 'edit':
        mode = new CompositeMode([new TranslateMode(), new ModifyMode()]);
        selectedFeatureIndexes = current.geometry && current.geometry.features.length > 0 ? [0] : [];
        break;
      case 'remove':
        mode = ViewMode;
        break;
      default:
        mode = DrawPolygonMode;
    }
    this.maskState.next({ ...current, mode, selectedFeatureIndexes });
  }

  clearMask(): void {
    this.maskState.next({
      geometry: null,
      committedGeometry: null,
      isDrawing: false,
      mode: ViewMode,
      selectedFeatureIndexes: [],
    });
  }

  getMaskLayers(): any[] {
    const state = this.maskState.getValue();
    const layers: any[] = [];

    if (state.geometry && state.geometry.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: MASK_LAYER_ID,
          data: state.geometry,
          operation: 'mask' as any,
        })
      );
    }

    if (state.isDrawing) {
      layers.push(
        new (EditableGeoJsonLayer as any)({
          id: EDITABLE_MASK_LAYER_ID,
          data: state.geometry || { type: 'FeatureCollection', features: [] },
          mode: state.mode,
          selectedFeatureIndexes: state.selectedFeatureIndexes,
          onEdit: ({ updatedData, editType }: { updatedData: GeoJSON.FeatureCollection; editType: string }) => {
            if (editType === 'updateTentativeFeature') return;
            this.maskState.next({
              ...this.maskState.getValue(),
              geometry: updatedData,
              ...(FINISHED_EDIT_TYPES.has(editType) ? { committedGeometry: updatedData } : {}),
            });
          },
          onClick: (info: any) => {
            if (info.index >= 0) {
              const current = this.maskState.getValue();
              if (current.mode !== DrawPolygonMode && current.mode !== ViewMode) {
                this.maskState.next({ ...current, selectedFeatureIndexes: [info.index] });
              }
            }
          },
          getFillColor: [3, 111, 226, 25],
          getLineColor: [3, 111, 226, 200],
          getLineWidth: 2,
          pickable: true,
        })
      );
    }

    return layers;
  }

  isMaskActive(): boolean {
    const state = this.maskState.getValue();
    return state.geometry !== null && state.geometry.features.length > 0;
  }

  getState(): MaskLayerState {
    return this.maskState.getValue();
  }

  getCurrentModeName(): string {
    const state = this.maskState.getValue();
    if (state.mode === DrawPolygonMode) return 'draw';
    if (state.mode === ViewMode) return 'remove';
    return 'edit';
  }

  handleRemoveClick(index: number): void {
    const current = this.maskState.getValue();
    if (!current.geometry) return;
    const features = [...current.geometry.features];
    features.splice(index, 1);
    const geometry: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
    this.maskState.next({
      ...current,
      geometry,
      committedGeometry: geometry,
    });
  }
}
