import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer, colorBins} from '@deck.gl/carto';
import * as cartoColors from 'cartocolor';


const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 3,
  bearing: 0,
  pitch: 0,
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  getTooltip: ({ object }) => 
    object && {
      html: `${object.properties.pct_higher_ed.toFixed(2)} %`
  }
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

let palette: string;
const paletteSelector = document.querySelector<HTMLSelectElement>('#palette');
paletteSelector?.addEventListener('change', () => {
  palette = paletteSelector.value;
  render(palette);
});
palette = paletteSelector!.value;

function drawLegend(palette: string) {
  const colors: string[] = cartoColors[palette][7]; 
  const html = colors.map(color => '<div style="background-color:' + color + '"></div>').join('') 
  const el = document.querySelector<HTMLSelectElement>('#colorBreaks');
  el!.innerHTML = html;
}

function render(palette) {
  const dataSource = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: 'SELECT fid, geom, pct_higher_ed FROM cartobq.public_account.higher_edu_by_county',
  });

  const layers = [
    new VectorTileLayer({
      id: 'temp',
      data: dataSource,
      pickable: true,
      autoHighlight: true,
      uniqueIdProperty: 'fid', // required to autoHighlight
      getFillColor: colorBins({
        attr: "pct_higher_ed",
        domain: [0, 20, 30, 40, 50, 60, 70],
        colors: palette
      }),
      getLineColor: [0, 0, 0, 100],
      lineWidthMinPixels: 0.5,
      // updateTriggers: { getFillColor: palette }
    })
  ];

  deck.setProps({
    layers: layers
  });

  drawLegend(palette);
}

render(palette);