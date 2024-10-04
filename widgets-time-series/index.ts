import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {DataFilterExtension} from '@deck.gl/extensions';
import {
  vectorTableSource,
  addFilter,
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
  latitude: 33.0,
  longitude: -135.0,
  zoom: 3,
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

const timeSeriesWidget = document.querySelector<HTMLSelectElement>('#time-series-widget');

var chartDom = timeSeriesWidget;
var timeSeriesWidgetChart = echarts.init(chartDom);

// add click filter interaction

timeSeriesWidgetChart.on('dataZoom', function (params) {
  // Access the zoomed range from params
  const startValue = params.start;
  const endValue = params.end;

  // Convert the percentage values back to actual data points
  const start =
    timeSeriesWidgetChart.getModel().option.series[0].data[
      Math.floor(
        (startValue / 100) * (timeSeriesWidgetChart.getModel().option.series[0].data.length - 1)
      )
    ];
  const end =
    timeSeriesWidgetChart.getModel().option.series[0].data[
      Math.floor(
        (endValue / 100) * (timeSeriesWidgetChart.getModel().option.series[0].data.length - 1)
      )
    ];

  filterViaTimeSeries(start[0], end[0]);
});

// define source

let dataSource = initSource();

async function initSource() {
  return (dataSource = await vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.blue_whales_eastern_pacific_point'
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
// filtering from the widget

let filteredRange = [0, Infinity];

function filterViaTimeSeries(startDate, endDate) {
  filteredRange = [startDate, endDate];
  console.log(filteredRange);
  renderLayers();
}

// RENDER
// render Widgets function

async function renderWidgets() {
  timeSeriesWidgetChart.showLoading();

  // configure widgets

  const timeSeriesData = await dataSource.widgetSource.getTimeSeries({
    column: 'timestamp_',
    stepSize: 'month',
    operation: 'count',
    operationColumn: '*',
    spatialFilter: viewportSpatialFilter
  });

  const option = {
    series: [
      {
        data: timeSeriesData.rows.map(row => [row.name, row.value]),
        type: 'line',
        smooth: true
      }
    ],
    grid: {
      left: 60,
      right: 40,
      top: 40,
      bottom: 80,
      width: 'auto',
      height: 'auto'
    },
    yAxis: {
      type: 'value'
    },
    xAxis: {
      type: 'time'
    },
    dataZoom: [
      {
        type: 'inside'
      },
      {
        type: 'slider',
        left: '15%',
        right: '15%'
      }
    ]
  };

  // render widgets!

  option && timeSeriesWidgetChart.setOption(option);

  timeSeriesWidgetChart.hideLoading();
}

// render Layers function

async function renderLayers() {
  // now for the layers

  const layers = [
    new VectorTileLayer({
      id: 'places',
      pickable: true,
      data: dataSource,
      opacity: 1,
      getFillColor: [3, 111, 226],
      getLineColor: [255, 255, 255],
      getPointRadius: 12,
      getLineWidth: 2,
      pointRadiusMinPixels: 2,
      lineWidthMinPixels: 0.3,
      getFilterValue: f => {
        return new Date(f.properties.timestamp_).getTime();
      },
      filterRange: filteredRange,
      extensions: [new DataFilterExtension({filterSize: 1})]
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
