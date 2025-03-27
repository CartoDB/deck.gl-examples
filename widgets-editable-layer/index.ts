import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {WebMercatorViewport, Deck, Layer} from '@deck.gl/core';
import {vectorTableSource, createViewportSpatialFilter, createPolygonSpatialFilter} from '@carto/api-client';
import {BASEMAP, VectorTileLayer, VectorTileLayerProps} from '@deck.gl/carto';
import {debounce} from './utils';
import {
  EditableGeoJsonLayer,
  CompositeMode,
  DrawPolygonMode,
  ModifyMode,
  TranslateMode,
  FeatureCollection,
  ViewMode,
} from '@deck.gl-community/editable-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { MaskExtension } from '@deck.gl/extensions'
import { multiPolygon } from '@turf/helpers';

const EditMode = new CompositeMode([new TranslateMode(), new ModifyMode()])

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
  controller: {
    // disable double click since we are using that to complete the shape
    doubleClickZoom: false
  },
  parameters: {
    // @ts-expect-error - `depthTest` is not in the types
    depthTest: false,
  }
});

// Add basemap

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false
});

// prepare and init widgets HTML elements

const formulaWidget = document.querySelector<HTMLHeadingElement>('#formula-widget');

// define source

let dataSource;

// - editable layers data

// geojson containing all the drawn features
let editableData = {
  type: 'FeatureCollection' as const,
  features: []
} as FeatureCollection

// internal state to track which feature(s) are being edited
let selectedFeatureIndexes = [] as number[]

// reference to the <select> element that changes edit mode
const editableModePicker = document.querySelector<HTMLSelectElement>('#editable-mode-picker')

// reference to the <p> element describing current selected mode
const editComment = document.querySelector<HTMLParagraphElement>('#edit-comment')

const editCommentMap = {
  'draw': 'Click on the map to add points to a new polygon. To complete the polygon, press enter, do a double click, or click the initial point',
  'edit': 'Click a drawn polygon to select it for moving it or editing its points',
  'remove': 'Click a drawn polygon to remove it',
}

editableModePicker?.addEventListener('change', (ev) => {
  const value = (ev.target as HTMLSelectElement).value
  selectedMode = editableModes[value] ?? ViewMode
  selectedFeatureIndexes = []
  render()
})

// reference to the <input type="checkbox" /> that enables or disables the editable layer
const editModeToggle = document.querySelector<HTMLInputElement>('#edit-mode-enabled')
let editModeEnabled = editModeToggle?.checked

if (editableModePicker) {
  editableModePicker.disabled = !editModeEnabled
}

editModeToggle?.addEventListener('change', (ev) => {
  const value = (ev.target as HTMLInputElement).checked
  editModeEnabled = value
  if (editableModePicker) {
    editableModePicker.disabled = !editModeEnabled
  }
  render()
})

const editableModes = {
  draw: DrawPolygonMode,
  edit: EditMode,
  remove: ViewMode,
}
let selectedMode = editableModes[editableModePicker?.value ?? 'draw']


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

  formulaWidget!.innerHTML = 'Loading...';

  // configure widgets

  let spatialFilter = viewportSpatialFilter
  if (editModeEnabled && editableData.features.length > 0) {
    const _multiPolygon = multiPolygon(editableData.features.map((f) => (f.geometry as GeoJSON.Polygon).coordinates))
    spatialFilter = createPolygonSpatialFilter(_multiPolygon.geometry)
  }

  const formula = await dataSource.widgetSource.getFormula({
    operation: 'count',
    spatialFilter
  });

  // render widgets!

  formulaWidget!.innerHTML = formula.value;
}

function renderEditComment() {
  if (editComment) {
    editComment.textContent = editCommentMap[editableModePicker?.value ?? 'draw']
  }
}

// render Layers function

async function renderLayers() {
  const MASK_ID = 'mask-polygons'
  const maskEnabled = editModeEnabled && editableData.features.length > 0
  
  const editLayer = new EditableGeoJsonLayer({
    id: 'editable-layer',
    pickable: true,
    onEdit: ({ updatedData, editType, editContext }) => {
      updatedData.features = updatedData.features.map((f, index) => {
        f.properties.index = f.properties.index ?? index
        return f
      })
      console.log('editableData: ', editableData)
      editableData = updatedData
      renderLayers()
      if (editType === 'addFeature') {
        renderWidgets()
      }
    },
    onClick: (info) => {
      const feature = info.object as GeoJSON.Feature
      if (!feature) {
        return
      }

      if (feature.properties?.guideType || feature.properties?.editHandleType) {
        return // do not try to select for edit or remove feature guides and handles
      }

      const index = feature.properties?.index ?? 0
      if (editableModePicker?.value === 'remove') {
        selectedFeatureIndexes = []
        editableData = {
          ...editableData,
          features: editableData.features.filter((f) => f.properties?.index !== index)
        }
        renderWidgets()
      }
      if (editableModePicker?.value === 'edit') {
        selectedFeatureIndexes = [feature.properties?.index]
      }
      renderLayers()
    },
    autoHighlight: true,
    mode: editModeEnabled ? selectedMode : ViewMode,
    modeConfig: {
      preventOverlappingLines: true
    },
    selectedFeatureIndexes,
    data: editableData,
  })

  const dataLayer = dataSource ? new VectorTileLayer({
    id: 'places',
    pickable: false,
    data: dataSource,
    opacity: 1,
    getFillColor: [3, 111, 226],
    getLineColor: [255, 255, 255],
    getPointRadius: 50,
    getLineWidth: 10,
    pointRadiusMinPixels: 1,
    lineWidthMinPixels: 0.3,
    extensions: [new MaskExtension()],
    maskId: maskEnabled ? MASK_ID : undefined,
  } as VectorTileLayerProps & { maskId: string }) : null
  const maskLayer = new GeoJsonLayer({
    id: MASK_ID,
    data: editableData as GeoJSON.FeatureCollection,
    operation: 'mask',
  })

  deck.setProps({
    layers: [maskLayer, editLayer, dataLayer],
    getCursor: (editLayer as EditableGeoJsonLayer).getCursor.bind(editLayer) as any,
  });
}

// render everything!

async function initialize() {
  render()
  await initSource();
  render()
}

function render() {
  renderWidgets();
  renderLayers();
  renderEditComment();
}

initialize();
