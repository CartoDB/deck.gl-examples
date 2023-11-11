import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import {Deck} from '@deck.gl/core';
import {TripsLayer} from '@deck.gl/geo-layers';
import {BASEMAP} from '@deck.gl/carto';
import {query} from '@deck.gl/carto';

const LOOP_LENGTH = 1800;
const ANIMATION_SPEED = 0.4;

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
      latitude: 40.73,
      zoom: 12,
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
    accessToken: import.meta.env.VITE_API_ACCESS_TOKEN,
    connectionName: import.meta.env.VITE_API_CONNECTION_NAME,
    sqlQuery:
      'SELECT geom, vendor, TO_JSON_STRING(timestamps) AS timestamps FROM cartobq.public_account.new_york_trips',
    
  });

  // TripsLayer needs data in the following format
  const layerData = data.rows.map((f) => ({
    vendor: f.vendor,
    timestamps: JSON.parse(f.timestamps),
    path: f.geom.coordinates
  }));

  let time = 0;

  function animate() {
    time = (time + ANIMATION_SPEED) % LOOP_LENGTH;
    window.requestAnimationFrame(animate);
  }
  
  setInterval(() => {
    deck.setProps({
      layers: [
        new TripsLayer({
          id: 'trips-layer',
          data: layerData,
          getPath: d => d.path,
          getTimestamps: d => d.timestamps,
          getColor: d => (d.vendor === 0 ? [253, 128, 93] : [23, 184, 190]),
          opacity: 0.3,
          widthMinPixels: 2,
          jointRounded: true,
          trailLength: 180,
          currentTime: time,
          shadowEnabled: false
        })
      ]
    });
  }, 50);

  window.requestAnimationFrame(animate);
}

initialize();
