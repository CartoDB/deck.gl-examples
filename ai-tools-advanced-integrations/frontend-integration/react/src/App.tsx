import { useState, useCallback, useEffect } from 'react';
import { MapView } from './components/MapView';
import { ChatUI } from './components/ChatUI';
import { ZoomControls } from './components/ZoomControls';
import { LayerToggle } from './components/LayerToggle';
import { Snackbar } from './components/Snackbar';
import { DrawTool } from './components/DrawTool';
import { WidgetContainer } from './components/WidgetContainer';
import { useMapAITools } from './hooks/useMapAITools';
import { useDeckState } from './hooks/useDeckState';
import { useMaskLayer } from './hooks/useMaskLayer';
import { useWidgets } from './hooks/useWidgets';
import { useIsMobile } from './hooks/useIsMobile';
import type { SnackbarConfig } from './types/models';
import './App.css';

export default function App() {
  const deckState = useDeckState();
  const aiTools = useMapAITools();
  const maskLayer = useMaskLayer();
  const widgetManager = useWidgets(maskLayer.maskState.committedGeometry);
  const isMobile = useIsMobile();

  const [zoomLevel, setZoomLevel] = useState(3);
  const [sidebarState, setSidebarState] = useState<
    'closed' | 'open' | 'collapsed' | 'half' | 'full'
  >('closed');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [snackbar, setSnackbar] = useState<SnackbarConfig>({ message: null, type: 'error' });

  // Register mask layer actions with the tool executor
  useEffect(() => {
    aiTools.registerMaskActions({
      setMaskGeometry: maskLayer.setMaskGeometry,
      enableDrawMode: maskLayer.enableDrawMode,
      clearMask: maskLayer.clearMask,
    });
  }, [aiTools, maskLayer]);

  // Register widget actions with the tool executor
  useEffect(() => {
    aiTools.registerWidgetActions({
      addWidget: widgetManager.addWidget,
      removeWidget: widgetManager.removeWidget,
      clearWidgets: widgetManager.clearWidgets,
    });
  }, [aiTools, widgetManager]);

  const handleViewStateChange = useCallback((viewState: { zoom: number }) => {
    setZoomLevel(viewState.zoom);
  }, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      aiTools.sendMessage(content);
    },
    [aiTools]
  );

  const handleClearChat = useCallback(
    (clearLayers: boolean) => {
      aiTools.clearMessages();
      if (clearLayers) {
        deckState.clearChatGeneratedLayers();
        widgetManager.clearWidgets();
      }
    },
    [aiTools, deckState, widgetManager]
  );

  const handleZoomIn = useCallback(() => {
    const currentView = deckState.getViewState();
    const newZoom = Math.min(22, (currentView.zoom ?? 3) + 1);
    deckState.setInitialViewState({
      latitude: currentView.latitude,
      longitude: currentView.longitude,
      zoom: newZoom,
      pitch: currentView.pitch ?? 0,
      bearing: currentView.bearing ?? 0,
    });
  }, [deckState]);

  const handleZoomOut = useCallback(() => {
    const currentView = deckState.getViewState();
    const newZoom = Math.max(0, (currentView.zoom ?? 3) - 1);
    deckState.setInitialViewState({
      latitude: currentView.latitude,
      longitude: currentView.longitude,
      zoom: newZoom,
      pitch: currentView.pitch ?? 0,
      bearing: currentView.bearing ?? 0,
    });
  }, [deckState]);

  const handleLayerToggle = useCallback(
    (event: { layerId: string; visible: boolean }) => {
      const currentLayers = deckState.getDeckSpec().layers;
      const updatedLayers = currentLayers.map((layer) => {
        if (layer['id'] === event.layerId) {
          return { ...layer, visible: event.visible };
        }
        return layer;
      });
      deckState.setLayers(updatedLayers);
    },
    [deckState]
  );

  const handleLayerFlyTo = useCallback(
    (event: { layerId: string }) => {
      const layer = aiTools.layers.find((l) => l.id === event.layerId);
      if (!layer?.center) return;

      deckState.setInitialViewState({
        latitude: layer.center.latitude,
        longitude: layer.center.longitude,
        zoom: layer.center.zoom ?? 12,
        pitch: 0,
        bearing: 0,
      });
    },
    [deckState, aiTools.layers]
  );

  const handleSidebarStateChange = useCallback(
    (state: 'collapsed' | 'half' | 'full') => {
      setSidebarState(state);
    },
    []
  );

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      if (sidebarState === 'closed' || sidebarState === 'collapsed') {
        setSidebarState('half');
      } else {
        setSidebarState('closed');
      }
    } else {
      const newOpen = !isSidebarOpen;
      setIsSidebarOpen(newOpen);
      setSidebarState(newOpen ? 'open' : 'closed');
    }
  }, [isMobile, sidebarState, isSidebarOpen]);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setSidebarState('closed');
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar({ message: null, type: 'error' });
  }, []);

  const isDesktopSidebarOpen = !isMobile && isSidebarOpen;
  const showMobileSidebar = isMobile && sidebarState !== 'closed';
  const sidebarFullOnMobile = isMobile && sidebarState === 'full';

  return (
    <div className="app-container">
      <div
        className={`main-layout${isDesktopSidebarOpen ? " sidebar-open" : ""}`}
      >
        <div className="map-column">
          <header className="app-header">
            <h1 className="app-title">CARTO AI Tools — React</h1>
          </header>

          <div
            className={`map-container${sidebarFullOnMobile ? " sidebar-full" : ""}`}
          >
            <MapView
              onViewStateChange={handleViewStateChange}
              maskLayer={{
                isMaskActive: maskLayer.isMaskActive,
                isDrawing: maskLayer.maskState.isDrawing,
                getMaskLayers: maskLayer.getMaskLayers,
                injectMaskExtension: maskLayer.injectMaskExtension,
              }}
            />

            <div
              className={`top-left-controls${
                showMobileSidebar ? " below-sidebar" : ""
              }`}
            >
              <LayerToggle
                disabled={!aiTools.isConnected}
                layers={aiTools.layers}
                onToggle={handleLayerToggle}
                onFlyTo={handleLayerFlyTo}
              />

              <div className="draw-tool-wrapper">
                <DrawTool
                  hasMask={maskLayer.isMaskActive}
                  isDrawing={maskLayer.maskState.isDrawing}
                  currentMode={maskLayer.maskState.currentMode}
                  onToggleDraw={() =>
                    maskLayer.maskState.isDrawing
                      ? maskLayer.disableDrawMode()
                      : maskLayer.enableDrawMode()
                  }
                  onSetMode={maskLayer.setDrawMode}
                  onClear={maskLayer.clearMask}
                />
              </div>
            </div>

            <div className="zoom-controls-wrapper">
              <ZoomControls
                disabled={!aiTools.isConnected}
                zoomLevel={zoomLevel}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
              />
            </div>
          </div>
        </div>
        <WidgetContainer
          widgets={widgetManager.widgets}
          onRemove={widgetManager.removeWidget}
        />
        <div className="sidebar-column">
          {(isDesktopSidebarOpen || showMobileSidebar) && (
            <ChatUI
              isConnected={aiTools.isConnected}
              messages={aiTools.messages}
              loaderState={aiTools.loaderState}
              sidebarState={sidebarState}
              isMobile={isMobile}
              isSidebarOpen={isSidebarOpen}
              onSendMessage={handleSendMessage}
              onSidebarStateChange={handleSidebarStateChange}
              onCloseSidebar={closeSidebar}
              onClearChat={handleClearChat}
            />
          )}
        </div>
      </div>

      {/* FAB button to toggle sidebar — hidden when sidebar is open */}
      {!isDesktopSidebarOpen && !showMobileSidebar && (
        <button
          className="fab-button"
          onClick={toggleSidebar}
          title="Open Chat"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Snackbar */}
      <Snackbar config={snackbar} onDismiss={hideSnackbar} />
    </div>
  );
}
