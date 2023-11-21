import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, query} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'bqconn';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = { 
  latitude: 40.7128,
  longitude: -74.0060,
  zoom: 10,
  bearing: 0,
  pitch: 30,
  minZoom: 8,
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  getTooltip: ({ object }) => {
    if (!object) return;
    let html = ''
    const {properties} = object;
    for (const key in properties) {
      html += `<strong>${key}</strong>: ${properties[key]}<br/>`;
    }
    return {html}
  }
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false,
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});


function render() {

  const querySource = query({
    ...cartoConfig,
    boundaryId: 'usa_zip_code_v1',
    sqlQuery: ``,
  });

  const layers = []
  deck.setProps({layers});
}

render()


