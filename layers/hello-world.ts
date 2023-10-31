import { CartoLayer, MAP_TYPES } from '@deck.gl/carto/typed';

export function getLayers() {
  return [
    new CartoLayer({
      id: 'places',
      connection: 'carto_dw',
      type: MAP_TYPES.TABLE,
      data: 'carto-demo-data.demo_tables.populated_places',
      pointRadiusMinPixels: 3,
      getFillColor: [200, 0, 80],
    }),
  ];
}
