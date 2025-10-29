import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorTableSource, VectorTileLayer, colorBins} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 39.8097343,
  longitude: -98.5556199,
  zoom: 4,
  bearing: 0,
  pitch: 0
};

const dataSource = vectorTableSource({
  ...cartoConfig,
  tableName: 'carto-demo-data.demo_tables.usa_counties'
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [
    new VectorTileLayer({
      id: 'counties',
      pickable: true,
      data: dataSource,
      autoLabels: true,
      getText: f => f.properties.name,
      pointType: 'text',
      textSizeScale: 10,
      getTextColor: [255, 255, 255, 255],
      textOutlineColor: [0, 0, 0, 255],
      textOutlineWidth: 6,
      textFontSettings: {
        sdf: true,
      },
      getFillColor: colorBins({
        attr: 'total_pop',
        domain: [0, 50000, 100000, 500000, 1000000, 5000000],
        colors: 'SunsetDark'
      }),
      getLineColor: [0, 0, 0, 100],
      lineWidthMinPixels: 0.5,
      opacity: 0.9
    })
  ],
  getTooltip: ({ object }) =>
    object && {
      html: `
        <strong>County</strong>: ${object.properties.name}<br/>
        <strong>Population</strong>: ${object.properties.total_pop?.toLocaleString() || 'N/A'}
      `
    }
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});
