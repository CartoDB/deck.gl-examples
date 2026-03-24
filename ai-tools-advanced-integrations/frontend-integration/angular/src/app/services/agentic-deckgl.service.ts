/**
 * Map AI Tools Service
 *
 * Consolidated service for AI-powered map tools integration.
 * Angular equivalent of Vanilla's index.ts message handling.
 *
 * Handles:
 * - WebSocket connection management via WebSocketService
 * - Chat message state and streaming
 * - Tool execution via ConsolidatedExecutorsService
 * - Loader state management
 * - Error handling
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import {
  Message,
  WebSocketMessage,
  LoaderState,
  LoaderStage,
  InitialState,
  LayerConfig,
} from '../models/message.model';
import { ConsolidatedExecutorsService } from './consolidated-executors.service';
import { WebSocketService } from './websocket.service';
import { DeckStateService } from '../state/deck-state.service';
import { environment } from '../../environments/environment';
import { extractLegendFromLayer } from '../utils/legend.utils';

@Injectable({
  providedIn: 'root',
})
export class AgenticDeckGLService implements OnDestroy {
  // State observables
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  private loaderStateSubject = new BehaviorSubject<LoaderState>(null);
  private loaderMessageSubject = new BehaviorSubject<string>('');
  private errorSubject = new Subject<string>();
  private layersSubject = new BehaviorSubject<LayerConfig[]>([]);

  public messages$ = this.messagesSubject.asObservable();
  public loaderState$ = this.loaderStateSubject.asObservable();
  public loaderMessage$ = this.loaderMessageSubject.asObservable();
  public error$ = this.errorSubject.asObservable();
  public layers$ = this.layersSubject.asObservable();

  // Proxy WebSocket connection status
  public get isConnected$() {
    return this.wsService.isConnected$;
  }

  // Internal state
  private streamingMessageIds = new Set<string>();
  private messageIdCounter = 0;
  private subscriptions: Subscription[] = [];

  // Tool message queueing state
  private pendingToolMessages: Message[] = [];
  private currentStreamingMessageId: string | null = null;
  private streamingTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly STREAMING_TIMEOUT_MS = 30000;

  constructor(
    private wsService: WebSocketService,
    private executorsService: ConsolidatedExecutorsService,
    private deckState: DeckStateService
  ) {
    // Subscribe to deck state layers for UI
    this.subscriptions.push(
      this.deckState.layers$.subscribe(layers => {
        // Filter out system layers (__ prefix) from UI layer toggle
        const userLayers = layers.filter(layer => {
          const id = (layer['id'] as string) || '';
          return !id.startsWith('__');
        });
        const layerConfigs = userLayers.map(layer => {
          const id = (layer['id'] as string) || 'unknown';
          let name = id;
          let color = '#036fe2';

          // Extract legend data from layer spec
          const legend = extractLegendFromLayer(layer);

          // Determine color from legend if available
          if (legend) {
            if (legend.type === 'discrete' && legend.entries && legend.entries.length > 0) {
              // Use first entry color for discrete legend
              color = legend.entries[0].color;
            } else if (legend.type === 'single' && legend.singleColor) {
              // Use single color
              color = legend.singleColor;
            } else if (legend.functionConfig && legend.functionConfig.colors && legend.functionConfig.colors.length > 0) {
              // Use first color from function config
              color = legend.functionConfig.colors[0];
            }
          }

          // Get center coordinates from metadata
          const center = this.deckState.getLayerCenter(id);

          return {
            id,
            name,
            color,
            visible: layer['visible'] !== false,
            center,
            legend
          };
        });
        this.layersSubject.next(layerConfigs);
      })
    );
  }

  /**
   * Connect to WebSocket server and start listening for messages
   */
  connect(wsUrl?: string): void {
    this.wsService.connect(wsUrl);

    // Subscribe to WebSocket messages
    const msgSub = this.wsService.message$.subscribe((data) => this.handleMessage(data));
    this.subscriptions.push(msgSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.wsService.disconnect();
  }

  /**
   * Send a chat message through WebSocket
   */
  sendMessage(content: string): boolean {
    if (!this.wsService.isConnected$.getValue()) {
      return false;
    }

    // Add user message with timestamp
    this.addMessage({ type: 'user', content, timestamp: Date.now() });

    // Reset streaming state
    this.streamingMessageIds.clear();
    this.pendingToolMessages = [];
    this.currentStreamingMessageId = null;
    if (this.streamingTimeout) {
      clearTimeout(this.streamingTimeout);
      this.streamingTimeout = null;
    }

    // Set loader to thinking
    this.setLoaderState('thinking', 'Thinking...');

    // Build initial state to provide context to AI
    const initialState = this.createInitialState();

    // Send through WebSocket
    this.wsService.sendChatMessage(content, initialState);

    return true;
  }

  /**
   * Clear all messages and reset state
   */
  clearMessages(): void {
    this.messagesSubject.next([]);
    this.streamingMessageIds.clear();
    this.messageIdCounter = 0;
    this.pendingToolMessages = [];
    this.currentStreamingMessageId = null;
    if (this.streamingTimeout) {
      clearTimeout(this.streamingTimeout);
      this.streamingTimeout = null;
    }
    this.setLoaderState(null);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createInitialState(): InitialState {
    const state = this.deckState.getState();
    const spec = state.deckSpec;

    return {
      viewState: {
        longitude: spec.initialViewState.longitude,
        latitude: spec.initialViewState.latitude,
        zoom: spec.initialViewState.zoom,
        pitch: spec.initialViewState.pitch,
        bearing: spec.initialViewState.bearing
      },
      layers: spec.layers.filter(layer => {
        const id = (layer['id'] as string) || '';
        return !id.startsWith('__');
      }).map(layer => {
        const baseInfo = {
          id: (layer['id'] as string) || 'unknown',
          type: (layer['@@type'] as string) || 'Unknown',
          visible: layer['visible'] !== false
        };

        // Extract styling context for AI
        const styleContext: Record<string, unknown> = {};

        // Include getFillColor if it's a colorCategories/colorBins expression
        const fillColor = layer['getFillColor'];
        if (fillColor && typeof fillColor === 'object') {
          styleContext.getFillColor = fillColor;
        }

        // Include getLineColor if present
        const lineColor = layer['getLineColor'];
        if (lineColor && typeof lineColor === 'object') {
          styleContext.getLineColor = lineColor;
        }

        // Include filters if present in data
        const data = layer['data'] as Record<string, unknown> | undefined;
        if (data?.['filters']) {
          styleContext.filters = data['filters'];
        }

        // Include updateTriggers if present (contains style configuration)
        if (layer['updateTriggers']) {
          styleContext.updateTriggers = layer['updateTriggers'];
        }

        return Object.keys(styleContext).length > 0
          ? { ...baseInfo, styleContext }
          : baseInfo;
      }),
      activeLayerId: state.activeLayerId,
      cartoConfig: {
        connectionName: environment.connectionName,
        hasCredentials: !!environment.accessToken
      }
    };
  }

  private handleMessage(data: WebSocketMessage): void {
    switch (data.type) {
      case 'stream_chunk':
        this.handleStreamChunk(data);
        break;
      case 'tool_call_start':
        this.handleToolCallStart(data);
        break;
      case 'mcp_tool_result':
        this.handleMcpToolResult(data);
        break;
      case 'tool_call':
        this.handleToolCall(data);
        break;
      case 'tool_result':
        this.handleToolResult(data);
        break;
      case 'error':
        this.messagesSubject.next([
          ...this.messagesSubject.value,
          {
            type: 'error',
            content: data.content || 'Unknown error',
            timestamp: Date.now(),
          },
        ]);
        this.setLoaderState(null);
        break;
    }
  }

  private handleStreamChunk(data: WebSocketMessage): void {
    if (!data.messageId) return;

    const isNewMessage = !this.streamingMessageIds.has(data.messageId);

    // First chunk - hide "thinking" loader
    if (isNewMessage) {
      this.setLoaderState(null);
    }

    // Skip empty completion chunks
    if (data.isComplete && !data.content) {
      this.updateMessage(data.messageId, { streaming: false });
      // Clear streaming state and flush pending tool messages
      this.currentStreamingMessageId = null;
      if (this.streamingTimeout) {
        clearTimeout(this.streamingTimeout);
        this.streamingTimeout = null;
      }
      this.flushPendingToolMessages();
      return;
    }

    if (isNewMessage) {
      // Track this as the current streaming message
      this.currentStreamingMessageId = data.messageId;

      // Set safety timeout
      if (this.streamingTimeout) {
        clearTimeout(this.streamingTimeout);
      }
      this.streamingTimeout = setTimeout(() => {
        this.currentStreamingMessageId = null;
        this.streamingTimeout = null;
        this.flushPendingToolMessages();
      }, this.STREAMING_TIMEOUT_MS);

      // New message - add to messages array
      this.streamingMessageIds.add(data.messageId);
      this.addMessage({
        type: 'assistant',
        content: data.content || '',
        streaming: true,
        messageId: data.messageId,
        timestamp: data.timestamp || Date.now(),
      });
    } else {
      // Update existing message
      this.updateMessage(data.messageId, {
        content: data.content || '',
        streaming: !data.isComplete,
      });
    }

    if (data.isComplete) {
      this.streamingMessageIds.delete(data.messageId);
      // Clear streaming state and flush pending tool messages
      this.currentStreamingMessageId = null;
      if (this.streamingTimeout) {
        clearTimeout(this.streamingTimeout);
        this.streamingTimeout = null;
      }
      this.flushPendingToolMessages();
    }
  }

  private flushPendingToolMessages(): void {
    if (this.pendingToolMessages.length === 0) return;
    const messages = this.messagesSubject.getValue();
    this.messagesSubject.next([...messages, ...this.pendingToolMessages]);
    this.pendingToolMessages = [];
  }

  private handleToolCallStart(data: WebSocketMessage): void {
    const toolName = data.toolName || data.tool || 'tool';
    this.setLoaderState('mcp_request', `Working with ${toolName}...`);
  }

  private handleMcpToolResult(data: WebSocketMessage): void {
    const toolName = data.toolName || data.tool || 'tool';

    if (data.error) {
      console.error('[AgenticDeckGLService] MCP tool error:', data.error);
    }

    this.setLoaderState('mcp_processing', `Processing ${toolName} result...`);
  }

  private async handleToolCall(data: WebSocketMessage): Promise<void> {
    const toolName = data.tool || data.toolName;
    const parameters = data.parameters || data.data || {};
    const callId = data.callId || '';

    if (!toolName) {
      this.errorSubject.next('No tool name provided');
      this.setLoaderState(null);
      return;
    }

    // Set loader state based on tool
    let stage: LoaderStage = 'executing';
    if (toolName === 'set-deck-state') {
      stage = 'creating';
    }
    this.setLoaderState(stage, `Executing ${toolName}...`);

    try {
      const result = await this.executorsService.execute(toolName, parameters);

      // Create the tool result message
      const toolMessage: Message = {
        id: this.generateMessageId(),
        type: 'tool',
        content: result.success ? `${result.message}` : `${result.message}`,
        toolName,
        status: result.success ? 'success' : 'error',
        timestamp: Date.now()
      };

      // Queue or add immediately based on streaming state
      if (this.currentStreamingMessageId) {
        // Still streaming - queue the tool message
        this.pendingToolMessages.push(toolMessage);
      } else {
        // Not streaming - add immediately
        this.addMessage(toolMessage);
      }

      // Get current layer state to preserve context across conversation turns
      const currentLayers = this.deckState.getLayers().filter(layer => {
        const id = (layer['id'] as string) || '';
        return !id.startsWith('__');
      }).map(layer => ({
        id: (layer['id'] as string) || 'unknown',
        type: (layer['@@type'] as string) || 'Unknown',
        visible: layer['visible'] !== false
      }));

      // Send result back to server with layer state
      this.wsService.sendToolResult({
        toolName,
        callId,
        success: result.success,
        message: result.message,
        error: result.error?.message,
        layerState: currentLayers
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.errorSubject.next(`Tool execution error: ${errorMessage}`);

      this.wsService.sendToolResult({
        toolName,
        callId,
        success: false,
        message: `Execution error: ${errorMessage}`,
        error: errorMessage
      });
    }

    this.setLoaderState(null);
  }

  private handleToolResult(data: WebSocketMessage): void {
    // Tool completed on backend - just log for now
    if (data.success === false) {
      this.errorSubject.next(data.error || data.message || 'Tool execution failed');
    }

    this.setLoaderState(null);
  }

  private setLoaderState(state: LoaderState, message?: string): void {
    this.loaderStateSubject.next(state);
    this.loaderMessageSubject.next(message || '');
  }

  private generateMessageId(): string {
    return `local_${Date.now()}_${this.messageIdCounter++}`;
  }

  private addMessage(msg: Partial<Message>): void {
    const messages = this.messagesSubject.getValue();
    const newMessage: Message = {
      id: msg.id || this.generateMessageId(),
      type: msg.type || 'assistant',
      content: msg.content || '',
      streaming: msg.streaming,
      messageId: msg.messageId,
      toolName: msg.toolName,
      status: msg.status,
      timestamp: msg.timestamp || Date.now(),
    };
    this.messagesSubject.next([...messages, newMessage]);
  }

  private updateMessage(messageId: string, updates: Partial<Message>): void {
    const messages = this.messagesSubject.getValue();
    const updated = messages.map((msg) =>
      msg.messageId === messageId ? { ...msg, ...updates } : msg
    );
    this.messagesSubject.next(updated);
  }
}
