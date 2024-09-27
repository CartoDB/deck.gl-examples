import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {vectorTableSource, addFilter, clearFilters} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce, createViewStatePolygon} from './utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 5,
  minZoom: 3, // TODO: remove once polygon validation is done
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

// prepare a function to get the new viewport state, that we'll pass debounced to our widgets to minimize requests

const debouncedRenderWidgets = debounce(renderWidgets, 500);

// sync deckgl map after user interaction, obtain new viewport after

let currentViewStatePolygon;

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
    currentViewStatePolygon = createViewStatePolygon(viewState);
    formulaWidget.innerHTML = 'Loading...';
    categoryWidgetChart.showLoading();
    debouncedRenderWidgets();
  }
});

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
      type: 'in',
      values: [country]
    });
  }
  selectedCountry = countrySelector.value;
  formulaWidget.innerHTML = 'Loading...';
  categoryWidgetChart.showLoading();
  initialize();
});

// prepare and init widgets HTML elements

const formulaWidget = document.querySelector<HTMLSelectElement>('#widget1');

const categoriesWidget = document.querySelector<HTMLSelectElement>('#widget2');

var chartDom = categoriesWidget;
var categoryWidgetChart = echarts.init(chartDom);

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

const histogramLabels = [
  '< 100k',
  '100k - 200k',
  '200k - 300k',
  '300k - 400k',
  '400k - 500k',
  '500k - 600k',
  '600k - 700k',
  '700k - 800k',
  '800k - 900k',
  '900k - 1M',
  '> 1M'
];

// render Widgets function

async function renderWidgets() {
  // configure widgets

  const formula = await dataSource.widgetSource.getFormula({
    operation: 'count',
    spatialFilter: currentViewStatePolygon
  });

  const histogram = await dataSource.widgetSource.getHistogram({
    column: 'pop_max',
    ticks: [100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000],
    operation: 'count',
    spatialFilter: currentViewStatePolygon
  });

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    xAxis: {
      type: 'category',
      data: histogramLabels,
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
  option && categoryWidgetChart.setOption(option);
  categoryWidgetChart.hideLoading();
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
  await initSource();
  renderWidgets();
  renderLayers();
}

initialize();
