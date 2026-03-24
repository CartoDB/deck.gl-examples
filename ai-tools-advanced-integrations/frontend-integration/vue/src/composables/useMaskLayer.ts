/**
 * Mask Layer Composable
 *
 * Manages editable mask layer state for spatial filtering.
 */

import { reactive, computed } from 'vue';
import { GeoJsonLayer } from '@deck.gl/layers';
import { MaskExtension } from '@deck.gl/extensions';
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
  currentMode: string;
  selectedFeatureIndexes: number[];
}

function normalizeToFeatureCollection(input: any): GeoJSON.FeatureCollection {
  if (input.type === 'FeatureCollection') return input;
  if (input.type === 'Feature')
    return { type: 'FeatureCollection', features: [input] };
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: input, properties: {} }],
  };
}

let _instance: ReturnType<typeof createMaskLayerComposable> | null = null;

function createMaskLayerComposable() {
  const maskExtension = new MaskExtension();
  const editMode = new CompositeMode([new TranslateMode() as any, new ModifyMode() as any]);
  const state = reactive<MaskLayerState>({
    geometry: null,
    committedGeometry: null,
    isDrawing: false,
    currentMode: 'draw',
    selectedFeatureIndexes: [],
  });

  const isMaskActive = computed(
    () => state.geometry !== null && state.geometry.features.length > 0
  );

  function setMaskGeometry(geojson: any): void {
    const geometry = normalizeToFeatureCollection(geojson);
    state.geometry = geometry;
    state.committedGeometry = geometry;
    state.isDrawing = true;
    state.currentMode = 'edit';
    state.selectedFeatureIndexes = geometry.features.length > 0 ? [0] : [];
  }

  function enableDrawMode(): void {
    state.isDrawing = true;
    state.currentMode = 'draw';
    if (!state.geometry) {
      state.geometry = { type: 'FeatureCollection', features: [] };
    }
    state.selectedFeatureIndexes = [];
  }

  function disableDrawMode(): void {
    state.isDrawing = false;
  }

  function setDrawMode(modeName: string): void {
    state.currentMode = modeName;
    state.selectedFeatureIndexes =
      modeName === 'edit' && state.geometry && state.geometry.features.length > 0
        ? [0]
        : [];
  }

  function clearMask(): void {
    state.geometry = null;
    state.committedGeometry = null;
    state.isDrawing = false;
    state.currentMode = 'draw';
    state.selectedFeatureIndexes = [];
  }

  function getMaskLayers(): any[] {
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
        new EditableGeoJsonLayer({
          id: EDITABLE_MASK_LAYER_ID,
          data: state.geometry || { type: 'FeatureCollection', features: [] },
          mode: state.currentMode === 'draw' ? DrawPolygonMode
              : state.currentMode === 'edit' ? editMode
              : ViewMode,
          selectedFeatureIndexes: state.selectedFeatureIndexes,
          onEdit: ({ updatedData, editType }: { updatedData: GeoJSON.FeatureCollection; editType: string }) => {
            if (editType === 'updateTentativeFeature') return;
            state.geometry = updatedData;
            if (FINISHED_EDIT_TYPES.has(editType)) {
              state.committedGeometry = updatedData;
            }
          },
          onClick: (info: any) => {
            if (info.index >= 0 && state.currentMode === 'edit') {
              state.selectedFeatureIndexes = [info.index];
            }
          },
          getFillColor: [3, 111, 226, 25],
          getLineColor: [3, 111, 226, 200],
          getLineWidth: 2,
          pickable: true,
        } as any)
      );
    }

    return layers;
  }

  function injectMaskExtension(layers: any[]): any[] {
    const active = isMaskActive.value;
    return layers.map((layer: any) => {
      const layerId = layer.id || '';
      if (layerId.startsWith('__')) return layer;
      return layer.clone({
        extensions: [...(layer.props?.extensions || []), maskExtension],
        maskId: active ? MASK_LAYER_ID : '',
      });
    });
  }

  return {
    state,
    isMaskActive,
    setMaskGeometry,
    enableDrawMode,
    disableDrawMode,
    setDrawMode,
    clearMask,
    getMaskLayers,
    injectMaskExtension,
  };
}

export function useMaskLayer() {
  if (!_instance) {
    _instance = createMaskLayerComposable();
  }
  return _instance;
}
