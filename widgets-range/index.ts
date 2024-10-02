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
import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';
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

const rangeWidget = document.querySelector<HTMLSelectElement>('#range-widget');

noUiSlider.create(rangeWidget, {
  start: [10, 300],
  connect: true,
  tooltips: {
    to: function (value) {
      return Math.round(value);
    }
  },
  pips: {
    mode: 'range',
    density: 3
  },
  step: 1,
  range: {
    min: 0,
    max: 600
  }
});

// add click filter interaction

rangeWidget.noUiSlider?.on('set', function () {
  filterViaRange(this.get(true));
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

// filtering from the widget, without affecting the widget itself

function filterViaRange(rangeValues) {
  addFilter(filters, {
    column: 'frp',
    type: FilterType.BETWEEN,
    values: [[rangeValues[0], rangeValues[1]]],
    owner: 'range-widget' // prevents this filter from filtering the owner, in this case the widget
  });

  initialize();
}

// RENDER
// render Widgets function

async function renderWidgets() {
  rangeWidget.noUiSlider.disable();

  // configure widgets

  const range = await dataSource.widgetSource.getRange({
    filterOwner: 'range-widget', // the id for this widget, used to prevent filters from filtering this widget
    spatialFilter: viewportSpatialFilter,
    column: 'frp'
  });

  if (range && range.min !== null && range.max !== null) {
    rangeWidget.noUiSlider.updateOptions(
      {
        range: {
          min: range.min,
          max: range.max
        }
      },
      false
    );

    // render widgets!

    rangeWidget.noUiSlider.enable();
  }
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
      getFillColor: [205, 89, 109],
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
