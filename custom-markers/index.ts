import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer} from '@deck.gl/carto';
import {CollisionFilterExtension} from '@deck.gl/extensions';
import Financial from './markers/bank.svg';
import Tourism from './markers/beach.svg';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const ICON_MAPPING = {
  Financial: {
    icon: Financial,
    priority: 1
  },
  Tourism: {
    icon: Tourism,
    priority: 0
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

// Add basemap
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

let selectedCategories = [];

function updateSelectedCategories() {
  selectedCategories = [];
  const checkboxes = document.querySelectorAll('.category-container .categories');
  
  checkboxes.forEach(checkbox => {
      if ((checkbox as HTMLInputElement).checked) {
          selectedCategories.push(checkbox.id);
      }
  });

  render();
}

// Agregar el evento listener a cada checkbox
document.querySelectorAll('.category-container .categories').forEach(checkbox => {
  checkbox.addEventListener('change', updateSelectedCategories);
});

async function render() {
  const dataSource = vectorQuerySource({
    ...cartoConfig,
    queryParameters: {
      groupName: selectedCategories
    },
    sqlQuery: `select geom, group_name from carto-demo-data.demo_tables.osm_pois_usa where group_name IN UNNEST(@groupName)`
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
          width: 128,
          height: 128,
          anchorY: 64
        };
      },
      getIconSize: d => 32,
      getIconColor: d => [255, 0, 0],
      // Enable collision detection
      extensions: [new CollisionFilterExtension()],
      collisionEnabled: true,
      getCollisionPriority: d => ICON_MAPPING[d.properties.group_name].priority,
      collisionTestProps: {radiusScale: 150}
    })
  ];

  deck.setProps({
    layers: layers
  });
}

updateSelectedCategories();
render();

