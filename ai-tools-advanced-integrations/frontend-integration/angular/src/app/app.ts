/**
 * App Component
 *
 * Main application component using JSONConverter-based architecture.
 * Initializes map with CARTO POI layer via DeckState.
 */

import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { MapView } from './components/map-view/map-view';
import { ChatUi } from './components/chat-ui/chat-ui';
import { ZoomControls } from './components/zoom-controls/zoom-controls';
import { LayerToggle } from './components/layer-toggle/layer-toggle';
import { DrawTool } from './components/draw-tool/draw-tool';
import { SnackbarComponent } from './components/snackbar/snackbar';
import { WidgetContainer } from './components/widget-container/widget-container';
import { WidgetService, type WidgetSpec } from './services/widget.service';
import { AgenticDeckGLService } from './services/agentic-deckgl.service';
import { DeckMapService, ViewState } from './services/deck-map.service';
import { DeckStateService } from './state/deck-state.service';
import { ConsolidatedExecutorsService } from './services/consolidated-executors.service';
import { TOOL_NAMES } from '@carto/agentic-deckgl';
import {
  Message,
  MapInstances,
  LoaderState,
  LayerConfig,
  SnackbarConfig,
} from './models/message.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapView, ChatUi, ZoomControls, LayerToggle, DrawTool, SnackbarComponent, WidgetContainer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  // State
  messages: Message[] = [];
  isConnected: boolean = false;
  loaderState: LoaderState = null;
  loaderMessage: string = '';
  zoomLevel: number = 3;
  layers: LayerConfig[] = [];
  widgets: WidgetSpec[] = [];
  snackbar: SnackbarConfig = { message: null, type: 'error' };
  sidebarState: 'closed' | 'open' | 'collapsed' | 'half' | 'full' = 'closed';
  isSidebarOpen: boolean = true; // Desktop sidebar state

  private mapInstances: MapInstances | null = null;
  private subscriptions: Subscription[] = [];
  private isMobileViewport: boolean = false;

  constructor(
    private aiToolsService: AgenticDeckGLService,
    private deckMapService: DeckMapService,
    private deckState: DeckStateService,
    private executorsService: ConsolidatedExecutorsService,
    private widgetService: WidgetService,
  ) {}

  ngOnInit(): void {
    // Check initial viewport size
    this.checkViewportSize();

    // Connect to WebSocket
    this.aiToolsService.connect();

    // Subscribe to state observables
    this.subscriptions.push(
      this.aiToolsService.isConnected$.subscribe((c) => (this.isConnected = c)),
      this.aiToolsService.messages$.subscribe((m) => (this.messages = m)),
      this.aiToolsService.loaderState$.subscribe((s) => (this.loaderState = s)),
      this.aiToolsService.loaderMessage$.subscribe((m) => (this.loaderMessage = m)),
      this.aiToolsService.error$.subscribe((err) => this.showSnackbar(err)),
      this.aiToolsService.layers$.subscribe((l) => (this.layers = l)),
      this.widgetService.widgets$.subscribe((w) => (this.widgets = w)),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.deckMapService.destroy();
  }

  handleMapInit(instances: MapInstances): void {
    this.mapInstances = instances;
    console.log('[App] Map initialized');

    // Force redraw after init
    this.deckMapService.redraw();
  }

  handleViewStateChange(viewState: ViewState): void {
    this.zoomLevel = viewState.zoom;
  }

  handleSendMessage(content: string): void {
    this.aiToolsService.sendMessage(content);
  }

  handleClearChat(clearLayers: boolean = false): void {
    this.aiToolsService.clearMessages();
    if (clearLayers) {
      this.deckState.clearChatGeneratedLayers();
      this.widgetService.clearWidgets();
    }
  }

  onRemoveWidget(id: string): void {
    this.widgetService.removeWidget(id);
  }

  async handleZoomIn(): Promise<void> {
    const currentView = this.deckState.getViewState();
    const newZoom = Math.min(22, (currentView.zoom ?? 3) + 1);

    await this.executorsService.execute(TOOL_NAMES.SET_DECK_STATE, {
      initialViewState: {
        latitude: currentView.latitude,
        longitude: currentView.longitude,
        zoom: newZoom,
        pitch: currentView.pitch ?? 0,
        bearing: currentView.bearing ?? 0
      }
    });
  }

  async handleZoomOut(): Promise<void> {
    const currentView = this.deckState.getViewState();
    const newZoom = Math.max(0, (currentView.zoom ?? 3) - 1);

    await this.executorsService.execute(TOOL_NAMES.SET_DECK_STATE, {
      initialViewState: {
        latitude: currentView.latitude,
        longitude: currentView.longitude,
        zoom: newZoom,
        pitch: currentView.pitch ?? 0,
        bearing: currentView.bearing ?? 0
      }
    });
  }

  async handleLayerToggle(event: { layerId: string; visible: boolean }): Promise<void> {
    // Update layer visibility in DeckState
    const currentLayers = this.deckState.getLayers();
    const updatedLayers = currentLayers.map(layer => {
      if (layer['id'] === event.layerId) {
        return { ...layer, visible: event.visible };
      }
      return layer;
    });

    this.deckState.setLayers(updatedLayers);
    console.log(`[App] Layer "${event.layerId}" visibility set to ${event.visible}`);
  }

  handleLayerFlyTo(event: { layerId: string }): void {
    // Get layer config with center
    const layer = this.layers.find(l => l.id === event.layerId);
    if (!layer?.center) {
      console.warn('[App] No center coordinates for layer:', event.layerId);
      return;
    }

    // Directly set initialViewState WITHOUT adding a pin
    // Pins should only be added when user requests a location via chat
    this.deckState.setInitialViewState({
      latitude: layer.center.latitude,
      longitude: layer.center.longitude,
      zoom: layer.center.zoom ?? 12,
      pitch: 0,
      bearing: 0,
    });

    console.log(`[App] Flying to layer "${event.layerId}":`, layer.center);
  }

  showSnackbar(message: string, type: 'error' | 'info' | 'success' = 'error'): void {
    this.snackbar = { message, type };
  }

  hideSnackbar(): void {
    this.snackbar = { message: null, type: 'error' };
  }

  get controlsDisabled(): boolean {
    return !this.isConnected || !this.mapInstances;
  }

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkViewportSize();
  }

  checkViewportSize(): void {
    const wasMobile = this.isMobileViewport;
    this.isMobileViewport = window.innerWidth <= 768;

    // Handle state transitions between mobile and desktop
    if (wasMobile && !this.isMobileViewport) {
      // Switched to desktop: convert mobile state to desktop state
      if (this.sidebarState === 'collapsed' || this.sidebarState === 'half' || this.sidebarState === 'full') {
        this.isSidebarOpen = false;
        this.sidebarState = 'closed';
      }
    } else if (!wasMobile && this.isMobileViewport) {
      // Switched to mobile: convert desktop state to mobile state
      if (this.sidebarState === 'closed') {
        this.sidebarState = 'half';
      }
    }
  }

  isMobile(): boolean {
    return this.isMobileViewport;
  }

  handleSidebarStateChange(state: 'collapsed' | 'half' | 'full'): void {
    this.sidebarState = state;
  }

  toggleSidebar(): void {
    if (this.isMobileViewport) {
      // Mobile: toggle between half and closed
      if (this.sidebarState === 'closed' || this.sidebarState === 'collapsed') {
        this.sidebarState = 'half';
      } else {
        this.sidebarState = 'closed';
      }
    } else {
      // Desktop: toggle open/closed
      this.isSidebarOpen = !this.isSidebarOpen;
      this.sidebarState = this.isSidebarOpen ? 'open' : 'closed';
    }
  }

  get isDesktopSidebarOpen(): boolean {
    return !this.isMobileViewport && this.isSidebarOpen;
  }
}
