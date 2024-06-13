import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, quadbinTableSource} from '@deck.gl/carto';
import {HeatmapTileLayer} from './node_modules/@deck.gl/carto/dist/index';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 20,
  longitude: -40,
  zoom: 1.5,
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

// Set our inputs

let intensity: number = 10;
let blurRadius: number = 30;

const intensityLabel = document.getElementById('intensity-label');
const blurRadiusLabel = document.getElementById('blur-radius-label');

document.getElementById('intensity').addEventListener('input', event => {
  intensity = Number(event.target.value);
  intensityLabel.innerHTML = Number(event.target.value);
  render();
});

document.getElementById('blur-radius').addEventListener('input', event => {
  blurRadius = Number(event.target.value);
  blurRadiusLabel.innerHTML = Number(event.target.value);
  render();
});

function render() {
  // To use the heatmap layer, we need to aggregate our points into quadbins.
  // With CARTO, this is as easy as configuring a quadbinTableSource using a geometry column as our spatialDataColumn
  const dataSource = quadbinTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.fires_worldwide',
    spatialDataColumn: 'geom',
    aggregationExp: 'COUNT(*) AS fires',
    aggregationResLevel: 7
  });

  const layers = [
    new HeatmapTileLayer({
      id: 'fires_heatmap',
      data: dataSource,
      radiusPixels: blurRadius,
      colorDomain: [0, 1],
      opacity: 0.85,
      getWeight: d => {
        return d.properties.fires;
      },
      intensity: intensity
      // we could modify the color palette used in our heatmap with colorRange
      // colorRange: [
      //   [255, 255, 204],
      //   [199, 233, 180],
      //   [127, 205, 187],
      //   [65, 182, 196],
      //   [44, 127, 184],
      //   [37, 52, 148]
      // ]
      // updateTriggers: {
      //   radiusPixels: blurRadius,
      //   intensity: intensity
      // }
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();
