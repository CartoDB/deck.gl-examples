import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck} from '@deck.gl/core';
import {QuadbinTileLayer, quadbinQuerySource, BASEMAP, colorBins} from '@deck.gl/carto';
import { initSelectors } from './selectorUtils';

const cartoConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: 'carto_dw'
};

// latitude, longitude, zoom, for spain
const INITIAL_VIEW_STATE = {
  latitude: 39.3262345,
  longitude: -4.8380649,
  zoom: 5,
  pitch: 45,
  bearing: -20,
  minZoom: 3.5,
  maxZoom: 15
};

// Selectors
let selectedVariable = 'population';
let aggregationExp = `SUM(${selectedVariable})`

const variableSelector = document.getElementById('variable') as HTMLSelectElement;
const aggMethodLabel = document.getElementById('agg-method') as HTMLSelectElement;

aggMethodLabel.innerText = aggregationExp;
variableSelector?.addEventListener('change', () => {
  const aggMethod = variableSelector.selectedOptions[0].dataset.aggMethod || 'SUM';
  
  selectedVariable = variableSelector.value;
  aggregationExp = `${aggMethod}(${selectedVariable})`;
  aggMethodLabel.innerText = aggregationExp;
  
  render();
});

function render() {
  const source = quadbinQuerySource({
    ...cartoConfig,
    aggregationExp: `${aggregationExp} as value`,
    aggregationResLevel: 8,
    sqlQuery: `SELECT * FROM cartobq.public_account.derived_spatialfeatures_esp_quadbin15_v1_yearly_v2`
  });

  const layers = [
    new QuadbinTileLayer({
      id: 'quadbin_layer',
      data: source,
      opacity: 0.8,
      pickable: true,
      extruded: true,
      getFillColor: colorBins({
        attr: 'value',
        domain: [0, 100, 1000, 10000, 100000, 1000000],
        colors: 'PinkYl'
      }),
      getElevation: d => {
        return d.properties.value
      },
      lineWidthMinPixels: 0.5,
      getLineWidth: 0.5,
      getLineColor: [255, 255, 255, 100]
    })
  ];

  deck.setProps({
    layers,
    getTooltip: ({object}) =>
      object && {
        html: `Hex ID: ${object.id}</br>
        ${selectedVariable.toUpperCase()}: ${parseInt(
          object.properties.value
        )}</br>
        Aggregation Expression: ${aggregationExp}`
      }
  });
}

// Main execution
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});

initSelectors();
render();
