import maplibregl from 'maplibre-gl';
import { Deck } from '@deck.gl/core/typed';
import {
  BASEMAP,
  CartoLayer,
  setDefaultCredentials,
  MAP_TYPES,
} from '@deck.gl/carto/typed';

import { Layer } from '@deck.gl/core/typed';

const apiBaseUrl = 'https://gcp-us-east1.api.carto.com';
const accessToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfN3hoZnd5bWwiLCJqdGkiOiI3ZDVmYjMwMiJ9.ySr1HanHcYklesFUIqDJfxoaeB8bpGrR3QcImrxmXEk';
setDefaultCredentials({ apiBaseUrl, accessToken });

export function createMap(layers: Layer[]) {
  debugger;
  const INITIAL_VIEW_STATE = {
    latitude: 39.8097343,
    longitude: -98.5556199,
    zoom: 4,
    bearing: 0,
    pitch: 30,
  };

  const deck = new Deck({
    canvas: 'deck-canvas',
    initialViewState: INITIAL_VIEW_STATE,
    controller: true,
    layers,
  });

  // Add basemap
  const map = new maplibregl.Map({
    container: 'map',
    style: BASEMAP.VOYAGER,
    interactive: false,
  });
  deck.setProps({
    onViewStateChange: ({ viewState }) => {
      const { longitude, latitude, ...rest } = viewState;
      map.jumpTo({ center: [longitude, latitude], ...rest });
    },
  });
}
