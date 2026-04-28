/**
 * Hello World Agentic Tools — Frontend
 *
 * Minimal vanilla-JS integration:
 *   1. deck.gl + MapLibre map
 *   2. WebSocket connection to the backend agent
 *   3. Chat UI that streams the assistant's text replies
 *   4. Tool executor that applies AI-generated map changes through JSONConverter
 */

import './style.css';
import { Deck, FlyToInterpolator } from '@deck.gl/core';
import { BASEMAP } from '@deck.gl/carto';
import maplibregl from 'maplibre-gl';
import { JSONConverter } from '@deck.gl/json';
import { TOOL_NAMES } from '@carto/agentic-deckgl';

import { ScatterplotLayer } from '@deck.gl/layers';
import {
  VectorTileLayer,
  H3TileLayer,
  vectorTableSource,
  h3QuerySource,
  colorBins,
  colorCategories,
} from '@deck.gl/carto';

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
// JSONConverter — turns AI-authored JSON specs into live deck.gl layers.
// CARTO source functions are wrapped so the user-supplied access token is
// auto-injected; the AI never sees credentials.
// ============================================================================

const cartoCreds = {
  apiBaseUrl: env.apiBaseUrl,
  accessToken: env.accessToken,
  connectionName: env.connectionName,
};

const wrapSource = (sourceFn) => (config) => sourceFn({ ...config, ...cartoCreds });

const jsonConverter = new JSONConverter({
  configuration: {
    classes: { ScatterplotLayer, VectorTileLayer, H3TileLayer },
    functions: {
      vectorTableSource: wrapSource(vectorTableSource),
      h3QuerySource: wrapSource(h3QuerySource),
      colorBins: (c) => colorBins({ attr: c.attr, domain: c.domain, colors: c.colors || 'PurpOr' }),
      colorCategories: (c) => colorCategories({ attr: c.attr, domain: c.domain, colors: c.colors || 'Bold' }),
    },
  },
});

// ============================================================================
// Map state
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
    const entries = Object.entries(props).slice(0, 5);
    if (!entries.length) return null;
    return {
      html: entries.map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br/>'),
      className: 'deck-tooltip',
    };
  },
});

function renderLayers() {
  try {
    const { layers } = jsonConverter.convert({ layers: layerSpecs });
    deck.setProps({ layers: layers || [] });
  } catch (err) {
    console.error('[Render] Failed to convert layers:', err);
  }
}

// ============================================================================
// Tool executor — handles tool calls coming from the agent
// ============================================================================

const MARKERS_LAYER_ID = '__markers__';

function executeTool(toolName, data) {
  if (toolName === TOOL_NAMES.SET_DECK_STATE) {
    const parts = [];

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

    if (data.mapStyle) {
      const basemaps = {
        positron: BASEMAP.POSITRON,
        'dark-matter': BASEMAP.DARK_MATTER,
        voyager: BASEMAP.VOYAGER,
      };
      if (basemaps[data.mapStyle]) map.setStyle(basemaps[data.mapStyle]);
      parts.push('basemap');
    }

    if (data.removeLayerIds) {
      const remove = new Set(data.removeLayerIds);
      layerSpecs = layerSpecs.filter((l) => !remove.has(l.id));
    }

    if (Array.isArray(data.layers)) {
      if (data.layers.length === 0) {
        layerSpecs = [];
      } else {
        // Update layers by id, append new ones
        for (const incoming of data.layers) {
          const idx = layerSpecs.findIndex((l) => l.id === incoming.id);
          if (idx >= 0) layerSpecs[idx] = { ...layerSpecs[idx], ...incoming };
          else layerSpecs.push(incoming);
        }
      }
      parts.push(`${layerSpecs.length} layer(s)`);
    }

    renderLayers();
    return { success: true, message: `Updated: ${parts.join(', ')}` };
  }

  if (toolName === TOOL_NAMES.SET_MARKER) {
    const { latitude, longitude, action = 'add' } = data;

    if (action === 'clear-all') {
      layerSpecs = layerSpecs.filter((l) => l.id !== MARKERS_LAYER_ID);
      renderLayers();
      return { success: true, message: 'Markers cleared' };
    }

    let markerLayer = layerSpecs.find((l) => l.id === MARKERS_LAYER_ID);
    if (!markerLayer) {
      markerLayer = {
        '@@type': 'ScatterplotLayer',
        id: MARKERS_LAYER_ID,
        data: [],
        getPosition: '@@=coordinates',
        getFillColor: [51, 51, 51, 220],
        getLineColor: [255, 255, 255, 200],
        stroked: true,
        lineWidthMinPixels: 2,
        radiusMinPixels: 6,
        radiusMaxPixels: 6,
      };
      layerSpecs.push(markerLayer);
    }

    markerLayer.data = [...markerLayer.data, { coordinates: [longitude, latitude] }];
    renderLayers();
    return { success: true, message: `Marker placed at [${latitude}, ${longitude}]` };
  }

  return { success: false, message: `Unsupported tool: ${toolName}` };
}

// ============================================================================
// Chat UI
// ============================================================================

const messagesEl = document.getElementById('chat-messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const statusEl = document.getElementById('chat-status');
const metaEl = document.getElementById('chat-meta');

let loaderEl = null;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

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
let streamingEl = null;
let streamBuffer = '';

// Layers the AI authored, excluding internal helpers (markers, etc.)
const userLayers = () =>
  layerSpecs
    .filter((l) => !l.id?.startsWith('__'))
    .map((l) => ({ id: l.id, type: l['@@type'] || 'Unknown', visible: l.visible !== false }));

function connectWs() {
  ws = new WebSocket(env.wsUrl);

  ws.onopen = () => {
    setStatus('');
    console.log('[WS] Connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'session_info':
        if (metaEl) metaEl.textContent = `model: ${data.model}`;
        break;

      case 'stream_chunk': {
        hideLoader();
        if (data.isComplete && !data.content) {
          streamingEl = null;
          streamBuffer = '';
          break;
        }
        streamBuffer += data.content || '';
        if (!streamingEl) streamingEl = addMessage('assistant', streamBuffer);
        else streamingEl.textContent = streamBuffer;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      }

      case 'tool_call': {
        const result = executeTool(data.toolName, data.data);
        addMessage('tool', `${data.toolName}: ${result.message}`);
        ws.send(
          JSON.stringify({
            type: 'tool_result',
            toolName: data.toolName,
            callId: data.callId,
            success: result.success,
            message: result.message,
            layerState: userLayers(),
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
    setStatus('Disconnected — retrying…');
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
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addMessage('error', 'Not connected to backend yet — try again in a moment.');
    return;
  }

  addMessage('user', text);
  inputEl.value = '';
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
        layers: userLayers(),
      },
    })
  );
});
