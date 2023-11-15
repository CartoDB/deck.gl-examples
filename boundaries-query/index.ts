import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, boundaryQuerySource, VectorTileLayer} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'bqconn';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 40.7128,
  longitude: -74.0060,
  zoom: 10,
  bearing: 0,
  pitch: 30
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  getTooltip: ({ object }) => {
    if (!object) return;
    let html = ''
    const {properties} = object;
    for (const key in properties) {
      html += `<strong>${key}</strong>: ${properties[key]}<br/>`;
    }
    return {html}
  }
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false,
});
deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});


function render() {

  const querySource = boundaryQuerySource({
    ...cartoConfig,
    boundaryId: 'usa_zip_code_v1',
    sqlQuery: `SELECT geoid, AVG(avg_ticket) as avg_ticket
        FROM carto-dev-data.mastercard.original_index_usa_uszc_2015_daily 
          WHERE timeinstant between @start and @finish
          and industry='ret' and segment='o' and geo_type='m'
          group by geoid`,
    matchingColumn: 'geoid',
    queryParameters: {
      start: '2022-06-01',
      finish: '2023-12-31'
    }
  });

  const layers = [
    new VectorTileLayer({
      id: 'boundary-query',
      data: querySource,
      pickable: true,
      getFillColor: [18,147,154],
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
    })
  ]
  deck.setProps({layers});
}

render()


