import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
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
import {VectorTilesetSourceResponse} from '@carto/api-client';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'amanzanares-pm-bq';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 37.634945,
  longitude: -118.837644,
  zoom: 2.5,
  bearing: 0,
  pitch: 0
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  getTooltip: ({object}) => {
    if (!object) return;
    let html = '';
    const {properties} = object;
    for (const key in properties) {
      html += `<strong>${key}</strong>: ${properties[key]}<br/>`;
    }
    return {html};
  }
});

// Add basemap

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

// prepare and init widgets HTML elements

const histogramWidget = document.querySelector<HTMLDivElement>('#histogram-widget');
const formulaWidget = document.querySelector<HTMLDivElement>('#formula-widget');
const droppingWarningSmall = document.querySelector<HTMLDivElement>('#dropping-warning-small');
const droppingWarningBig = document.querySelector<HTMLDivElement>('#dropping-warning-big');
const droppingPercentage = document.querySelector<HTMLDivElement>('#dropping-percentage');
const zoomLevel = document.querySelector<HTMLDivElement>('#zoom-level');
const wrappers = document.querySelectorAll<HTMLDivElement>('.widget-wrapper');

var chartDom = histogramWidget;
var histogramWidgetChart = echarts.init(chartDom);

// add click filter interaction

histogramWidgetChart.on('click', function (params) {
  if (params.componentType === 'series') {
    filterViaHistogram(params.dataIndex);
  }
});

// define source

let tilesLoaded = false;
let dataSource: VectorTilesetSourceResponse;

const EXCESSIVE_DROPPING_PERCENT = 0.05

function getDroppingPercent(dataset: VectorTilesetSourceResponse, zoom: number) {
  const {fraction_dropped_per_zoom, maxzoom, minzoom} = dataset;
  if (!fraction_dropped_per_zoom?.length) {
    return 0;
  }

  const roundedZoom = Math.round(zoom);
  const clampedZoom = clamp(roundedZoom, minzoom || 0, maxzoom || 20);

  const percent = fraction_dropped_per_zoom[clampedZoom];
  return percent;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

async function initSource() {
  dataSource = await vectorTilesetSource({
    ...cartoConfig,
    tableName:
      'cartodb-on-gcp-pm-team.amanzanares_opensource_demo.national_water_model_tileset_final_test_4'
  });
  return dataSource;
}

// SPATIAL FILTER
// prepare a function to get the new viewport state, that we'll pass debounced to our widgets to minimize requests

let currentZoom = INITIAL_VIEW_STATE.zoom;
let viewportSpatialFilter;

const debouncedUpdateSpatialFilter = debounce(viewState => {
  currentZoom = viewState.zoom;
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
    column: 'streamOrder'
  });

  const minValue = histogramTicks[dataIndex];
  const maxValue = histogramTicks[dataIndex + 1] - 0.0001;

  if (dataIndex === histogramTicks.length - 1) {
    // For the last category (> 600), use CLOSED_OPEN
    addFilter(filters, {
      column: 'streamOrder',
      type: FilterType.CLOSED_OPEN,
      values: [[minValue, Infinity]]
    });
  } else {
    // For first and middle categories, use BETWEEN
    addFilter(filters, {
      column: 'streamOrder',
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

function setElementHidden(element: HTMLElement, flag: boolean) {
  element.style.display = flag ? 'none' : 'block';
}

// RENDER
// prepare ticks for our widget

const histogramTicks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// render Widgets function
async function renderWidgets() {
  // Exit if dataSource is not ready
  if (!dataSource) {
    return;
  }

  // Exit if tiles are not loaded by layer viewport
  if (!tilesLoaded) {
    return;
  }

  const droppingPercent = getDroppingPercent(dataSource, currentZoom);
  setElementHidden(droppingWarningSmall, true);
  setElementHidden(droppingWarningBig, true);
  droppingPercentage.innerHTML = `${(droppingPercent * 100).toFixed(2)}%`;
  zoomLevel.innerHTML = `${currentZoom.toFixed()}`;

  wrappers.forEach(el => el.classList.remove('dim'));
  if (droppingPercent > EXCESSIVE_DROPPING_PERCENT) {
    setElementHidden(droppingWarningBig, false);
    wrappers.forEach(el => el.classList.add('dim'));
  } else if (droppingPercent > 0) {
    setElementHidden(droppingWarningSmall, false);
  }

  dataSource.widgetSource.extractTileFeatures({spatialFilter: viewportSpatialFilter});

  histogramWidgetChart.showLoading();

  // configure widgets

  const formula = await dataSource.widgetSource.getFormula({
    column: '*',
    operation: 'count'
  });

  if (formula.value) {
    formulaWidget.innerHTML = formula.value.toFixed(0);
  }

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'streamOrder',
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
      data: histogramTicks,
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
        formatter: (value: number) =>
          Intl.NumberFormat('en-US', {compactDisplay: 'short', notation: 'compact'}).format(value)
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
  '#08589e'
].map(hex => hexToRgb(hex));

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// render Layers function

function renderLayers() {
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
      getLineColor: d => {
        const [r, g, b] = hexToRgb('#d5d5d7');
        const n = d.properties.streamOrder;
        const alphaPart = Math.min(n / 10, 1);
        const alpha = 120 + 128 * alphaPart;
        return [r, g, b, alpha];
      },
      getLineWidth: d => {
        const n = d.properties.streamOrder;
        return n * 0.5;
      },
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1,
      onViewportLoad(tiles) {
        dataSource.widgetSource.loadTiles(tiles);
        if (!tilesLoaded) {
          tilesLoaded = true;
          debouncedUpdateSpatialFilter();
        }
      }
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
