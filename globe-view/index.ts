import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {query} from '@deck.gl/carto';
import {GeoJsonLayer} from '@deck.gl/layers'
import {SimpleMeshLayer} from '@deck.gl/mesh-layers'
import AnimatedArcLayer from './AnimatedArcLayer';
import {SphereGeometry} from '@luma.gl/engine';
import {
  COORDINATE_SYSTEM,
  _GlobeView as GlobeView,
  LightingEffect,
  AmbientLight,
  _SunLight as SunLight
} from '@deck.gl/core';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 0
};

const TIME_WINDOW = 900; // 15 minutes
const EARTH_RADIUS_METERS = 6.3e6;
const MIN_TIME = 5;
const MAX_TIME = 103289;
const SEC_PER_DAY = 60 * 60 * 24;

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 0.5
});

const sunLight = new SunLight({
  color: [255, 255, 255],
  intensity: 2.0,
  timestamp: 0
});

// create lighting effect with light sources
const lightingEffect = new LightingEffect({ ambientLight, sunLight });

// Look up the real date time from our artifical timestamp
function getDate(t) {
  const timestamp =
    new Date("2020-01-14T00:00:00Z").getTime() + (t % SEC_PER_DAY) * 1000;
  return new Date(timestamp);
}

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  views: new GlobeView(),
  effects: [lightingEffect],
  layers: []
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style:  {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#000" }
      }
    ]
  },
  interactive: false
});

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});

async function initialize() {
  // Fetch Data from CARTO
  const flightsSource = await query({
    ...cartoConfig,
    sqlQuery: `SELECT time1, time2, lat1, lat2, lon1, lon2, alt1, alt2 FROM cartobq.public_account.animated_deckgl_layer_flights`
  });

  // const flightsSource = await query({
  //   ...cartoConfig,
  //   sqlQuery: `SELECT time1, time2, lat1, lat2, lon1, lon2, alt1, alt2 FROM cartobq.public_account.animated_deckgl_layer_flights`
  // });

  const worldLandQuery = "SELECT the_geom FROM ne_50m_land_world";
  const worldLandUrl = `https://public.carto.com/api/v2/sql?q=${worldLandQuery}&format=geojson`;
  const geoJsonWorldLandData = await fetch(worldLandUrl).then((response) =>
    response.json()
  );

  const backgroundLayers = [
    new SimpleMeshLayer({
      id: "earth-sphere",
      data: [0],
      mesh: new SphereGeometry({radius: EARTH_RADIUS_METERS, nlat: 18, nlong: 36}),
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: [0, 0, 0],
      getColor: [255, 255, 255]
    }),
    new GeoJsonLayer({
      id: "earth-land-layer",
      data: geoJsonWorldLandData.features,
      stroked: false,
      filled: true,
      opacity: 0.1,
      getFillColor: [30, 80, 120]
    })
  ];

  let currentTime = 0;

  setInterval(() => {
    deck.setProps({
      layers: [
        ...backgroundLayers,
        new AnimatedArcLayer({
          id: "flights-layer",
          data: flightsSource.rows,
          visible:
            MIN_TIME < currentTime && MAX_TIME > currentTime + TIME_WINDOW,
          getSourcePosition: (d) => [d.lon1, d.lat1, d.alt1],
          getTargetPosition: (d) => [d.lon2, d.lat2, d.alt2],
          getSourceTimestamp: (d) => d.time1,
          getTargetTimestamp: (d) => d.time2,
          getHeight: 0.5,
          getWidth: 1,
          timeRange: [currentTime, currentTime + TIME_WINDOW],
          getSourceColor: [255, 0, 128],
          getTargetColor: [0, 128, 255]
        })
      ]
    });

    currentTime = currentTime + 300;

    if (currentTime >= MAX_TIME) {
      currentTime = 0;
    }

    sunLight.timestamp = getDate(currentTime).getTime();
  }, 50);
}

initialize();