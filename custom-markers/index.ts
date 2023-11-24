import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer} from '@deck.gl/carto';
import {CollisionFilterExtension} from '@deck.gl/extensions';
import { ICON_MAPPING, ICON_WIDTH } from './iconUtils';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw'
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 40.730610,
  longitude: -74.0256284,
  zoom: 12,
  bearing: 0,
  pitch: 45,
  minZoom: 12,
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
});

let selectedCategories = [];
let lastSelectedCategory = null;
const loader = document.querySelector('#loader');

function updateSelectedCategories() {
  const checkboxes = Array.from(document.querySelectorAll('.category-container .categories'));
  const selectedValues = checkboxes
    .filter((checkbox: HTMLInputElement) => checkbox.checked)
    .map((checkbox: HTMLInputElement) => checkbox.value);

  selectedCategories = selectedValues.sort((a, b) => {
    if (a === lastSelectedCategory) return 1;
    if (b === lastSelectedCategory) return -1;
    return 0;
  });

  render();
}

function handleCheckboxChange(checkbox: HTMLInputElement) {
  const value = checkbox.value;
  lastSelectedCategory = checkbox.checked ? value : null;
  updateSelectedCategories();
}

const checkboxes = document.querySelectorAll('.category-container .categories');
checkboxes.forEach(checkbox => {
  checkbox.addEventListener('change', () => handleCheckboxChange(checkbox as HTMLInputElement));
});

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  },
});

async function render() {
  loader!.classList.remove('hidden');
  const dataSource = vectorQuerySource({
    ...cartoConfig,   
    sqlQuery: `SELECT geom, osm_id, name, address, group_name, subgroup_name  FROM carto-demo-data.demo_tables.osm_pois_usa WHERE group_name IN UNNEST(@groupName)`,
    queryParameters: {
      groupName: selectedCategories
    }
  });

  const layers = [
    new VectorTileLayer({
      id: 'places',
      data: dataSource,
      pickable: true,
      pointType: 'icon',
      getIcon: d => {
        return {
          url: ICON_MAPPING[d.properties.group_name].icon,
          width: ICON_WIDTH,
          height: ICON_WIDTH,
        };
      },
      getIconSize: d => 15,
      iconSizeUnits: 'pixels',
      iconSizeScale: 2,
      iconBillboard: true,
      iconAlphaCutoff: -1,
      // Enable collision detection
      extensions: [new CollisionFilterExtension()],
      collisionEnabled: true,
      getCollisionPriority: d => Object.keys(selectedCategories).indexOf(d.properties.group_name),
      collisionTestProps: {
        sizeScale: ICON_WIDTH * 1.2,
        sizeMaxPixels: ICON_WIDTH * 1.2,
        sizeMinPixels: ICON_WIDTH * 1.2,
      },
      onDataLoad: () => {
        loader!.classList.add('hidden');
      }
    })
  ];

  deck.setProps({
    layers: layers,
    getTooltip: ({object}) =>  object && {
      html: `
      <div class="tooltip-container">
        <div class="tooltip-row">
          <div class="tooltip-key">Name</div>
          <div class="tooltip-value">${object.properties.name}</div>
        </div>
        <div class="tooltip-row">
          <div class="tooltip-key">OSM ID</div>
          <div class="tooltip-value">${object.properties.osm_id}</div>
        </div>
        <div class="tooltip-row">
          <div class="tooltip-key">Address</div>
          <div class="tooltip-value">${object.properties.address}</div>
        </div>
        <div class="tooltip-row">
          <div class="tooltip-key">Group</div>
          <div class="tooltip-value">${object.properties.group_name}</div>
        </div>
        <div class="tooltip-row">
          <div class="tooltip-key">Sub Group</div>
          <div class="tooltip-value">${object.properties.subgroup_name}</div>
        </div>
      </div>
      `
    }
  });
}

updateSelectedCategories();
render();
