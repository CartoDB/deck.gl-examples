import {createViewportSpatialFilter} from '@carto/api-client';
import {MapViewState, WebMercatorViewport} from '@deck.gl/core';

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function getSpatialFilterFromViewState(viewState: MapViewState) {
  const viewport = new WebMercatorViewport(viewState);
  return createViewportSpatialFilter(viewport.getBounds());
}
