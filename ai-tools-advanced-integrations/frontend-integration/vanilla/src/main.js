/**
 * Main application bootstrap
 * Wires all services, state, and UI components together.
 */

import './styles/main.css';

import { environment } from './config/environment.js';
import { DeckState } from './state/deck-state.js';
import { WebSocketClient } from './services/websocket.js';
import { ToolExecutor } from './services/tool-executor.js';
import { DeckMapManager } from './services/deck-map.js';
import { MapAIToolsOrchestrator } from './services/agentic-deckgl.js';
import { ChatUI } from './components/chat-ui.js';
import { LayerToggle } from './components/layer-toggle.js';
import { ZoomControls } from './components/zoom-controls.js';
import { Snackbar } from './components/snackbar.js';
import { ConfirmationDialog } from './components/confirmation-dialog.js';
import { DrawTool } from './components/draw-tool.js';
import { MaskLayerManager } from './services/mask-layer.js';
import { WidgetManager } from './services/widget-manager.js';
import { WidgetContainer } from './components/widget-container.js';
import { TOOL_NAMES } from '@carto/agentic-deckgl';

// ==================== STATE ====================

const deckState = new DeckState();
const maskLayerManager = new MaskLayerManager();
const widgetManager = new WidgetManager(maskLayerManager);

// ==================== SERVICES ====================

const wsClient = new WebSocketClient();
const toolExecutor = new ToolExecutor(deckState, maskLayerManager, widgetManager);
const deckMapManager = new DeckMapManager(deckState, environment, maskLayerManager);
const orchestrator = new MapAIToolsOrchestrator(wsClient, toolExecutor, deckState, environment);

// ==================== UI STATE ====================

let isMobileViewport = window.innerWidth <= 768;
let sidebarState = 'closed'; // 'closed' | 'open' | 'collapsed' | 'half' | 'full'
let isSidebarOpen = true;
let zoomLevel = 3;
let mapInitialized = false;

// ==================== UI COMPONENTS ====================

const snackbar = new Snackbar(document.getElementById('snackbar-container'));
const confirmationDialog = new ConfirmationDialog(document.getElementById('dialog-container'));

const chatUI = new ChatUI(document.getElementById('sidebar-column'), {
  onSendMessage: (content) => orchestrator.sendMessage(content),
  onClearChat: (clearLayers) => {
    orchestrator.clearMessages();
    if (clearLayers) {
      deckState.clearChatGeneratedLayers();
      widgetManager.clearWidgets();
    }
  },
  onSidebarStateChange: (state) => {
    sidebarState = state;
    updateLayout();
  },
  onCloseSidebar: () => toggleSidebar(),
  confirmationDialog,
});

const layerToggle = new LayerToggle(document.getElementById('layer-toggle-wrapper'), {
  onToggle: (event) => {
    const currentLayers = deckState.getLayers();
    const updatedLayers = currentLayers.map((layer) => {
      if (layer['id'] === event.layerId) {
        return { ...layer, visible: event.visible };
      }
      return layer;
    });
    deckState.setLayers(updatedLayers);
  },
  onFlyTo: (event) => {
    const layers = orchestrator.getLayerConfigs();
    const layer = layers.find((l) => l.id === event.layerId);
    if (layer?.center) {
      deckState.setInitialViewState({
        latitude: layer.center.latitude,
        longitude: layer.center.longitude,
        zoom: layer.center.zoom ?? 12,
        pitch: 0,
        bearing: 0,
      });
    }
  },
});

const zoomControls = new ZoomControls(document.getElementById('zoom-controls-wrapper'), {
  onZoomIn: async () => {
    const currentView = deckState.getViewState();
    const newZoom = Math.min(22, (currentView.zoom ?? 3) + 1);
    await toolExecutor.execute(TOOL_NAMES.SET_DECK_STATE, {
      initialViewState: {
        latitude: currentView.latitude,
        longitude: currentView.longitude,
        zoom: newZoom,
        pitch: currentView.pitch ?? 0,
        bearing: currentView.bearing ?? 0,
      },
    });
  },
  onZoomOut: async () => {
    const currentView = deckState.getViewState();
    const newZoom = Math.max(0, (currentView.zoom ?? 3) - 1);
    await toolExecutor.execute(TOOL_NAMES.SET_DECK_STATE, {
      initialViewState: {
        latitude: currentView.latitude,
        longitude: currentView.longitude,
        zoom: newZoom,
        pitch: currentView.pitch ?? 0,
        bearing: currentView.bearing ?? 0,
      },
    });
  },
});

new DrawTool(document.getElementById('draw-tool-wrapper'), maskLayerManager);

const widgetContainer = new WidgetContainer(document.getElementById('widget-container-wrapper'), {
  onRemove: (id) => widgetManager.removeWidget(id),
});

// ==================== FAB BUTTON ====================

const fabButton = document.getElementById('fab-button');
fabButton.addEventListener('click', () => toggleSidebar());

// ==================== EVENT SUBSCRIPTIONS ====================

orchestrator.on('connected', (isConnected) => {
  chatUI.setConnected(isConnected);
  updateControlsState();
});

orchestrator.on('messages', (messages) => {
  chatUI.setMessages(messages);
});

orchestrator.on('loaderState', ({ state }) => {
  chatUI.setLoaderState(state);
});

orchestrator.on('error', (errorMsg) => {
  snackbar.show(errorMsg, 'error');
});

orchestrator.on('layers', (layers) => {
  layerToggle.setLayers(layers);
});

widgetManager.on('change', (widgets) => {
  widgetContainer.setWidgets(widgets);
});

deckMapManager.on('viewStateChange', (viewState) => {
  zoomLevel = viewState.zoom;
  zoomControls.setZoomLevel(zoomLevel);
});

// ==================== LAYOUT ====================

function toggleSidebar() {
  if (isMobileViewport) {
    if (sidebarState === 'closed' || sidebarState === 'collapsed') {
      sidebarState = 'half';
    } else {
      sidebarState = 'closed';
    }
  } else {
    isSidebarOpen = !isSidebarOpen;
    sidebarState = isSidebarOpen ? 'open' : 'closed';
  }
  updateLayout();
}

function updateLayout() {
  const mainLayout = document.getElementById('main-layout');
  const sidebarColumn = document.getElementById('sidebar-column');
  const mapContainerWrapper = document.getElementById('map-container-wrapper');
  const topLeftControls = document.getElementById('top-left-controls');

  // Desktop sidebar
  if (!isMobileViewport) {
    mainLayout.classList.toggle('sidebar-open', isSidebarOpen);
    sidebarColumn.classList.toggle('sidebar-open', isSidebarOpen);
    fabButton.style.display = isSidebarOpen ? 'none' : 'flex';
  } else {
    mainLayout.classList.remove('sidebar-open');
    sidebarColumn.classList.remove('sidebar-open');
    fabButton.style.display = 'none';
  }

  // Mobile states
  mapContainerWrapper.classList.toggle('sidebar-full', isMobileViewport && sidebarState === 'full');
  topLeftControls.classList.toggle(
    'below-sidebar',
    isMobileViewport && sidebarState === 'full'
  );

  // Update chat UI with current state
  chatUI.setSidebarState(sidebarState);
  chatUI.setMobile(isMobileViewport);
  chatUI.setSidebarOpen(isSidebarOpen);

  // Trigger deck.gl redraw after layout change
  if (mapInitialized) {
    deckMapManager.redraw();
  }
}

function updateControlsState() {
  const disabled = !orchestrator.isConnected() || !mapInitialized;
  layerToggle.setDisabled(disabled);
  zoomControls.setDisabled(disabled);
}

function checkViewportSize() {
  const wasMobile = isMobileViewport;
  isMobileViewport = window.innerWidth <= 768;

  if (wasMobile && !isMobileViewport) {
    if (['collapsed', 'half', 'full'].includes(sidebarState)) {
      isSidebarOpen = false;
      sidebarState = 'closed';
    }
  } else if (!wasMobile && isMobileViewport) {
    if (sidebarState === 'closed') {
      sidebarState = 'half';
    }
  }

  updateLayout();
}

window.addEventListener('resize', checkViewportSize);

// ==================== INITIALIZATION ====================

async function init() {
  // Initialize map
  await deckMapManager.initialize('map-container', 'map-container-canvas');
  mapInitialized = true;
  updateControlsState();
  deckMapManager.redraw();

  // Connect WebSocket
  orchestrator.connect();

  // Set initial layout
  checkViewportSize();
}

init();
