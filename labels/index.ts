import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import maplibregl from 'maplibre-gl';
import {VectorTileLayer, vectorQuerySource} from '@deck.gl/carto';
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

  const fontSize = 24;
  const scale = 16;
  const sizeMaxPixels = (scale / 3) * fontSize;
  const sizeMinPixels = Math.min(scale / 1000, 0.5) * fontSize;

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
  const dataSource = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: `select geom, population, name from cartobq.public_account.cities_1000 WHERE population > 0 ORDER BY population DESC`
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
      textSizeScale: fontSize,
      textSizeMaxPixels: sizeMaxPixels,
      textSizeMinPixels: sizeMinPixels,
      getTextSize: d => {
        const size = Math.pow(d.properties.population, 0.25) / 20;
        return size < 0.5 ? 0.7 : size;
      },
      getTextAngle: 0,
      getTextColor: d => colorScale(Math.log10(d.properties.population)),
      getCollisionPriority: d => Math.log10(d.properties.population),
      collisionTestProps: {
        sizeScale: fontSize * 2,
        sizeMaxPixels: sizeMaxPixels * 2,
        sizeMinPixels: sizeMinPixels * 2,
      },
      extensions: [new CollisionFilterExtension()],
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();
