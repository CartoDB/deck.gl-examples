import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import { Deck } from '@deck.gl/core';
import { VectorTileLayer } from '@deck.gl/carto';
import { colorCategories, vectorQuerySource } from '@deck.gl/carto';

const cartoConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
  connectionName: import.meta.env.VITE_API_CONNECTION_NAME
};

const SQL_QUERY = `
  SELECT geom, country_name, continent_name, pop_2015
  FROM cartobq.public_account.world_population_2015
  WHERE CAST(pop_2015 as INT64) between CAST(@min as INT64) and CAST(@max as INT64)
  ORDER BY pop_2015 DESC
`;

const INITIAL_VIEW_STATE = { latitude: 15, longitude: 10, zoom: 2 };
const MIN_POPULATION = 1;
const MAX_POPULATION = 800000000;
const POPULATION_RADIUS_SCALE = 30.0 / 27620.2642999664;

let selectedMaxPopulation = MAX_POPULATION;
const selectedPopulationSelector = document.getElementById('population-slider');
const populationLabel = document.getElementById('slider-value');

const getColorConfiguration = () => colorCategories({
  attr: 'continent_name',
  domain: ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'],
  colors: [
    [117, 68, 92],
    [175, 100, 88],
    [213, 167, 91],
    [115, 111, 76],
    [91, 120, 142],
    [76, 78, 143]
  ]
});

const getPointRadius = d => (POPULATION_RADIUS_SCALE * Math.sqrt(d.properties.pop_2015));

function initializeMap(apiKey, mapName, region) {
  const map = new maplibregl.Map({
    container: 'map',
    style: `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${apiKey}`,
    interactive: false
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  return map;
}

function setupEventHandlers(deckInstance, mapInstance) {
  if (!selectedPopulationSelector || !populationLabel) {
    throw new Error('Missing DOM elements');
  }
  selectedPopulationSelector.addEventListener('input', handlePopulationChange);
  deckInstance.setProps({
    onViewStateChange: ({ viewState }) => {
      const { longitude, latitude, ...rest } = viewState;
      mapInstance.jumpTo({ center: [longitude, latitude], ...rest });
    }
  });
}

function handlePopulationChange() {
  if (!selectedPopulationSelector || !populationLabel) {
    throw new Error('Missing DOM elements');
  }
  selectedMaxPopulation = Number(selectedPopulationSelector.value);
  populationLabel.textContent = selectedMaxPopulation.toString();
  render();
}

function render() {
  const source = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: SQL_QUERY,
    queryParameters: { min: MIN_POPULATION, max: selectedMaxPopulation }
  });

  const layers = [
    new VectorTileLayer({
      id: 'world_population',
      data: source,
      opacity: 1,
      pickable: true,
      getFillColor: getColorConfiguration(),
      getLineColor: [0, 0, 0, 204],
      pointRadiusUnits: 'pixels',
      getPointRadius: getPointRadius,
      lineWidthMinPixels: 1
    })
  ];

  deck.setProps({ layers });
}

// Main execution
const map = initializeMap(import.meta.env.VITE_AMAZON_API_KEY, 'deck.gl-examples', 'us-east-1');
const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [],
  getTooltip: ({ object }) => object && {
    html: `${object.properties.country_name}: ${object.properties.pop_2015}`
  }
});

setupEventHandlers(deck, map);
render();
