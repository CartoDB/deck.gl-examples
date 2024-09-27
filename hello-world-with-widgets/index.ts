import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {
  vectorTableSource,
  addFilter,
  clearFilters,
  removeFilter,
  FilterType,
  createViewportSpatialFilter
} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce} from './utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 1,
  bearing: 0,
  pitch: 0
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true
});

// Add basemap

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false
});

// prepare and init widgets HTML elements

const formulaWidget = document.querySelector<HTMLSelectElement>('#widget1');

const histogramWidget = document.querySelector<HTMLSelectElement>('#widget2');

var chartDom = histogramWidget;
var histogramWidgetChart = echarts.init(chartDom);

// add click filter interaction

histogramWidgetChart.on('click', function (params) {
  if (params.componentType === 'series') {
    filterViaHistogram(params.dataIndex);
  }
});

// define source

let dataSource;

async function initSource() {
  return (dataSource = await vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.populated_places',
    filters: filters
  }));
}

// dictionary for histogram labels

const histogramLabels = {
  0: '0 - 50k',
  50000: '50k - 100k',
  100000: '100k - 150k',
  150000: '150k - 200k',
  200000: '200k - 250k',
  250000: '250k - 300k',
  300000: '300k - 350k',
  350000: '350k - 400k',
  400000: '400k - 450k',
  450000: '450k - 500k',
  500000: '> 500k'
};

// SPATIAL FILTER
// prepare a function to get the new viewport state, that we'll pass debounced to our widgets to minimize requests

const debouncedRenderWidgets = debounce(renderWidgets, 500);

// sync deckgl map after user interaction, obtain new viewport after

let viewportSpatialFilter;

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
    const viewport = new WebMercatorViewport(viewState);
    viewportSpatialFilter = createViewportSpatialFilter(viewport.getBounds());
    formulaWidget.innerHTML = 'Loading...';
    histogramWidgetChart.showLoading();
    debouncedRenderWidgets();
  }
});

// COLUMN FILTERS
// prepare filters

let filters = {};

// listen to inputs from HTML

let selectedCountry = 'All';
const countrySelector = document.querySelector<HTMLSelectElement>('#osmCategorySelector');

countrySelector?.addEventListener('change', () => {
  const country = countrySelector.value;
  if (country == 'All') {
    clearFilters(filters);
  } else {
    addFilter(filters, {
      column: 'sov_a3',
      type: FilterType.IN,
      values: [country]
    });
  }
  selectedCountry = countrySelector.value;
  initialize();
});

// filtering from the widget, including a clear filters button

const clearFiltersButton = document.querySelector<HTMLElement>('#clearHistogramFilter');

clearFiltersButton?.addEventListener('click', () => {
  clearHistogramFilter();
});

function filterViaHistogram(dataIndex) {
  clearFiltersButton.style.display = 'inherit';

  const histogramKeys = Object.keys(histogramLabels).map(Number);
  const minValue = histogramKeys[dataIndex];
  const maxValue = histogramKeys[dataIndex + 1];

  removeFilter(filters, {
    column: 'pop_max'
  });

  if (dataIndex === histogramKeys.length - 1) {
    // For the last category (> 1M), use CLOSED_OPEN
    addFilter(filters, {
      column: 'pop_max',
      type: FilterType.CLOSED_OPEN,
      values: [[minValue, Infinity]]
    });
  } else {
    // For first and middle categories, use BETWEEN
    addFilter(filters, {
      column: 'pop_max',
      type: FilterType.BETWEEN,
      values: [[minValue, maxValue]]
    });
  }

  initialize();
}

function clearHistogramFilter() {
  clearFiltersButton.style.display = 'none';

  removeFilter(filters, {
    column: 'pop_max'
  });

  initialize();
}

// RENDER
// render Widgets function

async function renderWidgets() {
  // configure widgets

  const formula = await dataSource.widgetSource.getFormula({
    operation: 'count',
    spatialFilter: viewportSpatialFilter
  });

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'pop_max',
    ticks: [50000, 100000, 150000, 200000, 250000, 300000, 350000, 400000, 450000, 500000],
    operation: 'count',
    spatialFilter: viewportSpatialFilter
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: 40,
      right: 30,
      top: 10,
      width: 'auto',
      height: 'auto'
    },
    xAxis: {
      type: 'category',
      data: Object.values(histogramLabels),
      axisLabel: {
        rotate: 45, // Rotate the labels if they're too long
        interval: 0 // Show all labels
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'Total cities',
        type: 'bar',
        data: histogram,
        itemStyle: {
          color: '#3398DB'
        }
      }
    ]
  };

  // render widgets!

  formulaWidget.innerHTML = formula.value;
  option && histogramWidgetChart.setOption(option);

  histogramWidgetChart.hideLoading();
}

// render Layers function

async function renderLayers() {
  // now for the layers

  const layers = [
    new VectorTileLayer({
      id: 'places',
      pickable: true,
      data: dataSource,
      pointRadiusMinPixels: 4,
      getFillColor: [200, 0, 80]
    })
  ];

  deck.setProps({
    layers: layers,
    getTooltip: ({object}) =>
      object && {
        html: `
          <strong>Name</strong>: ${object.properties.name}<br/>
          <strong>Population (max)</strong>: ${object.properties.pop_max}<br/>
          <strong>Latitude</strong>: ${object.geometry.coordinates[0].toFixed(6)}<br/>
          <strong>Latitude</strong>: ${object.geometry.coordinates[1].toFixed(6)}
        `
      }
  });
}

// render everything!

async function initialize() {
  formulaWidget.innerHTML = 'Loading...';
  histogramWidgetChart.showLoading();
  await initSource();
  renderWidgets();
  renderLayers();
}

initialize();
