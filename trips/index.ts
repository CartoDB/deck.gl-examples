import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck} from '@deck.gl/core';
import {TripsLayer} from '@deck.gl/geo-layers';
import {PolygonLayer} from '@deck.gl/layers';
import {BASEMAP} from '@deck.gl/carto';
import {query} from '@deck.gl/carto';
import {AmbientLight, PointLight, LightingEffect} from '@deck.gl/core';

const LOOP_LENGTH = 1800;
const ANIMATION_SPEED = 0.4;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0
});

const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000]
});

const lightingEffect = new LightingEffect({ambientLight, pointLight});

const material = {
  ambient: 0.1,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [60, 64, 70]
};

const DEFAULT_THEME = {
  buildingColor: [74, 80, 87],
  trailColor0: [253, 128, 93],
  trailColor1: [23, 184, 190],
  material,
  effects: [lightingEffect]
};

const landCover = [
  [
    [-74.0, 40.7],
    [-74.02, 40.7],
    [-74.02, 40.72],
    [-74.0, 40.72]
  ]
];

async function initialize() {
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP.DARK_MATTER,
    interactive: false
  });

  const deck = new Deck({
    canvas: 'deck-canvas',
    initialViewState: {
      longitude: -74,
      latitude: 40.72,
      zoom: 13,
      pitch: 45,
      bearing: 0
    },
    controller: true
  });

  deck.setProps({
    onViewStateChange: ({viewState}) => {
      const {longitude, latitude, ...rest} = viewState;
      map.jumpTo({center: [longitude, latitude], ...rest});
    }
  });

  const data = await query({
    ...cartoConfig,
    sqlQuery:
      'SELECT geom, vendor, TO_JSON_STRING(timestamps) AS timestamps FROM cartobq.public_account.new_york_trips'
  });

  const buildings = await query({
    ...cartoConfig,
    sqlQuery: `SELECT geom, numfloors 
      FROM carto-demo-data.demo_tables.manhattan_pluto_data 
        WHERE geom is not null 
        AND numfloors > 0`
  });

  // TripsLayer needs data in the following format
  const layerData = data.rows.map(f => ({
    vendor: f.vendor,
    timestamps: JSON.parse(f.timestamps),
    path: f.geom.coordinates
  }));

  const buildingData = buildings.rows
    .filter(
      building =>
        building.geom.coordinates !== undefined &&
        // The PolygonLayer does not support MultiPolygon
        building.geom.coordinates.length === 1
    )
    .map(f => ({
      polygon: f.geom.coordinates,
      height: f.numfloors
    }));

  let time = 0;

  function animate() {
    time = (time + ANIMATION_SPEED) % LOOP_LENGTH;
    window.requestAnimationFrame(animate);
  }

  setInterval(() => {
    deck.setProps({
      effects: DEFAULT_THEME.effects,
      layers: [
        // This is only needed when using shadow effects
        new PolygonLayer({
          id: 'ground',
          data: landCover,
          getPolygon: f => f,
          stroked: false,
          getFillColor: [0, 0, 0, 0]
        }),
        new TripsLayer({
          id: 'trips-layer',
          data: layerData,
          getPath: d => d.path,
          getTimestamps: d => d.timestamps,
          getColor: d => (d.vendor === 0 ? DEFAULT_THEME.trailColor0 : DEFAULT_THEME.trailColor1),
          opacity: 0.3,
          widthMinPixels: 2,
          jointRounded: true,
          trailLength: 180,
          currentTime: time,
          shadowEnabled: false
        }),
        new PolygonLayer({
          id: 'buildings',
          data: buildingData,
          extruded: true,
          wireframe: false,
          opacity: 0.5,
          getPolygon: f => f.polygon,
          getElevation: f => f.height * 4,
          getFillColor: DEFAULT_THEME.buildingColor as any,
          material: DEFAULT_THEME.material as any
        })
      ]
    });
  }, 50);

  window.requestAnimationFrame(animate);
}

initialize();
