/**
 * Hello World Agentic Tools — Frontend
 *
 * Minimal vanilla JS integration:
 *   1. deck.gl + MapLibre map
 *   2. WebSocket connection to the backend
 *   3. Chat UI that sends messages and renders streamed responses
 *   4. Tool executor that applies AI-generated map changes via JSONConverter
 */

import './style.css';
import { Deck } from '@deck.gl/core';
import { BASEMAP } from '@deck.gl/carto';
import maplibregl from 'maplibre-gl';
import { JSONConverter } from '@deck.gl/json';
import { TOOL_NAMES } from '@carto/agentic-deckgl';

// deck.gl layer + source imports for JSONConverter registration
import {
  GeoJsonLayer,
  ScatterplotLayer,
  IconLayer,
  ArcLayer,
  LineLayer,
  PolygonLayer,
  TextLayer,
  PathLayer,
  PointCloudLayer,
} from '@deck.gl/layers';
import {
  VectorTileLayer,
  H3TileLayer,
  QuadbinTileLayer,
  vectorTableSource,
  vectorQuerySource,
  h3TableSource,
  h3QuerySource,
  quadbinTableSource,
  quadbinQuerySource,
  colorBins,
  colorCategories,
  colorContinuous,
} from '@deck.gl/carto';
import { FlyToInterpolator } from '@deck.gl/core';
import { MaskExtension } from '@deck.gl/extensions';

// ============================================================================
// Environment
// ============================================================================

const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'https://gcp-us-east1.api.carto.com',
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN || '',
  connectionName: import.meta.env.VITE_CONNECTION_NAME || 'carto_dw',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3003/ws',
};

// ============================================================================
// JSONConverter — translates JSON specs from the AI into live deck.gl layers
// ============================================================================

function getCartoCredentials() {
  return {
    apiBaseUrl: env.apiBaseUrl,
    accessToken: env.accessToken,
    connectionName: env.connectionName,
  };
}

/** Wrap a CARTO source function so credentials are auto-injected */
function wrapSource(sourceFn) {
  return (config) => {
    const creds = getCartoCredentials();
    return sourceFn({
      apiBaseUrl: config.apiBaseUrl || creds.apiBaseUrl,
      accessToken: config.accessToken || creds.accessToken,
      connectionName: config.connectionName || creds.connectionName,
      ...config,
    });
  };
}

const jsonConverter = new JSONConverter({
  configuration: {
    classes: {
      GeoJsonLayer,
      ScatterplotLayer,
      IconLayer,
      ArcLayer,
      LineLayer,
      PolygonLayer,
      TextLayer,
      PathLayer,
      PointCloudLayer,
      VectorTileLayer,
      H3TileLayer,
      QuadbinTileLayer,
      FlyToInterpolator,
    },
    constants: {
      FlyToInterpolator: new FlyToInterpolator(),
    },
    functions: {
      vectorTableSource: wrapSource(vectorTableSource),
      vectorQuerySource: wrapSource(vectorQuerySource),
      h3TableSource: wrapSource(h3TableSource),
      h3QuerySource: wrapSource(h3QuerySource),
      quadbinTableSource: wrapSource(quadbinTableSource),
      quadbinQuerySource: wrapSource(quadbinQuerySource),
      colorBins: (c) => colorBins({ attr: c.attr, domain: c.domain, colors: c.colors || 'PurpOr' }),
      colorCategories: (c) => colorCategories({ attr: c.attr, domain: c.domain, colors: c.colors || 'Bold' }),
      colorContinuous: (c) => colorContinuous({ attr: c.attr, domain: c.domain, colors: c.colors || 'Sunset' }),
    },
    enumerations: {},
  },
});

// ============================================================================
// Map State
// ============================================================================

const INITIAL_VIEW_STATE = {
  latitude: 39.8097343,
  longitude: -98.5556199,
  zoom: 4,
  bearing: 0,
  pitch: 0,
};

let currentViewState = { ...INITIAL_VIEW_STATE };
let layerSpecs = []; // raw JSON layer specs from the AI
let maskGeometry = null; // GeoJSON geometry for MaskExtension clipping

// ============================================================================
// deck.gl + MapLibre
// ============================================================================

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.POSITRON,
  interactive: false,
  center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
  zoom: INITIAL_VIEW_STATE.zoom,
});

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  layers: [],
  onViewStateChange: ({ viewState }) => {
    currentViewState = viewState;
    map.jumpTo({
      center: [viewState.longitude, viewState.latitude],
      zoom: viewState.zoom,
      bearing: viewState.bearing,
      pitch: viewState.pitch,
    });
  },
  getTooltip: ({ object }) => {
    if (!object) return null;
    const props = object.properties || object;
    const entries = Object.entries(props)
      .filter(([k]) => !['geom', 'geometry', 'the_geom', 'cartodb_id', 'id'].includes(k))
      .slice(0, 5);
    if (!entries.length) return null;
    return {
      html: entries.map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br/>'),
      className: 'deck-tooltip',
    };
  },
});

const MASK_ID = '__mask__';
const maskExtension = new MaskExtension();

/** Re-render layers from the current layerSpecs through JSONConverter */
function renderLayers() {
  try {
    const specsWithCreds = layerSpecs.map((layer) => {
      const l = JSON.parse(JSON.stringify(layer));
      if (l.data && typeof l.data === 'object' && l.data['@@function']) {
        l.data.accessToken = env.accessToken;
        l.data.apiBaseUrl = env.apiBaseUrl;
        l.data.connectionName = env.connectionName;
      }
      return l;
    });

    const converted = jsonConverter.convert({ layers: specsWithCreds });
    let layers = converted.layers || [];

    // If mask is active, inject MaskExtension on data layers and add mask GeoJsonLayer
    if (maskGeometry) {
      layers = layers.map((l) =>
        l.clone({
          extensions: [...(l.props.extensions || []), maskExtension],
          maskId: MASK_ID,
        })
      );

      const geojson = maskGeometry.type === 'Feature' || maskGeometry.type === 'FeatureCollection'
        ? maskGeometry
        : { type: 'Feature', geometry: maskGeometry, properties: {} };

      layers.push(
        new GeoJsonLayer({
          id: MASK_ID,
          data: geojson,
          operation: 'mask',
        })
      );
    }

    deck.setProps({ layers });
  } catch (err) {
    console.error('[Render] Failed to convert layers:', err);
  }
}

// ============================================================================
// Tool Executor — handles set-deck-state tool calls from the AI
// ============================================================================

function executeTool(toolName, data) {
  if (toolName === TOOL_NAMES.SET_DECK_STATE) {
    const parts = [];

    // View state
    if (data.initialViewState) {
      const vs = data.initialViewState;
      currentViewState = { ...currentViewState, ...vs };
      deck.setProps({
        initialViewState: {
          ...currentViewState,
          transitionDuration: vs.transitionDuration || 1000,
          transitionInterpolator: new FlyToInterpolator(),
        },
      });
      parts.push('viewState');
    }

    // Basemap
    if (data.mapStyle) {
      const basemaps = {
        positron: BASEMAP.POSITRON,
        'dark-matter': BASEMAP.DARK_MATTER,
        voyager: BASEMAP.VOYAGER,
      };
      if (basemaps[data.mapStyle]) map.setStyle(basemaps[data.mapStyle]);
      parts.push('basemap');
    }

    // Layers
    if (data.removeLayerIds) {
      const remove = new Set(data.removeLayerIds);
      layerSpecs = layerSpecs.filter((l) => !remove.has(l.id));
    }

    if (Array.isArray(data.layers)) {
      if (data.layers.length === 0) {
        layerSpecs = [];
      } else {
        // Merge: update existing layers by id, append new ones
        for (const incoming of data.layers) {
          const idx = layerSpecs.findIndex((l) => l.id === incoming.id);
          if (idx >= 0) {
            layerSpecs[idx] = { ...layerSpecs[idx], ...incoming };
          } else {
            layerSpecs.push(incoming);
          }
        }
      }
      parts.push(`${layerSpecs.length} layer(s)`);
    }

    renderLayers();
    return { success: true, message: `Updated: ${parts.join(', ')}` };
  }

  if (toolName === TOOL_NAMES.SET_MARKER) {
    // Minimal marker support — add a ScatterplotLayer dot
    const { latitude, longitude, action = 'add' } = data;

    if (action === 'clear-all') {
      layerSpecs = layerSpecs.filter((l) => l.id !== '__markers__');
      renderLayers();
      return { success: true, message: 'Markers cleared' };
    }

    let markerLayer = layerSpecs.find((l) => l.id === '__markers__');
    if (!markerLayer) {
      markerLayer = {
        '@@type': 'ScatterplotLayer',
        id: '__markers__',
        data: [],
        getPosition: '@@=coordinates',
        getFillColor: [51, 51, 51, 220],
        getLineColor: [255, 255, 255, 200],
        stroked: true,
        lineWidthMinPixels: 2,
        radiusMinPixels: 6,
        radiusMaxPixels: 6,
        pickable: false,
      };
      layerSpecs.push(markerLayer);
    }

    if (action === 'remove') {
      markerLayer.data = markerLayer.data.filter(
        (d) => Math.abs(d.coordinates[0] - longitude) > 0.00001 || Math.abs(d.coordinates[1] - latitude) > 0.00001
      );
    } else {
      markerLayer.data.push({ coordinates: [longitude, latitude] });
    }

    renderLayers();
    return { success: true, message: `Marker ${action} at [${latitude}, ${longitude}]` };
  }

  if (toolName === TOOL_NAMES.SET_MASK_LAYER) {
    const { action, geometry } = data;

    if (action === 'set' && geometry) {
      maskGeometry = geometry;
      renderLayers();
      return { success: true, message: 'Mask applied — layers clipped to area' };
    }

    if (action === 'clear') {
      maskGeometry = null;
      renderLayers();
      return { success: true, message: 'Mask cleared' };
    }

    if (action === 'enable-draw') {
      return { success: false, message: 'Draw mode not supported in hello-world example' };
    }

    return { success: false, message: `Unknown mask action: ${action}` };
  }

  return { success: false, message: `Unknown tool: ${toolName}` };
}

// ============================================================================
// Chat UI
// ============================================================================

const messagesEl = document.getElementById('chat-messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');

let loaderEl = null;

function showLoader() {
  if (loaderEl) return;
  loaderEl = document.createElement('div');
  loaderEl.className = 'msg loader';
  loaderEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  messagesEl.appendChild(loaderEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideLoader() {
  if (loaderEl) {
    loaderEl.remove();
    loaderEl = null;
  }
}

function addMessage(type, text) {
  hideLoader();
  const el = document.createElement('div');
  el.className = `msg ${type}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

// ============================================================================
// WebSocket
// ============================================================================

let ws = null;
let streamingEl = null; // element currently being streamed into
let streamBuffer = '';   // accumulated text for current streaming message

function connectWs() {
  ws = new WebSocket(env.wsUrl);

  ws.onopen = () => console.log('[WS] Connected');

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'stream_chunk': {
        hideLoader();
        if (data.isComplete && !data.content) {
          // Stream finished
          if (streamingEl) streamingEl = null;
          streamBuffer = '';
          break;
        }
        streamBuffer += data.content || '';
        if (!streamingEl) {
          streamingEl = addMessage('assistant', streamBuffer);
        } else {
          streamingEl.textContent = streamBuffer;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
        break;
      }

      case 'tool_call': {
        const result = executeTool(data.toolName, data.data);
        addMessage('tool', `${data.toolName}: ${result.message}`);

        // Send result back to backend
        ws.send(
          JSON.stringify({
            type: 'tool_result',
            toolName: data.toolName,
            callId: data.callId,
            success: result.success,
            message: result.message,
            layerState: layerSpecs
              .filter((l) => !l.id?.startsWith('__'))
              .map((l) => ({ id: l.id, type: l['@@type'] || 'Unknown', visible: l.visible !== false })),
          })
        );
        break;
      }

      case 'error':
        hideLoader();
        addMessage('error', data.content);
        break;
    }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting in 3s...');
    setTimeout(connectWs, 3000);
  };

  ws.onerror = (err) => console.error('[WS] Error:', err);
}

connectWs();

// ============================================================================
// Send messages
// ============================================================================

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  addMessage('user', text);
  inputEl.value = '';

  // Reset streaming state and show loader
  streamingEl = null;
  streamBuffer = '';
  showLoader();

  ws.send(
    JSON.stringify({
      type: 'chat_message',
      content: text,
      timestamp: Date.now(),
      initialState: {
        viewState: {
          longitude: currentViewState.longitude,
          latitude: currentViewState.latitude,
          zoom: currentViewState.zoom,
          pitch: currentViewState.pitch || 0,
          bearing: currentViewState.bearing || 0,
        },
        layers: layerSpecs
          .filter((l) => !l.id?.startsWith('__'))
          .map((l) => ({
            id: l.id,
            type: l['@@type'] || 'Unknown',
            visible: l.visible !== false,
          })),
      },
    })
  );
});
