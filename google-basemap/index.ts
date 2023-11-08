import './style.css';
import {GoogleMapsOverlay as DeckOverlay} from '@deck.gl/google-maps';
import {colorCategories} from '@deck.gl/carto';
import {VectorTileLayer, vectorQuerySource} from '@deck.gl/carto';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_MAP_ID = '';
const GOOGLE_MAPS_API_URL = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=beta&map_ids=${GOOGLE_MAP_ID}`;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = import.meta.env.VITE_API_CONNECTION_NAME;
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

let map = null;
let overlay = null;

function loadScript(url) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = url;
  const head = document.querySelector('head');
  // @ts-ignore
  head.appendChild(script);
  return new Promise(resolve => {
    script.onload = resolve;
  });
}

function setTooltip({x, y, object}) {
  const tooltip = document.getElementById('tooltip');
  if (object && tooltip) {
    tooltip.style.display = 'block';
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.innerHTML = `Continent: ${object.properties.continent_name}</br>Country: ${object.properties.country_name}</br>Population: ${object.properties.pop_2015}`;
    console.log(x, y, object);
  } else if (tooltip) {
    tooltip.style.display = 'none';
  }
}

const SQL_QUERY = `SELECT geom, country_name, continent_name, pop_2015 FROM cartobq.public_account.world_population_2015 WHERE CAST(pop_2015 as INT64) between CAST(@min as INT64) and CAST(@max as INT64) ORDER BY pop_2015 DESC`;

function getColorConfiguration() {
  return colorCategories({
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
}

function getPointRadius(d) {
  return (30.0 * Math.sqrt(d.properties.pop_2015)) / 27620.2642999664;
}

function render() {
  const source = vectorQuerySource({
    ...cartoConfig,
    sqlQuery: SQL_QUERY,
    queryParameters: {
      min: Number(1),
      max: selectedMaxPopulation
    }
  });

  const layers = [
    new VectorTileLayer({
      id: 'accidents_by_state',
      data: source,
      opacity: 1,
      pickable: true,
      getFillColor: getColorConfiguration(),
      getLineColor: [0, 0, 0, 204],
      pointRadiusUnits: 'pixels',
      getPointRadius: getPointRadius,
      lineWidthMinPixels: 1,
      onHover: setTooltip
    })
  ];

  if (overlay) {
    // @ts-ignore
    overlay.setProps({
      layers: layers
    });
  }
}

let selectedMaxPopulation = 800000000;
const selectedPopulationSelector = document.querySelector<HTMLSelectElement>('#population-slider');
const populationLabel = document.getElementById('slider-value');

selectedPopulationSelector?.addEventListener('change', () => {
  selectedMaxPopulation = Number(selectedPopulationSelector.value);
  if (populationLabel) {
    populationLabel.textContent = selectedMaxPopulation.toString();
  }
  render();
});

if (selectedPopulationSelector) {
  selectedPopulationSelector.oninput = function () {
    if (populationLabel) {
      populationLabel.textContent = (this as HTMLInputElement).value;
    }
  };
}

function initializeGoogleMaps() {
  loadScript(GOOGLE_MAPS_API_URL).then(() => {
    map = new google.maps.Map(document.getElementById('map'), {
      center: {lat: 15, lng: 10},
      zoom: 3,
      mapId: GOOGLE_MAP_ID
    });

    overlay = new DeckOverlay({
      layers: []
    });
    // @ts-ignore
    overlay.setMap(map);

    render();
  });
}

initializeGoogleMaps();