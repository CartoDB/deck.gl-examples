<script setup lang="ts">
import { ref, computed } from 'vue';
import MapView from './components/MapView.vue';
import ChatUI from './components/ChatUI.vue';
import ZoomControls from './components/ZoomControls.vue';
import DrawTool from './components/DrawTool.vue';
import LayerToggle from './components/LayerToggle.vue';
import Snackbar from './components/Snackbar.vue';
import WidgetContainer from './components/WidgetContainer.vue';
import { useMapAITools } from './composables/useMapAITools';
import { useDeckState } from './composables/useDeckState';
import { useIsMobile } from './composables/useIsMobile';
import type { SnackbarConfig } from './types/models';

const deckState = useDeckState();
const aiTools = useMapAITools();
const isMobile = useIsMobile();

const zoomLevel = ref(3);
const sidebarState = ref<'closed' | 'open' | 'collapsed' | 'half' | 'full'>('closed');
const isSidebarOpen = ref(true);
const snackbar = ref<SnackbarConfig>({ message: null, type: 'error' });

function handleViewStateChange(viewState: { zoom: number }) {
  zoomLevel.value = viewState.zoom;
}

function handleSendMessage(content: string) {
  aiTools.sendMessage(content);
}

function handleClearChat(clearLayers: boolean) {
  aiTools.clearMessages();
  if (clearLayers) {
    deckState.clearChatGeneratedLayers();
    aiTools.clearWidgets();
  }
}

function handleZoomIn() {
  const currentView = deckState.getViewState();
  const newZoom = Math.min(22, (currentView.zoom ?? 3) + 1);
  deckState.setInitialViewState({
    latitude: currentView.latitude,
    longitude: currentView.longitude,
    zoom: newZoom,
    pitch: currentView.pitch ?? 0,
    bearing: currentView.bearing ?? 0,
  });
}

function handleZoomOut() {
  const currentView = deckState.getViewState();
  const newZoom = Math.max(0, (currentView.zoom ?? 3) - 1);
  deckState.setInitialViewState({
    latitude: currentView.latitude,
    longitude: currentView.longitude,
    zoom: newZoom,
    pitch: currentView.pitch ?? 0,
    bearing: currentView.bearing ?? 0,
  });
}

function handleLayerToggle(event: { layerId: string; visible: boolean }) {
  const currentLayers = deckState.getDeckSpec().layers;
  const updatedLayers = currentLayers.map((layer) => {
    if (layer['id'] === event.layerId) {
      return { ...layer, visible: event.visible };
    }
    return layer;
  });
  deckState.setLayers(updatedLayers);
}

function handleLayerFlyTo(event: { layerId: string }) {
  const layer = aiTools.layers.value.find((l: { id: string; center?: { latitude: number; longitude: number; zoom?: number } }) => l.id === event.layerId);
  if (!layer?.center) return;

  deckState.setInitialViewState({
    latitude: layer.center.latitude,
    longitude: layer.center.longitude,
    zoom: layer.center.zoom ?? 12,
    pitch: 0,
    bearing: 0,
  });
}

function handleSidebarStateChange(state: 'collapsed' | 'half' | 'full') {
  sidebarState.value = state;
}

function toggleSidebar() {
  if (isMobile.value) {
    if (sidebarState.value === 'closed' || sidebarState.value === 'collapsed') {
      sidebarState.value = 'half';
    } else {
      sidebarState.value = 'closed';
    }
  } else {
    const newOpen = !isSidebarOpen.value;
    isSidebarOpen.value = newOpen;
    sidebarState.value = newOpen ? 'open' : 'closed';
  }
}

function closeSidebar() {
  isSidebarOpen.value = false;
  sidebarState.value = 'closed';
}

function hideSnackbar() {
  snackbar.value = { message: null, type: 'error' };
}

const isDesktopSidebarOpen = computed(() => !isMobile.value && isSidebarOpen.value);
const showMobileSidebar = computed(() => isMobile.value && sidebarState.value !== 'closed');
const sidebarFullOnMobile = computed(() => isMobile.value && sidebarState.value === 'full');
</script>

<template>
  <div class="app-container">
    <div :class="{ 'main-layout': true, 'sidebar-open': isDesktopSidebarOpen }">
      <div class="map-column">
        <header class="app-header">
          <h1 class="app-title">CARTO AI Tools — Vue</h1>
        </header>

        <div :class="{ 'map-container': true, 'sidebar-full': sidebarFullOnMobile }">
          <MapView @view-state-change="handleViewStateChange" />

          <div :class="{ 'top-left-controls': true, 'below-sidebar': showMobileSidebar }">
            <LayerToggle
              :disabled="!aiTools.isConnected.value"
              :layers="aiTools.layers.value"
              @toggle="handleLayerToggle"
              @fly-to="handleLayerFlyTo"
            />

            <div class="draw-tool-wrapper">
              <DrawTool />
            </div>
          </div>

          <div class="zoom-controls-wrapper">
            <ZoomControls
              :disabled="!aiTools.isConnected.value"
              :zoom-level="zoomLevel"
              @zoom-in="handleZoomIn"
              @zoom-out="handleZoomOut"
            />
          </div>
        </div>
      </div>

      <WidgetContainer
        :widgets="aiTools.widgets.value"
        @remove="aiTools.removeWidget"
      />

      <div class="sidebar-column">
        <ChatUI
          v-if="isDesktopSidebarOpen || showMobileSidebar"
          :is-connected="aiTools.isConnected.value"
          :messages="aiTools.messages.value"
          :loader-state="aiTools.loaderState.value"
          :sidebar-state="sidebarState"
          :is-mobile="isMobile"
          :is-sidebar-open="isSidebarOpen"
          @send-message="handleSendMessage"
          @sidebar-state-change="handleSidebarStateChange"
          @close-sidebar="closeSidebar"
          @clear-chat="handleClearChat"
        />
      </div>
    </div>

    <!-- FAB button to toggle sidebar -->
    <button
      v-if="!isDesktopSidebarOpen && !showMobileSidebar"
      class="fab-button"
      @click="toggleSidebar"
      title="Open Chat"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>

    <!-- Snackbar -->
    <Snackbar :config="snackbar" @dismiss="hideSnackbar" />
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.main-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.map-column {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  transition: width 0.3s ease-in-out;
  min-width: 0;
  overflow: hidden;
}

.main-layout.sidebar-open .map-column {
  width: calc(100% - 450px);
}

.app-header {
  flex-shrink: 0;
  padding: 12px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: 0.5px;
}

.map-container {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.sidebar-column {
  display: flex;
  flex-direction: column;
  width: 0;
  height: 100%;
  overflow: hidden;
  transition: width 0.3s ease-in-out;
  flex-shrink: 0;
}

.main-layout.sidebar-open .sidebar-column {
  width: 450px;
}

.top-left-controls {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.zoom-controls-wrapper {
  position: absolute;
  bottom: 30px;
  left: 10px;
  z-index: 100;
}

@media (max-width: 768px) {
  .main-layout {
    flex-direction: column;
  }

  .map-column {
    width: 100%;
    height: 100%;
  }

  .main-layout.sidebar-open .map-column {
    width: 100%;
  }

  .sidebar-column {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    z-index: 1000;
  }

  .map-container {
    flex: 1;
    min-height: 0;
  }

  .map-container.sidebar-full {
    height: 0;
    overflow: hidden;
  }

  .top-left-controls.below-sidebar {
    position: fixed;
    top: auto;
    bottom: calc(50vh + 10px);
    z-index: 1001;
  }

  .map-container.sidebar-full .top-left-controls.below-sidebar {
    bottom: calc(100vh - 56px + 10px);
  }
}

.fab-button {
  position: fixed;
  top: 4px;
  right: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  z-index: 1001;
  transition:
    right 0.3s ease-in-out,
    transform 0.2s ease-in-out;
}

.fab-button:hover {
  background: #2563eb;
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
}

.fab-button:active {
  transform: scale(0.95);
}

.fab-button svg {
  width: 18px;
  height: 18px;
  stroke: white;
}

@media (min-width: 769px) {
  .main-layout {
    flex-direction: row;
  }
}
</style>

<!-- Global styles for deck.gl tooltips (not scoped) -->
<style>
/* Tooltip styles for deck.gl */
.deck-tooltip {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #e2e8f0;
  max-width: 300px;
  pointer-events: none;
}

.tooltip-title {
  font-weight: 600;
  color: #fff;
  margin-bottom: 6px;
  font-size: 14px;
}

.tooltip-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
}

.tooltip-key {
  color: #f3f3f3;
  font-size: 12px;
}

.tooltip-value {
  color: #fff;
  font-weight: 500;
  font-size: 12px;
  text-align: right;
}
</style>
