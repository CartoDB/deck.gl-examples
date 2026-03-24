/**
 * Mask Layer Hook
 *
 * Manages editable mask layer state for spatial filtering.
 * Provides GeoJsonLayer (mask) + EditableGeoJsonLayer (drawing) + MaskExtension injection.
 */

import { useState, useCallback, useRef } from 'react';
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

export function useMaskLayer() {
  const [state, setState] = useState<MaskLayerState>({
    geometry: null,
    committedGeometry: null,
    isDrawing: false,
    currentMode: 'draw',
    selectedFeatureIndexes: [],
  });

  const maskExtensionRef = useRef(new MaskExtension());
  const editModeRef = useRef(new CompositeMode([new TranslateMode() as any, new ModifyMode() as any]));

  const setMaskGeometry = useCallback((geojson: any) => {
    const geometry = normalizeToFeatureCollection(geojson);
    setState((prev) => ({
      ...prev,
      geometry,
      committedGeometry: geometry,
      isDrawing: true,
      currentMode: 'edit',
      selectedFeatureIndexes: geometry.features.length > 0 ? [0] : [],
    }));
  }, []);

  const enableDrawMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDrawing: true,
      currentMode: 'draw',
      geometry: prev.geometry || { type: 'FeatureCollection', features: [] },
      selectedFeatureIndexes: [],
    }));
  }, []);

  const disableDrawMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isDrawing: false,
    }));
  }, []);

  const setDrawMode = useCallback((modeName: string) => {
    setState((prev) => ({
      ...prev,
      currentMode: modeName,
      selectedFeatureIndexes:
        modeName === 'edit' && prev.geometry && prev.geometry.features.length > 0
          ? [0]
          : [],
    }));
  }, []);

  const clearMask = useCallback(() => {
    setState({
      geometry: null,
      committedGeometry: null,
      isDrawing: false,
      currentMode: 'draw',
      selectedFeatureIndexes: [],
    });
  }, []);

  const getMaskLayers = useCallback((): any[] => {
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
              : state.currentMode === 'edit' ? editModeRef.current
              : ViewMode,
          selectedFeatureIndexes: state.selectedFeatureIndexes,
          onEdit: ({ updatedData, editType }: { updatedData: GeoJSON.FeatureCollection; editType: string }) => {
            if (editType === 'updateTentativeFeature') return;
            setState((prev) => ({
              ...prev,
              geometry: updatedData,
              ...(FINISHED_EDIT_TYPES.has(editType) ? { committedGeometry: updatedData } : {}),
            }));
          },
          onClick: (info: any) => {
            if (info.index >= 0 && state.currentMode === 'edit') {
              setState((prev) => ({ ...prev, selectedFeatureIndexes: [info.index] }));
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
  }, [state]);

  const isMaskActive =
    state.geometry !== null && state.geometry.features.length > 0;

  const injectMaskExtension = useCallback(
    (layers: any[]): any[] => {
      return layers.map((layer: any) => {
        const layerId = layer.id || '';
        if (layerId.startsWith('__')) return layer;
        return layer.clone({
          extensions: [...(layer.props?.extensions || []), maskExtensionRef.current],
          maskId: isMaskActive ? MASK_LAYER_ID : '',
        });
      });
    },
    [isMaskActive]
  );

  return {
    maskState: state,
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
