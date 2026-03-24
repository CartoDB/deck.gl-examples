/**
 * MapAITools Composable
 *
 * Orchestrates WebSocket messages, tool execution, loader state, and layer configs.
 * Singleton composable that replaces React's MapAIToolsContext.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type {
  Message,
  WebSocketMessage,
  LoaderState,
  LoaderStage,
  LayerConfig,
  InitialState,
} from '../types/models';
import { useDeckState } from './useDeckState';
import { useWebSocket } from './useWebSocket';
import { useMaskLayer } from './useMaskLayer';
import { createToolExecutor, type ExecuteToolFn } from '../services/tool-executor';
import { useWidgets, type WidgetSpec } from './useWidgets';
import { extractLegendFromLayer } from '../utils/legend';
import { environment } from '../config/environment';

export interface MapAIToolsComposable {
  messages: Ref<Message[]>;
  loaderState: Ref<LoaderState>;
  loaderMessage: Ref<string>;
  layers: ComputedRef<LayerConfig[]>;
  isConnected: ComputedRef<boolean>;
  sendMessage: (content: string) => boolean;
  clearMessages: () => void;
  widgets: Ref<WidgetSpec[]>;
  addWidget: (spec: WidgetSpec) => void;
  removeWidget: (id: string) => void;
  clearWidgets: () => void;
}

// Module-scoped singleton state
let _instance: MapAIToolsComposable | null = null;

// Shared reactive state
const messages = ref<Message[]>([]);
const loaderState = ref<LoaderState>(null);
const loaderMessage = ref('');

// Non-reactive refs
const streamingMessageIds = new Set<string>();
let messageIdCounter = 0;
const pendingToolMessages: Message[] = [];
let currentStreamingMessageId: string | null = null;
let streamingTimeout: ReturnType<typeof setTimeout> | null = null;
const STREAMING_TIMEOUT_MS = 30000;

function setLoaderStateValue(state: LoaderState, message?: string) {
  loaderState.value = state;
  loaderMessage.value = message || '';
}

function generateMessageId() {
  return `local_${Date.now()}_${messageIdCounter++}`;
}

function flushPendingToolMessages() {
  if (pendingToolMessages.length === 0) return;
  messages.value.push(...pendingToolMessages);
  pendingToolMessages.length = 0;
}

function createMapAIToolsComposable(): MapAIToolsComposable {
  const deckState = useDeckState();
  const ws = useWebSocket();
  const maskLayer = useMaskLayer();
  const widgetManager = useWidgets(() => maskLayer.state.committedGeometry);

  // Create tool executor
  const toolExecutor: ExecuteToolFn = createToolExecutor(
    {
      setInitialViewState: (vs) => deckState.setInitialViewState(vs),
      setBasemap: (b) => deckState.setBasemap(b),
      setDeckLayers: (c) => deckState.setDeckLayers(c),
      setActiveLayerId: (id) => deckState.setActiveLayerId(id),
      getDeckSpec: () => deckState.getDeckSpec(),
    },
    {
      setMaskGeometry: (g: any) => maskLayer.setMaskGeometry(g),
      enableDrawMode: () => maskLayer.enableDrawMode(),
      clearMask: () => maskLayer.clearMask(),
    },
    {
      addWidget: (spec: any) => widgetManager.addWidget(spec),
      removeWidget: (id: string) => widgetManager.removeWidget(id),
      clearWidgets: () => widgetManager.clearWidgets(),
    }
  );

  // Derive layers from deckSpec
  const layers = computed<LayerConfig[]>(() => {
    return deckState.state.deckSpec.layers.filter((layer) => {
      const id = (layer['id'] as string) || '';
      return !id.startsWith('__');
    }).map((layer) => {
      const id = (layer['id'] as string) || 'unknown';
      const name = id;
      let color = '#036fe2';

      const legend = extractLegendFromLayer(layer) ?? undefined;

      if (legend) {
        if (legend.type === 'discrete' && legend.entries && legend.entries.length > 0) {
          color = legend.entries[0].color;
        } else if (legend.type === 'single' && legend.singleColor) {
          color = legend.singleColor;
        } else if (
          legend.functionConfig &&
          legend.functionConfig.colors &&
          legend.functionConfig.colors.length > 0
        ) {
          color = legend.functionConfig.colors[0];
        }
      }

      const center = deckState.getLayerCenter(id);

      return {
        id,
        name,
        color,
        visible: layer['visible'] !== false,
        center,
        legend,
      };
    });
  });

  const isConnected = computed(() => ws.isConnected.value);

  function handleStreamChunk(data: WebSocketMessage) {
    if (!data.messageId) return;

    const isNewMessage = !streamingMessageIds.has(data.messageId);

    if (isNewMessage) {
      setLoaderStateValue(null);
    }

    // Skip empty completion chunks
    if (data.isComplete && !data.content) {
      const msgIndex = messages.value.findIndex((m) => m.messageId === data.messageId);
      if (msgIndex !== -1) {
        messages.value[msgIndex].streaming = false;
      }
      currentStreamingMessageId = null;
      if (streamingTimeout) {
        clearTimeout(streamingTimeout);
        streamingTimeout = null;
      }
      flushPendingToolMessages();
      return;
    }

    if (isNewMessage) {
      currentStreamingMessageId = data.messageId;

      if (streamingTimeout) {
        clearTimeout(streamingTimeout);
      }
      streamingTimeout = setTimeout(() => {
        currentStreamingMessageId = null;
        streamingTimeout = null;
        flushPendingToolMessages();
      }, STREAMING_TIMEOUT_MS);

      streamingMessageIds.add(data.messageId);
      messages.value.push({
        id: generateMessageId(),
        type: 'assistant',
        content: data.content || '',
        streaming: true,
        messageId: data.messageId,
        timestamp: data.timestamp || Date.now(),
      });
    } else {
      const msgIndex = messages.value.findIndex((m) => m.messageId === data.messageId);
      if (msgIndex !== -1) {
        messages.value[msgIndex].content = data.content || '';
        messages.value[msgIndex].streaming = !data.isComplete;
      }
    }

    if (data.isComplete) {
      streamingMessageIds.delete(data.messageId);
      currentStreamingMessageId = null;
      if (streamingTimeout) {
        clearTimeout(streamingTimeout);
        streamingTimeout = null;
      }
      flushPendingToolMessages();
    }
  }

  function handleToolCallStart(data: WebSocketMessage) {
    const toolName = data.toolName || data.tool || 'tool';
    setLoaderStateValue('mcp_request', `Working with ${toolName}...`);
  }

  function handleMcpToolResult(data: WebSocketMessage) {
    const toolName = data.toolName || data.tool || 'tool';
    if (data.error) {
      console.error('[MapAITools] MCP tool error:', data.error);
    }
    setLoaderStateValue('mcp_processing', `Processing ${toolName} result...`);
  }

  async function handleToolCall(data: WebSocketMessage) {
    const toolName = data.tool || data.toolName;
    const parameters = data.parameters || data.data || {};
    const callId = data.callId || '';

    if (!toolName) {
      setLoaderStateValue(null);
      return;
    }

    let stage: LoaderStage = 'executing';
    if (toolName === 'set-deck-state') {
      stage = 'creating';
    }
    setLoaderStateValue(stage, `Executing ${toolName}...`);

    try {
      const result = await toolExecutor(toolName, parameters);

      const toolMessage: Message = {
        id: generateMessageId(),
        type: 'tool',
        content: result.message,
        toolName,
        status: result.success ? 'success' : 'error',
        timestamp: Date.now(),
      };

      if (currentStreamingMessageId) {
        pendingToolMessages.push(toolMessage);
      } else {
        messages.value.push(toolMessage);
      }

      const currentLayers = deckState.getDeckSpec().layers.filter((layer) => {
        const id = (layer['id'] as string) || '';
        return !id.startsWith('__');
      }).map((layer) => ({
        id: (layer['id'] as string) || 'unknown',
        type: (layer['@@type'] as string) || 'Unknown',
        visible: layer['visible'] !== false,
      }));

      ws.sendToolResult({
        toolName,
        callId,
        success: result.success,
        message: result.message,
        error: result.error?.message,
        layerState: currentLayers,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      ws.sendToolResult({
        toolName,
        callId,
        success: false,
        message: `Execution error: ${errorMessage}`,
        error: errorMessage,
      });
    }

    setLoaderStateValue(null);
  }

  function handleToolResult(data: WebSocketMessage) {
    if (data.success === false) {
      console.error('[MapAITools] Tool failed:', data.error || data.message);
    }
    setLoaderStateValue(null);
  }

  // Subscribe to WebSocket messages
  ws.onMessage((data: WebSocketMessage) => {
    switch (data.type) {
      case 'stream_chunk':
        handleStreamChunk(data);
        break;
      case 'tool_call_start':
        handleToolCallStart(data);
        break;
      case 'mcp_tool_result':
        handleMcpToolResult(data);
        break;
      case 'tool_call':
        handleToolCall(data);
        break;
      case 'tool_result':
        handleToolResult(data);
        break;
      case 'error':
        messages.value.push({
          type: 'error',
          content: data.content || 'Unknown error',
          timestamp: Date.now(),
        });
        setLoaderStateValue(null);
        break;
    }
  });

  function createInitialState(): InitialState {
    const state = {
      viewState: deckState.getViewState(),
      deckSpec: deckState.getDeckSpec(),
    };

    return {
      viewState: {
        longitude: state.viewState.longitude ?? 0,
        latitude: state.viewState.latitude ?? 0,
        zoom: state.viewState.zoom ?? 3,
        pitch: state.viewState.pitch ?? 0,
        bearing: state.viewState.bearing ?? 0,
      },
      layers: state.deckSpec.layers.filter((layer) => {
        const id = (layer['id'] as string) || '';
        return !id.startsWith('__');
      }).map((layer) => {
        const baseInfo = {
          id: (layer['id'] as string) || 'unknown',
          type: (layer['@@type'] as string) || 'Unknown',
          visible: layer['visible'] !== false,
        };

        const styleContext: Record<string, unknown> = {};

        const fillColor = layer['getFillColor'];
        if (fillColor && typeof fillColor === 'object') {
          styleContext.getFillColor = fillColor;
        }

        const lineColor = layer['getLineColor'];
        if (lineColor && typeof lineColor === 'object') {
          styleContext.getLineColor = lineColor;
        }

        const data = layer['data'] as Record<string, unknown> | undefined;
        if (data?.['filters']) {
          styleContext.filters = data['filters'];
        }

        if (layer['updateTriggers']) {
          styleContext.updateTriggers = layer['updateTriggers'];
        }

        return Object.keys(styleContext).length > 0
          ? { ...baseInfo, styleContext }
          : baseInfo;
      }),
      activeLayerId: deckState.state.activeLayerId,
      cartoConfig: {
        connectionName: environment.connectionName,
        hasCredentials: !!environment.accessToken,
      },
    };
  }

  function sendMessage(content: string): boolean {
    if (!ws.isConnected.value) {
      return false;
    }

    messages.value.push({ type: 'user', content, timestamp: Date.now() });

    streamingMessageIds.clear();
    pendingToolMessages.length = 0;
    currentStreamingMessageId = null;
    if (streamingTimeout) {
      clearTimeout(streamingTimeout);
      streamingTimeout = null;
    }

    setLoaderStateValue('thinking', 'Thinking...');

    const initialState = createInitialState();
    ws.sendChatMessage(content, initialState);

    return true;
  }

  function clearMessages() {
    messages.value = [];
    streamingMessageIds.clear();
    messageIdCounter = 0;
    pendingToolMessages.length = 0;
    currentStreamingMessageId = null;
    if (streamingTimeout) {
      clearTimeout(streamingTimeout);
      streamingTimeout = null;
    }
    setLoaderStateValue(null);
  }

  return {
    messages,
    loaderState,
    loaderMessage,
    layers,
    isConnected,
    sendMessage,
    clearMessages,
    widgets: widgetManager.widgets,
    addWidget: widgetManager.addWidget,
    removeWidget: widgetManager.removeWidget,
    clearWidgets: widgetManager.clearWidgets,
  };
}

export function useMapAITools(): MapAIToolsComposable {
  if (!_instance) {
    _instance = createMapAIToolsComposable();
  }
  return _instance;
}
