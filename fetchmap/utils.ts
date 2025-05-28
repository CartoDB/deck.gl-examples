import {getDataFilterExtensionProps, LayerDescriptor, LayerType} from '@carto/api-client';

import {
  ClusterTileLayer,
  H3TileLayer,
  HeatmapTileLayer,
  VectorTileLayer,
  QuadbinTileLayer,
  RasterTileLayer
} from '@deck.gl/carto';

import {_ConstructorOf, Deck, Layer} from '@deck.gl/core';
import {DataFilterExtension} from '@deck.gl/extensions';

export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// For now, define here. Eventually LayerFactory will be available in @deck.gl/carto
const layerClasses: Record<LayerType, _ConstructorOf<Layer>> = {
  clusterTile: ClusterTileLayer,
  h3: H3TileLayer,
  heatmapTile: HeatmapTileLayer,
  mvt: VectorTileLayer,
  quadbin: QuadbinTileLayer,
  raster: RasterTileLayer,
  tileset: VectorTileLayer
};
export function LayerFactory(layers: LayerDescriptor[]) {
  return layers
    .map(({type, props, filters}) => {
      const LayerClass = layerClasses[type];
      if (!LayerClass) {
        console.error(`No layer class found for type: ${type}`);
        return null;
      }
      const filterProps = filters && {
        ...getDataFilterExtensionProps(filters),
        extensions: [new DataFilterExtension({filterSize: 4})]
      };
      return new LayerClass({...props, ...filterProps});
    })
    .filter(Boolean);
}
