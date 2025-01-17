import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck, Color} from '@deck.gl/core';
import {
  vectorTilesetSource,
  addFilter,
  removeFilter,
  createViewportSpatialFilter,
  FilterType
} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce} from './utils';
import { VectorTilesetSourceResponse } from '@carto/api-client';

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

let dataSource: VectorTilesetSourceResponse;

async function initSource() {
  dataSource = await vectorTilesetSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tilesets.sociodemographics_usa_blockgroup',
  })
  return dataSource;
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
    column: 'income_per_capita'
  });

  const minValue = histogramTicks[dataIndex];
  const maxValue = histogramTicks[dataIndex + 1] - 0.0001;

  if (dataIndex === histogramTicks.length - 1) {
    // For the last category (> 600), use CLOSED_OPEN
    addFilter(filters, {
      column: 'income_per_capita',
      type: FilterType.CLOSED_OPEN,
      values: [[minValue, Infinity]]
    });
  } else {
    // For first and middle categories, use BETWEEN
    addFilter(filters, {
      column: 'income_per_capita',
      type: FilterType.BETWEEN,
      values: [[minValue, maxValue]]
    });
  }

  initialize();
}

function clearHistogramFilter() {
  clearFiltersButton.style.display = 'none';

  removeFilter(filters, {
    column: 'income_per_capita'
  });

  initialize();
}

// RENDER
// prepare ticks for our widget

const histogramTicks = [15000, 20000, 23000, 26000, 30000, 34000, 40000, 50000];
// Array.from({length: 31}, (_, i) => i * (600 / 30))
// render Widgets function

async function renderWidgets() {
  // Exit if dataSource is not ready
  if (!dataSource) {
    return;
  }

  dataSource.widgetSource.extractTileFeatures({ spatialFilter: viewportSpatialFilter })

  histogramWidgetChart.showLoading();

  // configure widgets

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'income_per_capita',
    ticks: histogramTicks,
    operation: 'count'
  });

  console.log(histogram);

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
      data: histogramTicks.map(tick => `${tick} €`),
      // axisLabel: {
      //   interval: 4 // Show every 5th label
      // },
      axisTick: {
        alignWithLabel: true
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value: number) => Intl.NumberFormat('en-US', { compactDisplay: 'short', notation: 'compact' }).format(value)
      }
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

const colors = [
  '#f7fcf0',
  '#e0f3db',
  '#ccebc5',
  '#a8ddb5',
  '#7bccc4',
  '#4eb3d3',
  '#2b8cbe',
  '#08589e',
].map((hex) => hexToRgb(hex));

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
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
      getFillColor: d => {
        const n = d.properties.income_per_capita;
        const index = histogramTicks.slice().reverse().findIndex((tick) => n >= tick);
        const color = colors[index] || colors[colors.length - 1];
        return color as Color;
      },
      getLineColor: [0, 0 ,0],
      lineWidthMinPixels: 0.3,
      onViewportLoad(tiles) {
        dataSource.widgetSource.loadTiles(tiles)
      },
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
