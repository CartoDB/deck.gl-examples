import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {
  vectorTableSource,
  addFilter,
  removeFilter,
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

const categoryWidget = document.querySelector<HTMLSelectElement>('#category-widget');

var chartDom = categoryWidget;
var categoryWidgetChart = echarts.init(chartDom);

// add click filter interaction

categoryWidgetChart.on('click', function (params) {
  if (params.componentType === 'series') {
    filterViaCategory(params.name);
  }
});

// define source

let dataSource;

async function initSource() {
  return (dataSource = await vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.osm_pois_usa',
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

const clearFiltersButton = document.querySelector<HTMLElement>('#clearCategoryFilter');

clearFiltersButton?.addEventListener('click', () => {
  clearCategoryFilter();
});

function filterViaCategory(category) {
  clearFiltersButton.style.display = 'inherit';

  removeFilter(filters, {
    column: 'group_name'
  });

  addFilter(filters, {
    column: 'group_name',
    type: 'in',
    values: [category]
  });

  initialize();
}

function clearCategoryFilter() {
  clearFiltersButton.style.display = 'none';

  removeFilter(filters, {
    column: 'group_name'
  });

  initialize();
}

// RENDER
// render Widgets function

async function renderWidgets() {
  categoryWidgetChart.showLoading();

  // configure widgets

  const categories = await dataSource.widgetSource.getCategories({
    column: 'group_name',
    operation: 'count',
    spatialFilter: viewportSpatialFilter
  });

  const sortedCategories = categories.sort((a, b) => b.value - a.value);
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: 100,
      right: 30,
      top: 20,
      bottom: 20,
      width: 'auto',
      height: 'auto'
    },
    yAxis: {
      type: 'category',
      data: sortedCategories.map(item => item.name).reverse(),
      axisLabel: {
        interval: 0, // Show all labels
        formatter: function (value) {
          const maxLength = 15;
          if (value.length > maxLength) {
            return value.slice(0, maxLength) + '\n' + value.slice(maxLength);
          }
          return value;
        }
      },
      axisTick: {
        alignWithLabel: true
      }
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: function (value) {
          if (value >= 1000000) {
            return value / 1000000 + 'M';
          } else if (value >= 1000) {
            return value / 1000 + 'k';
          }
          return value;
        }
      }
    },
    series: [
      {
        name: 'Values',
        type: 'bar',
        data: sortedCategories.map(item => item.value).reverse(),
        itemStyle: {
          color: '#3398DB'
        }
      }
    ]
  };

  // render widgets!

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
      opacity: 1,
      getFillColor: [3, 111, 226],
      getLineColor: [255, 255, 255],
      getPointRadius: 50,
      getLineWidth: 10,
      pointRadiusMinPixels: 1,
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
