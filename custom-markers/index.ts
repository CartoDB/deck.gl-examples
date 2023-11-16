import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer} from '@deck.gl/carto';
import {CollisionFilterExtension} from '@deck.gl/extensions';
import Financial from './markers/Financial.svg';
import Tourism from './markers/Tourism.svg';
import Sustenance from './markers/Sustenance.svg';
import Commercial from './markers/Commercial.svg';
import Education from './markers/Education.svg';
import Entertainment from './markers/Entertainment.svg';
import Transportation from './markers/Transportation.svg';
import Healthcare from './markers/Healthcare.svg';
import Civic from './markers/Civic.svg';
import Star from './markers/Others.svg';
import Otehers from './markers/Others.svg';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;

const connectionName = 'carto_dw' //. TODO: Add connection name here. Example: 'carto

const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const iconWidth = 15;

const ICON_MAPPING = {
  Financial: {
    icon: Financial,
    priority: 1
  },
  Tourism: {
    icon: Tourism,
    priority: 0
  },
  Sustenance: {
    icon: Sustenance,
    priority: 2
  },
  Commercial: {
    icon: Commercial,
    priority: 3
  },
  Education: {
    icon: Education,
    priority: 4
  },
  "Entertainment, Arts & Culture": {
    icon: Entertainment,
    priority: 5
  },
  Transportation: {
    icon: Transportation,
    priority: 6
  },
  Healthcare: {
    icon: Healthcare,
    priority: 7
  },
  'Civic amenities': {
    icon: Civic,
    priority: 8
  },
  Star: {
    icon: Star,
    priority: 9
  },
  Others: {
    icon: Otehers,
    priority: 10
  }
};

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
  }
});

async function render() {
  loader.classList.remove('hidden');
  const dataSource = vectorQuerySource({
    ...cartoConfig,
    queryParameters: {
      groupName: selectedCategories
    },
    sqlQuery: `select * from carto-demo-data.demo_tables.osm_pois_usa where group_name IN UNNEST(@groupName)`
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
          width: iconWidth,
          height: iconWidth,
          anchorY: iconWidth / 2
        };
      },
      getIconSize: d => 15,
      iconSizeUnits: 'pixels',
      iconSizeScale: 2,
      iconBillboard: true,
      // Enable collision detection
      extensions: [new CollisionFilterExtension()],
      collisionEnabled: true,
      getCollisionPriority: d => Object.keys(selectedCategories).indexOf(d.properties.group_name),
      collisionTestProps: {
        sizeScale: iconWidth * 4,
        sizeMaxPixels: iconWidth * 4,
        sizeMinPixels: iconWidth * 4,
      },
      onDataLoad: () => {
        loader.classList.add('hidden');
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
