import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer} from '@deck.gl/carto';
import {CollisionFilterExtension} from '@deck.gl/extensions';
import Financial from './markers/bank.svg';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const ICON_MAPPING = {
  Financial: Financial,
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

let selectedOsmCategory = 'Financial';
const osmCategorySelector = document.querySelector<HTMLSelectElement>('#osmCategorySelector');
osmCategorySelector?.addEventListener('change', () => {
  selectedOsmCategory = osmCategorySelector.value;
  render();
});

async function render() {
  const items = ['Financial', 'Tourism'];
  const selectedCategories = items.map(item => `'${item}'`).join(', ');

  const dataSource = vectorQuerySource({
    ...cartoConfig,
    queryParameters: {
      groupName: items
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
          url: ICON_MAPPING[d.properties.group_name],
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
      collisionTestProps: {radiusScale: 2}
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();
