import {WebMercatorViewport} from '@deck.gl/core';

// A simple debounce function to control interactions

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// A complete function to return a valid polygon from a deck.gl viewState, which we'll use for spatial filtering
// TODO: replace with a future utils helper function in carto-api-client that manages this transformation. Currently the resulting polygon exceeds [-180, 180] and DWs like BigQuery won't accept it

export function createViewStatePolygon(viewState) {
  const viewport = new WebMercatorViewport(viewState);
  return {
    type: 'Polygon',
    coordinates: [
      [
        viewport.unproject([0, 0]),
        viewport.unproject([viewport.width, 0]),
        viewport.unproject([viewport.width, viewport.height]),
        viewport.unproject([0, viewport.height]),
        viewport.unproject([0, 0])
      ]
    ]
  };
}
