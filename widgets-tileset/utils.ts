import {VectorTilesetSourceResponse} from '@carto/api-client';

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function getDroppingPercent(dataset: VectorTilesetSourceResponse, zoom: number) {
  const {fraction_dropped_per_zoom, maxzoom, minzoom} = dataset;
  if (!fraction_dropped_per_zoom?.length) {
    return 0;
  }

  const roundedZoom = Math.round(zoom);
  const clampedZoom = clamp(roundedZoom, minzoom || 0, maxzoom || 20);

  const percent = fraction_dropped_per_zoom[clampedZoom];
  return percent;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
