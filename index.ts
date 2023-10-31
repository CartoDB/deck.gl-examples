import './style.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createMap } from './map';
import layerRoutes from './layers';

const path = window.location.pathname.substring(1) || 'hello-world';
const layers = layerRoutes[path]();

const route = (document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="map"></div>
  <canvas id="deck-canvas"></canvas>
`);

createMap(layers);
