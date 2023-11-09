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

const INITIAL_VIEW_STATE = { latitude: 15, longitude: 10, zoom: 2 };
const MIN_POPULATION = 1;
const MAX_POPULATION = 800000000;
const POPULATION_RADIUS_SCALE = 30.0 / 27620.2642999664;

const formatNumber = number =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short'
  }).format(number);

function render() {
  const source = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: `SELECT geom, country_name, continent_name, pop_2015 FROM cartobq.public_account.world_population_2015 WHERE pop_2015 between @min and @max ORDER BY pop_2015 DESC`,
    queryParameters: { min: MIN_POPULATION, max: selectedMaxPopulation }
  });

  const layers = [
    new VectorTileLayer({
      id: 'world_population',
      data: source,
      opacity: 1,
      pickable: true,
      getFillColor: colorCategories({
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
      }),
      getLineColor: [0, 0, 0, 204],
      pointRadiusUnits: 'pixels',
      getPointRadius: d => (POPULATION_RADIUS_SCALE * Math.sqrt(d.properties.pop_2015)),
      lineWidthMinPixels: 1
    })
  ];

  deck.setProps({ layers });
}

let selectedMaxPopulation = MAX_POPULATION;
const selectedPopulationSelector = document.querySelector<HTMLSelectElement>('#population-slider');
const populationLabel = document.getElementById('slider-value');
populationLabel!.textContent = formatNumber(selectedMaxPopulation);

selectedPopulationSelector?.addEventListener('change', () => {
  selectedMaxPopulation = Number(selectedPopulationSelector.value);
  populationLabel!.textContent = formatNumber(selectedMaxPopulation);

  render();
});

selectedPopulationSelector!.oninput = function () {
  populationLabel!.textContent = formatNumber((this as HTMLInputElement).value);
};

// Main execution
const map = new maplibregl.Map({
  container: 'map',
  style: `https://maps.geo.us-east-1.amazonaws.com/maps/v0/maps/deck.gl-examples/style-descriptor?key=${import.meta.env.VITE_AMAZON_API_KEY}`,
  interactive: false
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [],
  getTooltip: ({ object }) => object && {
    html: `${object.properties.country_name}: ${object.properties.pop_2015}`
  }
});

deck.setProps({
  onViewStateChange: ({ viewState }) => {
    const { longitude, latitude, ...rest } = viewState;
    map.jumpTo({ center: [longitude, latitude], ...rest });
  }
});

render();
