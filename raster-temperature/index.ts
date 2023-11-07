import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, rasterSource, RasterTileLayer} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 50.0755,
  longitude: 14.4378,
  zoom: 12,
  bearing: 0,
  pitch: 0,
};

const dataSource = rasterSource({
  ...cartoConfig,
  tableName: 'cartobq.public_account.temperature_raster_int8',
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [
    new RasterTileLayer({
      id: 'temperature',
      data: dataSource,
      // getFillColor: [255, 0, 0],
      getFillColor: d => {
        console.log(d.properties)
        const {band_1} = d.properties;
        return [10 * (band_1 - 20), 0, 300 - 5 * band_1];
      }
    })
  ]
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});
