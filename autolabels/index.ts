import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck, FlyToInterpolator} from '@deck.gl/core';
import {BASEMAP, vectorTableSource, VectorTileLayer, colorBins, colorCategories} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const VIEW_STATES = {
  polygons: {
    latitude: 39.8097343,
    longitude: -98.5556199,
    zoom: 4,
    bearing: 0,
    pitch: 0
  },
  lines: {
    latitude: 51.4545,
    longitude: -2.5879,
    zoom: 11,
    bearing: 0,
    pitch: 0
  }
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: VIEW_STATES.polygons,
  controller: true
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

function renderPolygonsExample() {
  const dataSource = vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.usa_counties'
  });

  const layers = [
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
  ];

  deck.setProps({
    layers,
    getTooltip: ({ object }) =>
      object && {
        html: `
          <strong>County</strong>: ${object.properties.name}<br/>
          <strong>Population</strong>: ${object.properties.total_pop?.toLocaleString() || 'N/A'}
        `
      }
  });

  // Update description
  const descriptionEl = document.querySelector('#description');
  if (descriptionEl) {
    descriptionEl.textContent = 'The map displays US counties with labels showing county names, styled with population-based colors. Labels are automatically positioned and include collision detection to maintain readability.';
  }
}

function renderLinesExample() {
  const dataSource = vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.bristol_cycle_network'
  });

  const layers = [
    new VectorTileLayer({
      id: 'cycle-network',
      pickable: true,
      data: dataSource,
      autoLabels: true,
      getText: f => f.properties.route_name,
      pointType: 'text',
      textSizeScale: 14,
      getTextColor: [0, 0, 0, 255],
      textOutlineColor: [255, 255, 255, 255],
      textOutlineWidth: 7,
      textFontSettings: {
        sdf: true,
      },
      getLineColor: colorCategories({
        attr: 'r_status',
        domain: ['Existing', 'Aspirational', 'Proposed', 'Planned'],
        colors: 'Bold'
      }),
      lineWidthMinPixels: 3,
      opacity: 0.9
    })
  ];

  deck.setProps({
    layers,
    getTooltip: ({ object }) =>
      object && {
        html: `
          <strong>Route</strong>: ${object.properties.route_name || 'Unnamed'}<br/>
          <strong>Status</strong>: ${object.properties.r_status || 'N/A'}
        `
      }
  });

  // Update description
  const descriptionEl = document.querySelector('#description');
  if (descriptionEl) {
    descriptionEl.textContent = 'The map displays Bristol\'s cycle network with labels showing route names, styled by status (Existing, Aspirational, Proposed, Planned). Labels are automatically positioned along routes with collision detection.';
  }
}

function switchExample(exampleType: string) {
  const viewState = VIEW_STATES[exampleType];

  deck.setProps({
    initialViewState: {
      ...viewState,
      transitionDuration: 2000,
      transitionInterpolator: new FlyToInterpolator()
    }
  });

  if (exampleType === 'polygons') {
    renderPolygonsExample();
  } else if (exampleType === 'lines') {
    renderLinesExample();
  }
}

// Initialize with polygons example
renderPolygonsExample();

// Setup dropdown listener
const selector = document.querySelector<HTMLSelectElement>('#example-selector');
selector?.addEventListener('change', () => {
  switchExample(selector.value);
});
