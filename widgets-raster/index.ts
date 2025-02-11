import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Color, Deck, MapViewState} from '@deck.gl/core';
import {BASEMAP, RasterTileLayer} from '@deck.gl/carto';
import {debounce, getSpatialFilterFromViewState} from './utils';
import {
  addFilter,
  Filters,
  FilterType,
  RasterMetadata,
  rasterSource,
  removeFilter,
  WidgetSource,
  WidgetSourceProps
} from '@carto/api-client';
import * as echarts from 'echarts';
import { RASTER_CATEGORY_MAP } from './raster_category_map';

const cartoConfig = {
  // @ts-expect-error misconfigured env variables
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  // @ts-expect-error misconfigured env variables
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: 'amanzanares-pm-bq'
};

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: 42.728,
  longitude: -78.731,
  zoom: 6,
  minZoom: 3.5,
};

type Source = ReturnType<typeof rasterSource>;

let source: Source;
let viewState = INITIAL_VIEW_STATE;
const filters: Filters = {};

let rasterMetadata: RasterMetadata;

// DOM elements
const formulaWidget = document.getElementById('formula-data') as HTMLDivElement;
const treemapWidget = document.getElementById('treemap-data') as HTMLDivElement;

const treemapChart = echarts.init(treemapWidget);

// // disabled interaction until maps API supports filtering here
// treemapChart.on('click', (params) => {
//   if (params.componentType === 'series') {
//     const category = params.name
//     const entry = Object.entries(RASTER_CATEGORY_MAP).find(([key, value]) => value === category)
//     if (entry) {
//       const value = Number(entry[0])
//       addFilter(
//         filters,
//         {
//           column: CATEGORY_COLUMN,
//           type: FilterType.IN,
//           values: [value],
//           owner: TREE_WIDGET_ID
//         }
//       );
//       render();
//     } else {
//       removeFilter(filters, {column: CATEGORY_COLUMN, owner: TREE_WIDGET_ID})
//       render();
//     }
//   }
// })

// const histogramWidget = document.getElementById('histogram-data') as HTMLCanvasElement;
// const histogramClearBtn = document.querySelector(
//   '.histogram-widget .clear-btn'
// ) as HTMLButtonElement;
// histogramClearBtn.addEventListener('click', () => {
//   removeFilter(filters, {column: 'urbanity'});
//   render();
// });

const getFillColorLayer = (d: GeoJSON.Feature<GeoJSON.Geometry, { band_1: number }>) => {
  const value = d.properties.band_1;
  if (rasterMetadata){
    const meta = rasterMetadata.bands[0]
    if (meta.colorinterp === 'palette') {
      const category = meta.colortable?.[value]
      if (category) {
        const [r, g, b] = category
        if (r === 0 && g === 0 && b === 0) {
          return [0, 0, 0, 0] as Color
        }

        return category as Color
      }
    }
  }
  return [0, 0, 0, 0] as Color
}

function render() {
  source = rasterSource({
    ...cartoConfig,
    filters,
    tableName: 'cartodb-on-gcp-pm-team.amanzanares_raster.classification_us_compressed',
  })
  renderWidgets();
  renderLayers();
}

function renderLayers() {
  const layers = [
    new RasterTileLayer({
      id: 'raster_layer',
      data: source,
      pickable: true,
      getFillColor: getFillColorLayer,
      onDataLoad: (tilejson: any) => {
        rasterMetadata = tilejson.raster_metadata;
      },
      onViewportLoad: async (tiles) => {
        const {widgetSource} = await source;
        widgetSource.loadTiles(tiles);
        debouncedRenderWidgets();
      },
    })
  ];

  deck.setProps({
    layers,
    getTooltip: ({object}) => {
      const value = object?.properties?.band_1
      if (!value) {
        return null;
      }

      return {
        text: RASTER_CATEGORY_MAP[value]
      }
    }
  });
}

async function renderWidgets() {
  const {widgetSource} = await source;
  widgetSource.extractTileFeatures({
    spatialFilter: getSpatialFilterFromViewState(viewState)!,
  })
  
  await Promise.all([renderFormula(widgetSource), renderHistogram(widgetSource)]);
}

async function renderFormula(ws: WidgetSource<WidgetSourceProps>) {
  formulaWidget.innerHTML = '<span style="font-weight: 400; font-size: 14px;">Loading...</span>';
  const formula = await ws.getFormula({
    column: '*',
    operation: 'count',
    spatialFilter: getSpatialFilterFromViewState(viewState),
    spatialIndexReferenceViewState: viewState
  });
  formulaWidget.textContent = Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
    // notation: 'compact'
  }).format(formula.value ?? 0);
}

const TREE_WIDGET_ID = 'band_1_widget';
const CATEGORY_COLUMN = 'band_1';

async function renderHistogram(ws: WidgetSource<WidgetSourceProps>) {
  treemapChart.showLoading();

  const categories = await ws.getCategories({
    column: CATEGORY_COLUMN,
    operation: 'count',
    filterOwner: TREE_WIDGET_ID,
    spatialFilter: getSpatialFilterFromViewState(viewState),
    spatialIndexReferenceViewState: viewState
  })

  const colors = categories.map(c => {
    const rgb = getFillColorLayer({ properties: { band_1: c.value } } as any)
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${rgb[3]})`
  })

  const option = {
    tooltip: {},
    series: [{
      name: 'Land use categories',
      type: 'treemap',
      data: categories.map((c, i) => ({
        name: RASTER_CATEGORY_MAP[Number(c.name)],
        value: c.value,
        color: colors[i]
      })),
      label: {
        show: true,
      },
      leafSize: 10,
    }]
  }

  treemapChart.setOption(option);
  treemapChart.hideLoading();
}

const debouncedRenderWidgets = debounce(renderWidgets, 500);

// Main execution
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: viewState,
  controller: true
});
deck.setProps({
  onViewStateChange: props => {
    const {longitude, latitude, ...rest} = props.viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
    viewState = props.viewState;
    debouncedRenderWidgets();
  }
});

render();
