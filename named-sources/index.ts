import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorQuerySource, VectorTileLayer, colorBins} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

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

let selectedYear = 2013;
const selectedYearSelector = document.querySelector<HTMLSelectElement>('#yearSelector');
selectedYearSelector?.addEventListener('change', () => {
  selectedYear = Number(selectedYearSelector.value);
  render();
});

function render() {
  const accidentsByState = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: 'public_example_accidents_by_state',
    queryParameters: {selectedYear: selectedYear}
  });

  const accidents = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: 'public_example_accidents',
    queryParameters: {selectedYear: selectedYear}
  });

  const layers = [
    new VectorTileLayer({
      id: 'accidents_by_state',
      data: accidentsByState,
      pickable: true,
      opacity: 0.8,
      getFillColor: colorBins({
        attr: 'count',
        domain: [0, 10, 30, 60, 100, 200],
        colors: 'PurpOr'
      }),
      getLineColor: [255, 255, 255],
      lineWidthMinPixels: 1
    }),
    new VectorTileLayer({
      id: 'accidents_prop_symbols',
      data: accidents,
      opacity: 0.8,
      getFillColor: [255, 255, 255],
      pointRadiusMinPixels: 1,
      radiusUnits: 'pixels',
      getPointRadius: (d: any) => {
        return (d.properties.total_damage + 10) / 100;
      }
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();
