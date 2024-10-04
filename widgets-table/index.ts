import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck} from '@deck.gl/core';
import {vectorTableSource, createViewportSpatialFilter} from '@carto/api-client';
import {BASEMAP, VectorTileLayer} from '@deck.gl/carto';
import {debounce} from './utils';
import {Grid} from 'gridjs';
import 'gridjs/dist/theme/mermaid.css';

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

const tableWidgetDom = document.querySelector<HTMLDivElement>('#table-widget');

let tableWidget = new Grid({
  data: [],
  columns: []
}).render(tableWidgetDom);

// define source

let dataSource;

async function initSource() {
  return (dataSource = await vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.osm_pois_usa'
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
  // Exit if dataSource is not ready
  if (!dataSource) {
    return;
  }

  // configure widgets

  const columns = {
    osm_id: 'OSM ID',
    name: 'Name',
    group_name: 'Group Name',
    subgroup_name: 'Subgroup Name'
  };

  // render widgets!
  tableWidget
    .updateConfig({
      server: {
        url: '',
        data: async opts => {
          let colName = 'OSM_ID';
          let dir = 'asc';
          let offset = 0;

          const urlParams = new URLSearchParams(opts.url);

          if (urlParams.get('order') && urlParams.get('dir')) {
            colName = urlParams.get('order');
            dir = urlParams.get('dir');
          }

          if (urlParams.get('offset')) {
            offset = parseInt(urlParams.get('offset'));
          }

          const tableData = await dataSource.widgetSource.getTable({
            columns: Object.keys(columns),
            spatialFilter: viewportSpatialFilter,
            sortBy: Object.keys(columns).find(key => columns[key] === colName),
            sortDirection: dir,
            limit: 5,
            offset: offset
          });

          const response = {
            data: tableData.rows.map(row => Object.values(row)),
            total: tableData.totalCount
          };

          return response;
        }
      },
      columns: Object.values(columns),
      style: {
        table: {
          'font-size': '11px'
        },
        td: {
          padding: '8px'
        },
        th: {
          padding: '8px'
        }
      },
      sort: {
        multiColumn: false,
        server: {
          url: (prev, sortedCols) => {
            if (!sortedCols.length) return prev;

            const col = sortedCols[0];
            const dir = col.direction === 1 ? 'asc' : 'desc';
            let colName = Object.values(columns)[col.index];

            return `${prev}&order=${colName}&dir=${dir}`;
          }
        }
      },
      pagination: {
        server: {
          url: (prev, page, limit) => `${prev}&offset=${page * limit}`
        },
        limit: 5
      }
    })
    .forceRender();
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
