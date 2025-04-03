import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Color, Deck, MapViewState} from '@deck.gl/core';
import {DataFilterExtension} from '@deck.gl/extensions';
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
  WidgetSourceProps,
  getDataFilterExtensionProps
} from '@carto/api-client';
import * as echarts from 'echarts';
import {RASTER_CATEGORY_MAP} from './raster_category_map';

const cartoConfig = {
  // @ts-expect-error misconfigured env variables
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  // @ts-expect-error misconfigured env variables
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: 'carto_dw'
};

const INITIAL_VIEW_STATE: MapViewState = {
  latitude: 40.728,
  longitude: -85.731,
  zoom: 6,
  minZoom: 5.5
};

type Source = ReturnType<typeof rasterSource>;

let source: Source;
let viewState = INITIAL_VIEW_STATE;
const filters: Filters = {};

let rasterMetadata: RasterMetadata;

// DOM elements
const formulaWidget = document.getElementById('formula-data') as HTMLDivElement;
const treemapWidget = document.getElementById('treemap-data') as HTMLDivElement;
const rasterResolution = document.getElementById('raster-resolution') as HTMLDivElement;

const treemapChart = echarts.init(treemapWidget);

// RASTER RESOLUTION
// Our raster contains a pyramid of tiles with different resolutions. For clarity, we'll show the resolution for the current zoom level.

function setRasterResolution(zoom: number) {
  let resolution: string = '100m';
  if (zoom > 11.5) {
    resolution = '20m';
  } else if (zoom > 10.5) {
    resolution = '40m';
  } else if (zoom > 9.5) {
    resolution = '80m';
  } else if (zoom > 8.5) {
    resolution = '160m';
  } else if (zoom > 7.5) {
    resolution = '320m';
  } else if (zoom > 6.5) {
    resolution = '640m';
  } else if (zoom > 5.5) {
    resolution = '1280m';
  }

  rasterResolution.innerHTML = resolution;
}

// FILTERS
treemapChart.on('click', params => {
  if (params.componentType === 'series') {
    const category = params.name;
    const entry = Object.entries(RASTER_CATEGORY_MAP).find(([key, value]) => value === category);
    if (entry) {
      clearBtn.style.visibility = 'visible';
      const value = Number(entry[0]);
      addFilter(filters, {
        column: CATEGORY_COLUMN,
        type: FilterType.IN,
        values: [value],
        owner: TREE_WIDGET_ID
      });
      render({includeTreemap: false}); // this makes sure the treemap zoom function works by not rendering the treemap again
    } else {
      removeFilter(filters, {column: CATEGORY_COLUMN, owner: TREE_WIDGET_ID});
      render();
    }
  }
});

const clearBtn = document.querySelector('.clear-btn') as HTMLButtonElement;
clearBtn.addEventListener('click', () => {
  removeFilter(filters, {column: CATEGORY_COLUMN});
  clearBtn.style.visibility = 'hidden';
  render();
});

const getFillColorLayer = (d: GeoJSON.Feature<GeoJSON.Geometry, {band_1: number}>) => {
  const value = d.properties.band_1;
  if (rasterMetadata) {
    const meta = rasterMetadata.bands[0];
    if (meta.colorinterp === 'palette') {
      const category = meta.colortable?.[value];
      if (category) {
        const [r, g, b] = category;
        if (r === 0 && g === 0 && b === 0) {
          return [0, 0, 0, 0] as Color;
        }

        return category as Color;
      }
    }
  }
  return [0, 0, 0, 0] as Color;
};

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
      onViewportLoad: async tiles => {
        if (!source) return;
        const {widgetSource} = await source;
        setWidgetsLoading();
        await widgetSource.loadTiles(tiles);
        debouncedRenderWidgets();
      },
      extensions: [new DataFilterExtension({filterSize: 4})],
      ...getDataFilterExtensionProps(filters)
    })
  ];

  deck.setProps({
    layers,
    getTooltip: ({object}) => {
      const value = object?.properties?.band_1;
      if (!value) {
        return null;
      }

      return {
        text: RASTER_CATEGORY_MAP[value]
      };
    }
  });
}

// WIDGETS

// Loading state and handlers for widgets

let widgetsLoading = false;

function setWidgetsLoading() {
  if (widgetsLoading) {
    return;
  }

  widgetsLoading = true;
  formulaWidget.innerHTML = '<span style="font-weight: 400; font-size: 14px;">Loading...</span>';
  treemapChart.showLoading();
}

// Render widgets

async function renderWidgets({includeTreemap = true} = {}) {
  if (!source) return;
  const {widgetSource} = await source;

  if (includeTreemap) {
    await Promise.all([renderFormula(widgetSource), renderTreemap(widgetSource)]);
  } else {
    await renderFormula(widgetSource);
  }

  // Reset loading state
  widgetsLoading = false;
}

async function renderFormula(ws: WidgetSource<WidgetSourceProps>) {
  const formula = await ws.getFormula({
    column: '*',
    operation: 'count',
    filters: filters,
    spatialFilter: getSpatialFilterFromViewState(viewState)
  });
  formulaWidget.textContent = Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
    // notation: 'compact'
  }).format(formula.value ?? 0);
}

const TREE_WIDGET_ID = 'band_1_widget';
const CATEGORY_COLUMN = 'band_1';

async function renderTreemap(ws: WidgetSource<WidgetSourceProps>) {
  const categories = await ws.getCategories({
    column: CATEGORY_COLUMN,
    operation: 'count',
    filterOwner: TREE_WIDGET_ID,
    spatialFilter: getSpatialFilterFromViewState(viewState)
  });

  // Calculate total for percentages
  const total = categories.reduce((sum, c) => sum + c.value, 0);

  const option = {
    tooltip: {
      formatter: (params: any) => {
        const percentage = ((params.value / total) * 100).toFixed(1);
        return `${
          params.name
        }<br/>Count: ${params.value.toLocaleString()}<br/>Percentage: ${percentage}%`;
      }
    },
    series: [
      {
        name: 'Land use categories',
        type: 'treemap',
        data: categories.map(c => {
          const rgb = getFillColorLayer({properties: {band_1: c.name}} as any);
          return {
            name: RASTER_CATEGORY_MAP[Number(c.name)],
            value: c.value,
            itemStyle: {
              color: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${rgb[3]})`
            }
          };
        }),
        label: {
          show: true,
          color: '#ffffff',
          textBorderColor: 'rgba(0, 0, 0, 0.5)',
          textBorderWidth: 3,
          fontSize: 10
        },
        leafSize: 10,
        width: '100%',
        height: '100%'
      }
    ]
  };

  treemapChart.setOption(option);
  treemapChart.hideLoading();
}

const debouncedRenderWidgets = debounce(renderWidgets, 700);

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
    setRasterResolution(viewState.zoom);
  }
});

function render({includeTreemap = true} = {}) {
  renderLayers();
  renderWidgets({includeTreemap});
}

function setup() {
  source = rasterSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_rasters.usda_land_classification'
  });
  renderLayers();
}

setup();
