import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck, FlyToInterpolator} from '@deck.gl/core';
import {BASEMAP, vectorTilesetSource, VectorTileLayer} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 40.7128,
  longitude: -74.0060,
  zoom: 10,
  bearing: 0,
  pitch: 30
};

const dataSource = vectorTilesetSource({
  ...cartoConfig,
  tableName: 'cartobq.public_account.osm_buildings_tileset'
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [
    new VectorTileLayer({
      id: 'places',
      data: dataSource,
      getFillColor: [18,147,154],
      getLineColor: [241,92,23],
      getLineWidth: 2,
    })
  ]
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

function moveToCity(city: string) {
  let latlng: {latitude: string, longitude: number};

  switch (city) {
    case 'newyork':
      latlng = {latitude: 40.7307343, longitude: -74.0056199};
      break;
    case 'tokyo':
      latlng = {latitude: 35.6992343, longitude: 139.7203199};
      break
    case 'barcelona':
      latlng = {latitude: 41.3974343, longitude: 2.1610199};
      break;
    default:
      throw new Error('City not found');
  }
  
  const viewState = {
    latitude: latlng.latitude,
    longitude: latlng.longitude,
    zoom: 13,
    bearing: 10,
    pitch: 45,
    transitionDuration: 5000,
    transitionInterpolator: new FlyToInterpolator()
  };

  deck.setProps({
    initialViewState: viewState
  });
}

const cityButtonsList = document.querySelectorAll<HTMLButtonElement>('.city-button-group button');
cityButtonsList.forEach((element) => {
  element.addEventListener('click', () => moveToCity(element.value));
})