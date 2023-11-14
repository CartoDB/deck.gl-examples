import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import maplibregl from 'maplibre-gl';
import {vectorTableSource, VectorTileLayer} from '@deck.gl/carto';
import {CollisionFilterExtension} from '@deck.gl/extensions';
import {scaleLinear} from 'd3-scale';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = import.meta.env.VITE_API_CONNECTION_NAME;
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 39.1,
  longitude: -94.57,
  zoom: 3.8,
  maxZoom: 16,
  pitch: 0,
  bearing: 0
};

const colorScale = scaleLinear()
  .domain([3, 4, 5, 6, 7])
  .range([
    [29, 145, 192],
    [65, 182, 196],
    [127, 205, 187],
    [199, 233, 180],
    [237, 248, 177]
  ]);

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: MAP_STYLE,
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
  const dataSource = vectorTableSource({
    ...cartoConfig,
    tableName: 'cartobq.public_account.cities_1000'
  });

  const layers = [
    new VectorTileLayer({
      id: 'world-cities',
      pickable: true,
      data: dataSource,
      opacity: 1,
      pointType: 'text',
      textCharacterSet: 'auto',
      textFontSettings: {
        buffer: 8
      },
      getText: d => d.properties.name,
      textSizeScale: 1,
      getTextSize: 32,
      getTextAngle: 0,
      getTextColor: d => colorScale(Math.log10(d.properties.population)),
      getTextAnchor: 'middle',
      getTextAlignmentBaseline: 'center',
      parameters: {depthTest: false},

      // Enable collision detection
      extensions: [new CollisionFilterExtension()],
      collisionEnabled: true,
      collisionGroup: 'def',
      getCollisionPriority: 0,
      collisionTestProps: {
        sizeScale: 2 // Enlarge text to increase hit area
      }
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();
