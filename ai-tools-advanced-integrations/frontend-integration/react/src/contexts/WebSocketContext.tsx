/**
 * WebSocket Context
 *
 * Handles WebSocket connection, message buffering, and auto-reconnect.
 * Replaces Angular's WebSocketService with React Context.
 */

import React, {
  createContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { WebSocketMessage, InitialState } from '../types/models';
import { environment } from '../config/environment';

export interface WebSocketContextValue {
  isConnected: boolean;
  sendChatMessage: (content: string, initialState?: InitialState) => void;
  sendToolResult: (result: {
    toolName: string;
    callId: string;
    success: boolean;
    message: string;
    error?: string;
    layerState?: Array<{ id: string; type: string; visible: boolean }>;
  }) => void;
  onMessage: React.MutableRefObject<((data: WebSocketMessage) => void) | null>;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messageBufferRef = useRef(new Map<string, string>());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const wsUrlRef = useRef(environment.wsUrl);
  const onMessage = useRef<((data: WebSocketMessage) => void) | null>(null);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('[WebSocket] Not connected');
    }
  }, []);

  const handleStreamChunk = useCallback((data: WebSocketMessage) => {
    if (!data.messageId) return;

    if (!messageBufferRef.current.has(data.messageId)) {
      messageBufferRef.current.set(data.messageId, '');
    }

    const currentContent = messageBufferRef.current.get(data.messageId) || '';
    messageBufferRef.current.set(data.messageId, currentContent + (data.content || ''));

    onMessage.current?.({
      type: 'stream_chunk',
      messageId: data.messageId,
      content: messageBufferRef.current.get(data.messageId),
      isComplete: data.isComplete,
    });

    if (data.isComplete) {
      messageBufferRef.current.delete(data.messageId);
    }
  }, []);

  const connect = useCallback(() => {
    const url = wsUrlRef.current;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          if (data.type === 'stream_chunk') {
            handleStreamChunk(data);
          } else {
            onMessage.current?.(data);
          }
        } catch (error) {
          console.error('[WebSocket] Parse error:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);

        // Auto-reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            10000
          );
          console.log(
            `[WebSocket] Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current})`
          );
          setTimeout(connect, delay);
        } else {
          console.error('[WebSocket] Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setIsConnected(false);
    }
  }, [handleStreamChunk]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendChatMessage = useCallback(
    (content: string, initialState?: InitialState) => {
      send({
        type: 'chat_message',
        content,
        timestamp: Date.now(),
        initialState,
      });
    },
    [send]
  );

  const sendToolResult = useCallback(
    (result: {
      toolName: string;
      callId: string;
      success: boolean;
      message: string;
      error?: string;
      layerState?: Array<{ id: string; type: string; visible: boolean }>;
    }) => {
      send({
        type: 'tool_result',
        ...result,
      });
    },
    [send]
  );

  const contextValue: WebSocketContextValue = {
    isConnected,
    sendChatMessage,
    sendToolResult,
    onMessage,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>
  );
}
