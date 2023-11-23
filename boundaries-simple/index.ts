import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
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
  interactive: false
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});

const boundarySelector = document.querySelector<HTMLSelectElement>('#boundarySelector');
boundarySelector?.addEventListener('change', () => {
  const selectedTilesetTableName = boundarySelector.value;
  render(selectedTilesetTableName);
});

function render(tilesetTableName: string) {

  const boundarySource = vectorTilesetSource({
    ...cartoConfig,
    tableName: tilesetTableName
  });

  const layers = [
    new VectorTileLayer({
      id: 'tileset',
      data: boundarySource,
      pickable: true,
      getFillColor: [18,147,154],
      getLineColor: [241,92,23],
      getLineWidth: 2
    }),
  ]
  deck.setProps({layers});
}

render(boundarySelector!.value)