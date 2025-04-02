import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {DataFilterExtension} from '@deck.gl/extensions';
import {
  vectorTilesetSource,
  addFilter,
  removeFilter,
  createViewportSpatialFilter,
  FilterType,
  getDataFilterExtensionProps
} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce, getDroppingPercent} from './utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 30.5,
  longitude: -90.1,
  zoom: 6,
  minZoom: 2.5,
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
const minStreamOrderWarning = document.querySelector<HTMLDivElement>('#min-stream-order');
const droppingWarningSmall = document.querySelector<HTMLDivElement>('#dropping-warning-small');
const droppingWarningBig = document.querySelector<HTMLDivElement>('#dropping-warning-big');
const droppingPercentage = document.querySelector<HTMLDivElement>('#dropping-percentage');
const zoomLevel = document.querySelector<HTMLDivElement>('#zoom-level');
const wrappers = document.querySelectorAll<HTMLDivElement>('.widget-wrapper');

const chartDom = histogramWidget;
const histogramWidgetChart = echarts.init(chartDom);

let histogramTicks = [];

// add click filter interaction

histogramWidgetChart.on('click', function (params) {
  if (params.componentType === 'series') {
    filterViaHistogram(params.dataIndex);
  }
});

// define source

let tilesLoaded = false;
let dataSource;

const EXCESSIVE_DROPPING_PERCENT = 0.05;

async function initSource() {
  dataSource = await vectorTilesetSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tilesets.noaa_nwm_waterstreams_us'
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

// MINIMUM STREAM ORDER
// Our tileset was generated in a way that it drops water streams of low orders at low zoom levels. Let's add logic in our app to handle this.

let minStreamOrder: number;

function getMinStreamOrder(zoomLevel: number) {
  if (zoomLevel < 5.5) {
    return 4; // at zoom 5.5, this tileset only uses streams of order 4 and above
  } else if (zoomLevel < 6.5) {
    return 3; // at zoom 6.5, this tileset only uses streams of order 3 and above
  } else if (zoomLevel < 7.5) {
    return 2; // at zoom 7.5, this tileset only uses streams of order 2 and above
  } else {
    return 1; // at zoom 10, we show all streams
  }
}

function setMinStreamOrder() {
  minStreamOrder = getMinStreamOrder(currentZoom);
  minStreamOrderWarning.innerHTML = `${minStreamOrder}`;
}

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

  const minValue = histogramTicks[dataIndex - 1];
  const maxValue = histogramTicks[dataIndex] - 0.0001;

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

  render();
}

function clearHistogramFilter() {
  clearFiltersButton.style.display = 'none';

  removeFilter(filters, {
    column: 'streamOrder'
  });

  render();
}

function setElementHidden(element: HTMLElement, flag: boolean) {
  element.style.display = flag ? 'none' : 'block';
}

// RENDER

// render Widgets function
async function renderWidgets() {
  // Exit if dataSource, tiles or viewport are not ready
  if (!dataSource || !tilesLoaded || !viewportSpatialFilter) {
    return;
  }

  // Start preparing the widgets
  histogramWidgetChart.showLoading();

  // Set the min stream order
  setMinStreamOrder();

  // prepare histogram ticks depending on the min stream order

  histogramTicks = [];
  const maxStreamOrder = 10;

  for (let i = minStreamOrder + 1; i <= maxStreamOrder; i++) {
    histogramTicks.push(i); //[minStreamOrder, ..., 10]
  }

  // Render the dropping percentage warning
  const droppingPercent = getDroppingPercent(dataSource, currentZoom);
  setElementHidden(droppingWarningSmall, true);
  setElementHidden(droppingWarningBig, true);
  droppingPercentage.innerHTML = `${(droppingPercent * 100).toFixed(2)}%`;
  zoomLevel.innerHTML = `${currentZoom.toFixed(2)}`;

  wrappers.forEach(el => el.classList.remove('dim'));
  if (droppingPercent > EXCESSIVE_DROPPING_PERCENT) {
    setElementHidden(droppingWarningBig, false);
    wrappers.forEach(el => el.classList.add('dim'));
  } else if (droppingPercent > 0) {
    setElementHidden(droppingWarningSmall, false);
  }

  // configure widgets
  const formula = await dataSource.widgetSource.getFormula({
    column: '*',
    operation: 'count',
    filters: filters,
    spatialFilter: viewportSpatialFilter
  });

  if (formula.value) {
    formulaWidget.innerHTML = formula.value.toFixed(0);
  }

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'streamOrder',
    ticks: histogramTicks,
    operation: 'count',
    filters: filters,
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
      left: 60,
      right: 30,
      top: 20,
      bottom: 20,
      width: 'auto',
      height: 'auto'
    },
    xAxis: {
      type: 'category',
      data: [minStreamOrder, ...histogramTicks],
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
  '#08589e',
  '#2b8cbe',
  '#4eb3d3',
  '#7bccc4',
  '#a8ddb5',
  '#ccebc5',
  '#e0f3db',
  '#f7fcf0'
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
      getLineColor: d => {
        const rgb = colors[Math.min(d.properties.streamOrder - 1, 7)];
        const alpha = Math.min(155 + d.properties.streamOrder * 10, 255); // Gradually increases opacity with stream order
        return [rgb[0], rgb[1], rgb[2], alpha];
      },
      getLineWidth: d => {
        return Math.pow(d.properties.streamOrder, 2);
      },
      lineWidthScale: 20,
      lineWidthUnits: 'meters',
      lineWidthMinPixels: 1,
      refinementStrategy: 'no-overlap',
      onViewportLoad(tiles) {
        dataSource.widgetSource.loadTiles(tiles);
        if (!tilesLoaded) {
          tilesLoaded = true;
          renderWidgets();
        }
      },
      extensions: [new DataFilterExtension({filterSize: 4})],
      ...getDataFilterExtensionProps(filters, 'and', 4)
    })
  ];

  deck.setProps({
    layers: layers
  });
}

// render everything!

async function setup() {
  await initSource();
  render();
}

function render() {
  renderWidgets();
  renderLayers();
}

setup();
