import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {
  vectorTableSource,
  addFilter,
  removeFilter,
  createViewportSpatialFilter,
  FilterType
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
  latitude: 20.8097343,
  longitude: -60.5556199,
  zoom: 1.5,
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

const histogramWidget = document.querySelector<HTMLSelectElement>('#histogram-widget');

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
    tableName: 'carto-demo-data.demo_tables.fires_worldwide',
    filters: filters
  }));
}

// SPATIAL FILTER
// prepare a function to get the new viewport state, that we'll pass debounced to our widgets to minimize requests

let viewportSpatialFilter;

const debouncedUpdateSpatialFilter = debounce(viewState => {
  const viewport = new WebMercatorViewport(viewState);
  viewportSpatialFilter = createViewportSpatialFilter(viewport.getBounds());
  renderWidgets();
}, 300);

// sync deckgl map after user interaction, obtain new viewport after

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
    debouncedUpdateSpatialFilter(viewState);
  }
});

// COLUMN FILTERS
// prepare filters

let filters = {};

// filtering from the widget, including a clear filters button

const clearFiltersButton = document.querySelector<HTMLElement>('#clearHistogramFilter');

clearFiltersButton?.addEventListener('click', () => {
  clearHistogramFilter();
});

function filterViaHistogram(dataIndex) {
  clearFiltersButton.style.display = 'inherit';

  removeFilter(filters, {
    column: 'frp'
  });

  const minValue = histogramTicks[dataIndex];
  const maxValue = histogramTicks[dataIndex + 1] - 0.0001;

  if (dataIndex === histogramTicks.length - 1) {
    // For the last category (> 600), use CLOSED_OPEN
    addFilter(filters, {
      column: 'frp',
      type: FilterType.CLOSED_OPEN,
      values: [[minValue, Infinity]]
    });
  } else {
    // For first and middle categories, use BETWEEN
    addFilter(filters, {
      column: 'frp',
      type: FilterType.BETWEEN,
      values: [[minValue, maxValue]]
    });
  }

  initialize();
}

function clearHistogramFilter() {
  clearFiltersButton.style.display = 'none';

  removeFilter(filters, {
    column: 'frp'
  });

  initialize();
}

// RENDER
// prepare ticks for our widget

const histogramTicks = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50,
  52, 54, 56, 58, 60
]; // Array.from({length: 31}, (_, i) => i * (600 / 30))
// render Widgets function

async function renderWidgets() {
  // Exit if dataSource is not ready
  if (!dataSource) {
    return;
  }

  histogramWidgetChart.showLoading();

  // configure widgets

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'frp',
    ticks: histogramTicks,
    operation: 'count'
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: 60,
      right: 30,
      top: 20,
      bottom: 20,
      width: 'auto',
      height: 'auto'
    },
    xAxis: {
      type: 'category',
      data: histogramTicks.map(tick => `${tick - 2}`),
      axisLabel: {
        interval: 4 // Show every 5th label
      },
      axisTick: {
        alignWithLabel: true
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'Count',
        type: 'bar',
        data: histogram,
        itemStyle: {
          color: '#3398DB'
        }
      }
    ]
  };

  // render widgets!

  histogramWidgetChart.setOption(option);
  histogramWidgetChart.hideLoading();
}

// render Layers function

async function renderLayers() {
  // Exit if dataSource is not ready
  if (!dataSource) {
    return;
  }

  // now for the layers

  const layers = [
    new VectorTileLayer({
      id: 'places',
      pickable: true,
      data: dataSource,
      opacity: 1,
      getFillColor: [255, 111, 100],
      getLineColor: [255, 255, 255],
      getPointRadius: d => {
        return Math.sqrt(d.properties.frp);
      },
      pointRadiusUnits: 'pixels',
      pointRadiusScale: 0.75,
      getLineWidth: 10,
      lineWidthMinPixels: 0.3
    })
  ];

  deck.setProps({
    layers: layers
  });
}

// render everything!

async function initialize() {
  await initSource();
  renderWidgets();
  renderLayers();
}

initialize();
