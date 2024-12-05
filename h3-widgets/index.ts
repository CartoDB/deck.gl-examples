import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck, MapViewState} from '@deck.gl/core';
import {H3TileLayer, BASEMAP, colorBins} from '@deck.gl/carto';
import { initSelectors } from './selectorUtils';
import { debounce, getSpatialFilterFromViewState } from './utils';
import { h3QuerySource } from '@carto/api-client'

const cartoConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: 'carto_dw'
};

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: 40.7128, // New York
  longitude: -74.006, // New York
  zoom: 7,
  pitch: 0,
  bearing: 0,
  minZoom: 3.5,
  maxZoom: 15
}

type Source = ReturnType<typeof h3QuerySource>;

// Selectors variables
let selectedVariable = 'population';
let aggregationExp = `SUM(${selectedVariable})`

let source: Source;
let viewState = INITIAL_VIEW_STATE

// DOM elements
const variableSelector = document.getElementById('variable') as HTMLSelectElement;
const aggMethodLabel = document.getElementById('agg-method') as HTMLSelectElement;
const formulaWidget = document.getElementById('formula-data') as HTMLDivElement;

aggMethodLabel.innerText = aggregationExp;
variableSelector?.addEventListener('change', () => {
  const aggMethod = variableSelector.selectedOptions[0].dataset.aggMethod || 'SUM';
  
  selectedVariable = variableSelector.value;
  aggregationExp = `${aggMethod}(${selectedVariable})`;
  aggMethodLabel.innerText = aggregationExp;
  
  render();
});

function render() {
  source = h3QuerySource({
    ...cartoConfig,
    aggregationExp: `${aggregationExp} as value`,
    sqlQuery: `SELECT * FROM cartobq.public_account.derived_spatialfeatures_usa_h3int_res8_v1_yearly_v2`
  });
  renderLayers();
  renderWidgets();
}

function renderLayers() {
  const layers = [
    new H3TileLayer({
      id: 'h3_layer',
      data: source,
      opacity: 0.8,
      pickable: true,
      extruded: false,
      getFillColor: colorBins({
        attr: 'value',
        domain: [0, 100, 1000, 10000, 100000, 1000000],
        colors: 'PinkYl'
      }),
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

async function renderWidgets() {
  formulaWidget.innerHTML = '<span style="font-weight: 400; font-size: 14px;">Loading...</span>'
  const { widgetSource } = await source
  const formula = await widgetSource.getFormula({
    column: selectedVariable,
    operation: 'count',
    spatialFilter: getSpatialFilterFromViewState(viewState),
    viewState,
  })
  formulaWidget.textContent = Intl.NumberFormat('en-US').format(formula.value)
}

const debouncedRenderWidgets = debounce(renderWidgets, 500);

// Main execution
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: viewState,
  controller: true
});
deck.setProps({
  onViewStateChange: (props) => {
    const {longitude, latitude, ...rest} = props.viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
    viewState = props.viewState;
    debouncedRenderWidgets()
  }
});

initSelectors();
render();
