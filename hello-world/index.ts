import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorTableSource, VectorTileLayer, vectorTilesetSource} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 39.8097343,
  longitude: -98.5556199,
  zoom: 4,
  bearing: 0,
  pitch: 30
};

const dataSource = vectorTableSource({
  ...cartoConfig,
  tableName: 'carto-demo-data.demo_tables.populated_places'
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [
    new VectorTileLayer({
      id: 'places',
      pickable: true,
      data: dataSource,
      pointRadiusMinPixels: 3,
      getFillColor: [200, 0, 80]
    })
  ],
  getTooltip: ({ object }) => 
    object && {
      html: `
        <strong>Name</strong>: ${object.properties.name}<br/>
        <strong>Latitude</strong>: ${object.geometry.coordinates[0].toFixed(
          6
        )}<br/>
        <strong>Latitude</strong>: ${object.geometry.coordinates[1].toFixed(
          6
        )}
      `
    }
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});
