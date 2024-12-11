import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck, MapViewState} from '@deck.gl/core';
import {H3TileLayer, BASEMAP, colorBins} from '@deck.gl/carto';
import { initSelectors } from './selectorUtils';
import { debounce, getSpatialFilterFromViewState } from './utils';
import { addFilter, Filters, FilterType, h3TableSource, removeFilter, WidgetSource } from '@carto/api-client';
import Chart from 'chart.js/auto';

const cartoConfig = {
  // @ts-expect-error misconfigured env variables
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  // @ts-expect-error misconfigured env variables
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: 'carto_dw'
};

const INITIAL_VIEW_STATE: MapViewState = {
  // Spain
  latitude: 37.3753636,
  longitude: -5.9962577,
  zoom: 6,
  pitch: 0,
  bearing: 0,
  minZoom: 3.5,
  maxZoom: 15
}

type Source = ReturnType<typeof h3TableSource>;

// Selectors variables
let selectedVariable = 'population';
let aggregationExp = `SUM(${selectedVariable})`

let source: Source;
let viewState = INITIAL_VIEW_STATE
const filters: Filters = {};

// DOM elements
const variableSelector = document.getElementById('variable') as HTMLSelectElement;
const aggMethodLabel = document.getElementById('agg-method') as HTMLSelectElement;
const formulaWidget = document.getElementById('formula-data') as HTMLDivElement;
const histogramWidget = document.getElementById('histogram-data') as HTMLCanvasElement;
const histogramClearBtn = document.querySelector('.histogram-widget .clear-btn') as HTMLButtonElement;
histogramClearBtn.addEventListener('click', () => {
  removeFilter(filters, { column: 'urbanity' });
  render();
})

let histogramChart: Chart; 

aggMethodLabel.innerText = aggregationExp;
variableSelector?.addEventListener('change', () => {
  const aggMethod = variableSelector.selectedOptions[0].dataset.aggMethod || 'SUM';
  
  selectedVariable = variableSelector.value;
  aggregationExp = `${aggMethod}(${selectedVariable})`;
  aggMethodLabel.innerText = aggregationExp;
  
  render();
});

function render() {
  source = h3TableSource({
    ...cartoConfig,
    filters,
    aggregationExp: `${aggregationExp} as value`,
    tableName: 'carto-demo-data.demo_tables.derived_spatialfeatures_esp_h3res8_v1_yearly_v2'
  });
  renderWidgets();
  renderLayers();
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
  const { widgetSource } = await source
  await Promise.all([
    renderFormula(widgetSource),
    renderHistogram(widgetSource)
  ])
}

async function renderFormula(ws: WidgetSource) {
  formulaWidget.innerHTML = '<span style="font-weight: 400; font-size: 14px;">Loading...</span>'
  const formula = await ws.getFormula({
    column: selectedVariable,
    operation: 'sum',
    spatialFilter: getSpatialFilterFromViewState(viewState),
    viewState,
  })
  formulaWidget.textContent = Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    // notation: 'compact'
  }).format(formula.value)
}

const HISTOGRAM_WIDGET_ID = 'urbanity_widget';

async function renderHistogram(ws: WidgetSource) {
  histogramWidget.parentElement?.querySelector('.loader')?.classList.toggle('hidden', false);
  histogramWidget.classList.toggle('hidden', true);

  const categories = await ws.getCategories({
    column: 'urbanity',
    operation: 'count',
    filterOwner: HISTOGRAM_WIDGET_ID,
    spatialFilter: getSpatialFilterFromViewState(viewState),
    viewState,
  })

  histogramWidget.parentElement?.querySelector('.loader')?.classList.toggle('hidden', true);
  histogramWidget.classList.toggle('hidden', false);

  const selectedCategory = filters['urbanity']?.[FilterType.IN]?.values[0];
  const colors = categories.map((c) => c.name === selectedCategory ? 'rgba(255, 99, 132, 0.2)' : 'rgba(54, 162, 235, 0.2)')

  if (histogramChart) {
    histogramChart.data.labels = categories.map((c) => c.name);
    histogramChart.data.datasets[0].data = categories.map((c) => c.value);
    histogramChart.data.datasets[0].backgroundColor = colors;
    histogramChart.update();
  } else {
    histogramChart = new Chart(histogramWidget, {
      type: 'bar',
      data: {
        labels: categories.map((c) => c.name),
        datasets: [
          {
            label: 'Urbanity category',
            data: categories.map((c) => c.value),
            backgroundColor: colors,
          }
        ]
      },
      options: {
        onClick: async (ev, elems) => {
          console.log(elems[0])
          const index = elems[0]?.index
          const categoryName = categories[index]?.name
          if (!categoryName || categoryName === selectedCategory) {
            removeFilter(filters, { column: 'urbanity' })
          } else {
            addFilter(filters, {
              column: 'urbanity',
              type: FilterType.IN,
              values: [categoryName],
              owner: HISTOGRAM_WIDGET_ID,
            })
          }
          await render()
        }
      },
    })
  }
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
