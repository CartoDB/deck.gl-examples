import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {vectorQuerySource, createViewportSpatialFilter} from '@carto/api-client';
import {BASEMAP, VectorTileLayer, colorContinuous} from '@deck.gl/carto';
import * as echarts from 'echarts';
import {debounce} from './utils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

// init deckgl

const INITIAL_VIEW_STATE = {
  latitude: 40.7597343,
  longitude: -74.046199,
  zoom: 11.5,
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
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

// prepare and init widgets HTML elements

const radarWidget = document.querySelector<HTMLSelectElement>('#radar-widget');
const sankeyWidget = document.querySelector<HTMLSelectElement>('#sankey-widget');

var radarWidgetChart = echarts.init(radarWidget);
var sankeyWidgetChart = echarts.init(sankeyWidget);

// define sources

let dataSource;
let sankeyDataSource;
let ntaDataSource;

async function initSources() {
  dataSource = await vectorQuerySource({
    ...cartoConfig,
    sqlQuery: `SELECT
      start_geom AS geom,
      *
    FROM
      carto-demo-data.demo_tables.manhattan_citibike_trips`
  });

  sankeyDataSource = await vectorQuerySource({
    ...cartoConfig,
    sqlQuery: `SELECT * FROM cartobq.docs.nyc_citibike_neighborhood_flows`
  });

  ntaDataSource = await vectorQuerySource({
    ...cartoConfig,
    sqlQuery: `SELECT
      ANY_VALUE(geom) as geom,
      start_name,
      SUM(trip_count) as total_trip_count
    FROM cartobq.docs.nyc_citibike_neighborhood_flows
    GROUP BY 2`
  });

  return;
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
  // Exit if dataSource is not ready
  if (!dataSource || !sankeyDataSource) {
    return;
  }

  radarWidgetChart.showLoading();
  sankeyWidgetChart.showLoading();

  // configure widgets

  const radarData = await dataSource.widgetSource.getCategories({
    column: 'weekday',
    operation: 'count',
    spatialFilter: viewportSpatialFilter
  });

  const sankeyData = await sankeyDataSource.widgetSource.getTable({
    columns: ['start_name', 'end_name', 'trip_count'],
    sortBy: 'trip_count',
    sortDirection: 'desc',
    limit: 15,
    spatialFilter: viewportSpatialFilter
  });

  // Prepare our radar chart
  const radarAxisMax = Math.max(...radarData.map(item => item.value)) * 1.25;
  const weekOrder = ['Sunday', 'Saturday', 'Friday', 'Thursday', 'Wednesday', 'Tuesday', 'Monday'];
  const sortedRadar = radarData.sort(
    (a, b) => weekOrder.indexOf(a.name) - weekOrder.indexOf(b.name)
  );

  const radarOption = {
    radar: {
      indicator: [
        {name: 'Sun', max: radarAxisMax},
        {name: 'Sat', max: radarAxisMax},
        {name: 'Fri', max: radarAxisMax},
        {name: 'Thu', max: radarAxisMax},
        {name: 'Wed', max: radarAxisMax},
        {name: 'Tue', max: radarAxisMax},
        {name: 'Mon', max: radarAxisMax}
      ]
    },
    series: [
      {
        name: 'Trips by weekday',
        type: 'radar',
        data: [
          {
            value: sortedRadar.map(item => item.value),
            name: 'Trips'
          }
        ]
      }
    ]
  };

  // Prepare our sankey chart
  const nodes = [];
  const links = [];

  sankeyData.rows.forEach(item => {
    const startNodeName = item.start_name + ' (S)';
    const endNodeName = item.end_name + ' (T)';
    if (!nodes.find(n => n.name === startNodeName)) {
      nodes.push({name: startNodeName});
    }
    if (!nodes.find(n => n.name === endNodeName)) {
      nodes.push({name: endNodeName});
    }
    links.push({
      source: startNodeName,
      target: endNodeName,
      value: item.trip_count
    });
  });

  const sankeyOption = {
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove'
    },
    series: [
      {
        type: 'sankey',
        data: nodes,
        links: links,
        emphasis: {
          focus: 'adjacency'
        },
        lineStyle: {
          color: 'source',
          curveness: 0.5
        },
        nodeAlign: 'right',
        layoutIterations: 0
      }
    ]
  };

  // render widgets!

  radarWidgetChart.setOption(radarOption);
  sankeyWidgetChart.setOption(sankeyOption);
  radarWidgetChart.hideLoading();
  sankeyWidgetChart.hideLoading();
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
      id: 'neighborhoods',
      data: ntaDataSource,
      pickable: true,
      opacity: 0.2,
      getFillColor: colorContinuous({
        attr: 'total_trip_count',
        domain: [0, 569962],
        colors: 'BluYl'
      }),
      getLineColor: [0, 0, 0],
      getLineWidth: 5,
      lineWidthMinPixels: 2
    }),
    new VectorTileLayer({
      id: 'stations',
      data: dataSource,
      getPointRadius: 50,
      pointRadiusMinPixels: 2,
      getFillColor: [200, 0, 80],
      getLineColor: [255, 255, 255],
      getLineWidth: 5,
      lineWidthMinPixels: 1
    })
  ];

  deck.setProps({
    layers: layers,
    getTooltip: ({object}) => {
      return (
        object && {
          html: `
        <strong>Neighbourhood</strong>: ${object.properties.start_name}<br/>
        <strong>Total trips</strong>: ${object.properties.total_trip_count}
      `
        }
      );
    }
  });
}

// render everything!

async function initialize() {
  await initSources();
  renderWidgets();
  renderLayers();
}

initialize();
