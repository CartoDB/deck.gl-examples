import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {vectorQuerySource, createViewportSpatialFilter} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce} from './utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 33.99,
  longitude: -118.62,
  zoom: 9,
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

const scatterplotWidget = document.querySelector<HTMLSelectElement>('#scatterplot-widget');

var chartDom = scatterplotWidget;
var scatterplotWidgetChart = echarts.init(chartDom);

// define source

let dataSource;

async function initSource() {
  return (dataSource = await vectorQuerySource({
    ...cartoConfig,
    sqlQuery: 'SELECT * FROM carto-demo-data.demo_tables.losangeles_airbnb_data ORDER BY cartodb_id'
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

// RENDER
// render Widgets function

async function renderWidgets() {
  scatterplotWidgetChart.showLoading();

  // configure widgets

  const scatterplotData = await dataSource.widgetSource.getScatter({
    xAxisColumn: 'review_scores_location',
    yAxisColumn: 'review_scores_rating',
    spatialFilter: viewportSpatialFilter
  });

  const option = {
    series: [
      {
        symbolSize: 5,
        data: scatterplotData,
        type: 'scatter'
      }
    ],
    grid: {
      left: 60,
      right: 80,
      top: 40,
      bottom: 20,
      width: 'auto',
      height: 'auto'
    },
    yAxis: {
      name: 'Overall rating',
      min: 3.5,
      max: 5
    },
    xAxis: {
      name: 'Location rating',
      min: 3.5,
      max: 5
    }
  };

  // render widgets!

  scatterplotWidgetChart.setOption(option);
  scatterplotWidgetChart.hideLoading();
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
      lineWidthMinPixels: 0.3
    })
  ];

  deck.setProps({
    layers: layers,
    getTooltip: ({object}) => {
      return (
        object && {
          html: `
        <strong>ID</strong>:${object.properties.cartodb_id}<br/>
        <strong>Location rating</strong>:${object.properties.review_scores_location}<br/>
        <strong>Overall rating</strong>:${object.properties.review_scores_rating}
      `
        }
      );
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
