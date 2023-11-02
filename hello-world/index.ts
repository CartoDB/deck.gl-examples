import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Deck } from '@deck.gl/core';
import {
  BASEMAP,
  CartoLayer,
  setDefaultCredentials,
  MAP_TYPES,
} from '@deck.gl/carto/typed';


const route = (document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="map"></div>
  <canvas id="deck-canvas"></canvas>
`);

const apiBaseUrl = 'https://gcp-us-east1.api.carto.com';
const accessToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfN3hoZnd5bWwiLCJqdGkiOiI3ZDVmYjMwMiJ9.ySr1HanHcYklesFUIqDJfxoaeB8bpGrR3QcImrxmXEk';
setDefaultCredentials({ apiBaseUrl, accessToken });


const INITIAL_VIEW_STATE = {
  latitude: 39.8097343,
  longitude: -98.5556199,
  zoom: 4,
  bearing: 0,
  pitch: 30,
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [
    new CartoLayer({
      id: 'places',
      connection: 'carto_dw',
      type: MAP_TYPES.TABLE,
      data: 'carto-demo-data.demo_tables.populated_places',
      pointRadiusMinPixels: 3,
      getFillColor: [200, 0, 80],
    })
  ]
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.VOYAGER,
  interactive: false,
});
deck.setProps({
  onViewStateChange: ({ viewState }) => {
    const { longitude, latitude, ...rest } = viewState;
    map.jumpTo({ center: [longitude, latitude], ...rest });
  },
});

