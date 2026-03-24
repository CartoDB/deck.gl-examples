/**
 * MapAITools Context
 *
 * Orchestrates WebSocket messages, tool execution, loader state, and layer configs.
 * Replaces Angular's MapAIToolsService with React Context.
 */

import React, {
  createContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import type {
  Message,
  WebSocketMessage,
  LoaderState,
  LoaderStage,
  LayerConfig,
  InitialState,
} from '../types/models';
import { useContext } from 'react';
import { DeckStateContext } from './DeckStateContext';
import { WebSocketContext } from './WebSocketContext';
import { createToolExecutor, type ExecuteToolFn, type MaskLayerActions, type WidgetActions } from '../services/tool-executor';
import { extractLegendFromLayer } from '../utils/legend';
import { environment } from '../config/environment';

// Messages reducer
type MessagesAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE'; payload: { messageId: string; updates: Partial<Message> } }
  | { type: 'APPEND_MESSAGES'; payload: Message[] }
  | { type: 'CLEAR' };

function messagesReducer(state: Message[], action: MessagesAction): Message[] {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return [...state, action.payload];
    case 'UPDATE_MESSAGE':
      return state.map((msg) =>
        msg.messageId === action.payload.messageId
          ? { ...msg, ...action.payload.updates }
          : msg
      );
    case 'APPEND_MESSAGES':
      return [...state, ...action.payload];
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

export interface MapAIToolsContextValue {
  messages: Message[];
  loaderState: LoaderState;
  loaderMessage: string;
  layers: LayerConfig[];
  isConnected: boolean;
  sendMessage: (content: string) => boolean;
  clearMessages: () => void;
  registerMaskActions: (actions: MaskLayerActions) => void;
  registerWidgetActions: (actions: WidgetActions) => void;
}

export const MapAIToolsContext = createContext<MapAIToolsContextValue | null>(null);

export function MapAIToolsProvider({ children }: { children: ReactNode }) {
  const deckState = useContext(DeckStateContext)!;
  const ws = useContext(WebSocketContext)!;

  const [messages, dispatchMessages] = useReducer(messagesReducer, []);
  const [loaderState, setLoaderStateValue] = React.useState<LoaderState>(null);
  const [loaderMessage, setLoaderMessage] = React.useState('');

  // Refs for streaming state (avoid stale closures)
  const streamingMessageIdsRef = useRef(new Set<string>());
  const messageIdCounterRef = useRef(0);
  const pendingToolMessagesRef = useRef<Message[]>([]);
  const currentStreamingMessageIdRef = useRef<string | null>(null);
  const streamingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const STREAMING_TIMEOUT_MS = 30000;

  // Keep refs to latest deckState actions to avoid stale closures
  const deckStateRef = useRef(deckState);
  deckStateRef.current = deckState;

  // Ref for mask layer actions (populated by App.tsx via registerMaskActions)
  const maskActionsRef = useRef<MaskLayerActions | null>(null);

  const registerMaskActions = useCallback((actions: MaskLayerActions) => {
    maskActionsRef.current = actions;
  }, []);

  // Ref for widget actions (populated by App.tsx via registerWidgetActions)
  const widgetActionsRef = useRef<WidgetActions | null>(null);

  const registerWidgetActions = useCallback((actions: WidgetActions) => {
    widgetActionsRef.current = actions;
  }, []);

  // Create tool executor with stable reference
  const toolExecutorRef = useRef<ExecuteToolFn | null>(null);
  if (!toolExecutorRef.current) {
    toolExecutorRef.current = createToolExecutor(
      {
        setInitialViewState: (vs) => deckStateRef.current.setInitialViewState(vs),
        setBasemap: (b) => deckStateRef.current.setBasemap(b),
        setDeckLayers: (c) => deckStateRef.current.setDeckLayers(c),
        setActiveLayerId: (id) => deckStateRef.current.setActiveLayerId(id),
        getDeckSpec: () => deckStateRef.current.getDeckSpec(),
      },
      {
        setMaskGeometry: (g) => maskActionsRef.current?.setMaskGeometry(g),
        enableDrawMode: () => maskActionsRef.current?.enableDrawMode(),
        clearMask: () => maskActionsRef.current?.clearMask(),
      },
      {
        addWidget: (spec) => widgetActionsRef.current?.addWidget(spec),
        removeWidget: (id) => widgetActionsRef.current?.removeWidget(id),
        clearWidgets: () => widgetActionsRef.current?.clearWidgets(),
      }
    );
  }

  // Derive layers from deckSpec
  const layers = useMemo<LayerConfig[]>(() => {
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
  }, [deckState.state.deckSpec.layers, deckState.getLayerCenter]);

  const setLoaderState = useCallback((state: LoaderState, message?: string) => {
    setLoaderStateValue(state);
    setLoaderMessage(message || '');
  }, []);

  const generateMessageId = useCallback(() => {
    return `local_${Date.now()}_${messageIdCounterRef.current++}`;
  }, []);

  const flushPendingToolMessages = useCallback(() => {
    if (pendingToolMessagesRef.current.length === 0) return;
    dispatchMessages({
      type: 'APPEND_MESSAGES',
      payload: [...pendingToolMessagesRef.current],
    });
    pendingToolMessagesRef.current = [];
  }, []);

  const handleStreamChunk = useCallback(
    (data: WebSocketMessage) => {
      if (!data.messageId) return;

      const isNewMessage = !streamingMessageIdsRef.current.has(data.messageId);

      if (isNewMessage) {
        setLoaderState(null);
      }

      // Skip empty completion chunks
      if (data.isComplete && !data.content) {
        dispatchMessages({
          type: 'UPDATE_MESSAGE',
          payload: { messageId: data.messageId, updates: { streaming: false } },
        });
        currentStreamingMessageIdRef.current = null;
        if (streamingTimeoutRef.current) {
          clearTimeout(streamingTimeoutRef.current);
          streamingTimeoutRef.current = null;
        }
        flushPendingToolMessages();
        return;
      }

      if (isNewMessage) {
        currentStreamingMessageIdRef.current = data.messageId;

        if (streamingTimeoutRef.current) {
          clearTimeout(streamingTimeoutRef.current);
        }
        streamingTimeoutRef.current = setTimeout(() => {
          currentStreamingMessageIdRef.current = null;
          streamingTimeoutRef.current = null;
          flushPendingToolMessages();
        }, STREAMING_TIMEOUT_MS);

        streamingMessageIdsRef.current.add(data.messageId);
        dispatchMessages({
          type: 'ADD_MESSAGE',
          payload: {
            id: generateMessageId(),
            type: 'assistant',
            content: data.content || '',
            streaming: true,
            messageId: data.messageId,
            timestamp: data.timestamp || Date.now(),
          },
        });
      } else {
        dispatchMessages({
          type: 'UPDATE_MESSAGE',
          payload: {
            messageId: data.messageId,
            updates: {
              content: data.content || '',
              streaming: !data.isComplete,
            },
          },
        });
      }

      if (data.isComplete) {
        streamingMessageIdsRef.current.delete(data.messageId);
        currentStreamingMessageIdRef.current = null;
        if (streamingTimeoutRef.current) {
          clearTimeout(streamingTimeoutRef.current);
          streamingTimeoutRef.current = null;
        }
        flushPendingToolMessages();
      }
    },
    [setLoaderState, generateMessageId, flushPendingToolMessages]
  );

  const handleToolCallStart = useCallback(
    (data: WebSocketMessage) => {
      const toolName = data.toolName || data.tool || 'tool';
      setLoaderState('mcp_request', `Working with ${toolName}...`);
    },
    [setLoaderState]
  );

  const handleMcpToolResult = useCallback(
    (data: WebSocketMessage) => {
      const toolName = data.toolName || data.tool || 'tool';
      if (data.error) {
        console.error('[MapAITools] MCP tool error:', data.error);
      }
      setLoaderState('mcp_processing', `Processing ${toolName} result...`);
    },
    [setLoaderState]
  );

  const handleToolCall = useCallback(
    async (data: WebSocketMessage) => {
      const toolName = data.tool || data.toolName;
      const parameters = data.parameters || data.data || {};
      const callId = data.callId || '';

      if (!toolName) {
        setLoaderState(null);
        return;
      }

      let stage: LoaderStage = 'executing';
      if (toolName === 'set-deck-state') {
        stage = 'creating';
      }
      setLoaderState(stage, `Executing ${toolName}...`);

      try {
        const result = await toolExecutorRef.current!(toolName, parameters);

        const toolMessage: Message = {
          id: generateMessageId(),
          type: 'tool',
          content: result.message,
          toolName,
          status: result.success ? 'success' : 'error',
          timestamp: Date.now(),
        };

        if (currentStreamingMessageIdRef.current) {
          pendingToolMessagesRef.current.push(toolMessage);
        } else {
          dispatchMessages({ type: 'ADD_MESSAGE', payload: toolMessage });
        }

        const currentLayers = deckStateRef.current.getDeckSpec().layers.filter((layer) => {
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

      setLoaderState(null);
    },
    [setLoaderState, generateMessageId, ws]
  );

  const handleToolResult = useCallback(
    (data: WebSocketMessage) => {
      if (data.success === false) {
        console.error('[MapAITools] Tool failed:', data.error || data.message);
      }
      setLoaderState(null);
    },
    [setLoaderState]
  );

  // Subscribe to WebSocket messages
  useEffect(() => {
    ws.onMessage.current = (data: WebSocketMessage) => {
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
          dispatchMessages({
            type: 'ADD_MESSAGE',
            payload: {
              type: 'error',
              content: data.content || 'Unknown error',
              timestamp: Date.now(),
            },
          });
          setLoaderState(null);
          break;
      }
    };
  }, [
    handleStreamChunk,
    handleToolCallStart,
    handleMcpToolResult,
    handleToolCall,
    handleToolResult,
    setLoaderState,
    ws,
  ]);

  const createInitialState = useCallback((): InitialState => {
    const currentState = deckStateRef.current;
    const state = {
      viewState: currentState.getViewState(),
      deckSpec: currentState.getDeckSpec(),
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
      activeLayerId: currentState.state.activeLayerId,
      cartoConfig: {
        connectionName: environment.connectionName,
        hasCredentials: !!environment.accessToken,
      },
    };
  }, []);

  const sendMessage = useCallback(
    (content: string): boolean => {
      if (!ws.isConnected) {
        return false;
      }

      dispatchMessages({
        type: 'ADD_MESSAGE',
        payload: { type: 'user', content, timestamp: Date.now() },
      });

      streamingMessageIdsRef.current.clear();
      pendingToolMessagesRef.current = [];
      currentStreamingMessageIdRef.current = null;
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
        streamingTimeoutRef.current = null;
      }

      setLoaderState('thinking', 'Thinking...');

      const initialState = createInitialState();
      ws.sendChatMessage(content, initialState);

      return true;
    },
    [ws, setLoaderState, createInitialState]
  );

  const clearMessages = useCallback(() => {
    dispatchMessages({ type: 'CLEAR' });
    streamingMessageIdsRef.current.clear();
    messageIdCounterRef.current = 0;
    pendingToolMessagesRef.current = [];
    currentStreamingMessageIdRef.current = null;
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current);
      streamingTimeoutRef.current = null;
    }
    setLoaderState(null);
  }, [setLoaderState]);

  const contextValue: MapAIToolsContextValue = {
    messages,
    loaderState,
    loaderMessage,
    layers,
    isConnected: ws.isConnected,
    sendMessage,
    clearMessages,
    registerMaskActions,
    registerWidgetActions,
  };

  return (
    <MapAIToolsContext.Provider value={contextValue}>{children}</MapAIToolsContext.Provider>
  );
}
