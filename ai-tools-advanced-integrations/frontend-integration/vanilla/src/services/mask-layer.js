/**
 * Mask Layer Manager
 *
 * Manages editable mask layer state for spatial filtering.
 * Port of Angular's MaskLayerService.
 */

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
import { EventEmitter } from '../state/event-emitter.js';

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

function normalizeToFeatureCollection(input) {
  if (input.type === 'FeatureCollection') return input;
  if (input.type === 'Feature')
    return { type: 'FeatureCollection', features: [input] };
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: input, properties: {} }],
  };
}

export class MaskLayerManager extends EventEmitter {
  constructor() {
    super();
    this._maskExtension = new MaskExtension();
    this._editMode = new CompositeMode([new TranslateMode(), new ModifyMode()]);
    this._state = {
      geometry: null,
      committedGeometry: null,
      isDrawing: false,
      currentMode: 'draw',
      selectedFeatureIndexes: [],
    };
  }

  getState() {
    return { ...this._state };
  }

  isMaskActive() {
    return this._state.geometry !== null && this._state.geometry.features.length > 0;
  }

  setMaskGeometry(geojson) {
    const geometry = normalizeToFeatureCollection(geojson);
    this._state.geometry = geometry;
    this._state.committedGeometry = geometry;
    this._state.isDrawing = true;
    this._state.currentMode = 'edit';
    this._state.selectedFeatureIndexes = geometry.features.length > 0 ? [0] : [];
    this._emitChange();
    this._emitGeometryCommitted();
  }

  enableDrawMode() {
    this._state.isDrawing = true;
    this._state.currentMode = 'draw';
    if (!this._state.geometry) {
      this._state.geometry = { type: 'FeatureCollection', features: [] };
    }
    this._state.selectedFeatureIndexes = [];
    this._emitChange();
  }

  disableDrawMode() {
    this._state.isDrawing = false;
    this._emitChange();
  }

  setDrawMode(modeName) {
    this._state.currentMode = modeName;
    this._state.selectedFeatureIndexes =
      modeName === 'edit' && this._state.geometry && this._state.geometry.features.length > 0
        ? [0]
        : [];
    this._emitChange();
  }

  clearMask() {
    this._state.geometry = null;
    this._state.committedGeometry = null;
    this._state.isDrawing = false;
    this._state.currentMode = 'draw';
    this._state.selectedFeatureIndexes = [];
    this._emitChange();
    this._emitGeometryCommitted();
  }

  getMaskLayers() {
    const layers = [];

    if (this._state.geometry && this._state.geometry.features.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: MASK_LAYER_ID,
          data: this._state.geometry,
          operation: 'mask',
        })
      );
    }

    if (this._state.isDrawing) {
      layers.push(
        new EditableGeoJsonLayer({
          id: EDITABLE_MASK_LAYER_ID,
          data: this._state.geometry || { type: 'FeatureCollection', features: [] },
          mode: this._state.currentMode === 'draw' ? DrawPolygonMode
              : this._state.currentMode === 'edit' ? this._editMode
              : ViewMode,
          selectedFeatureIndexes: this._state.selectedFeatureIndexes,
          onEdit: ({ updatedData, editType }) => {
            if (editType === 'updateTentativeFeature') return;
            this._state.geometry = updatedData;
            this._emitChange();
            if (FINISHED_EDIT_TYPES.has(editType)) {
              this._state.committedGeometry = updatedData;
              this._emitGeometryCommitted();
            }
          },
          onClick: (info) => {
            if (info.index >= 0 && this._state.currentMode === 'edit') {
              this._state.selectedFeatureIndexes = [info.index];
              this._emitChange();
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

  injectMaskExtension(layers) {
    const active = this.isMaskActive();
    return layers.map((layer) => {
      const layerId = layer.id || '';
      if (layerId.startsWith('__')) return layer;
      return layer.clone({
        extensions: [...(layer.props?.extensions || []), this._maskExtension],
        maskId: active ? MASK_LAYER_ID : '',
      });
    });
  }

  _emitChange() {
    this.emit('change', this.getState());
  }

  _emitGeometryCommitted() {
    this.emit('geometry-committed', this.getState());
  }
}
