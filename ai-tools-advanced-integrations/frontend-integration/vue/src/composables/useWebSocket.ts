/**
 * WebSocket Composable
 *
 * Handles WebSocket connection, message buffering, and auto-reconnect.
 * Singleton composable that replaces React's WebSocketContext.
 */

import { ref } from 'vue';
import type { WebSocketMessage, InitialState } from '../types/models';
import { environment } from '../config/environment';

export interface WebSocketComposable {
  isConnected: typeof isConnected;
  sendChatMessage: (content: string, initialState?: InitialState) => void;
  sendToolResult: (result: {
    toolName: string;
    callId: string;
    success: boolean;
    message: string;
    error?: string;
    layerState?: Array<{ id: string; type: string; visible: boolean }>;
  }) => void;
  onMessage: (callback: (data: WebSocketMessage) => void) => void;
}

// Module-scoped singleton state
let _instance: WebSocketComposable | null = null;

// Shared state
const isConnected = ref(false);
let wsRef: WebSocket | null = null;
const messageBufferRef = new Map<string, string>();
let reconnectAttemptsRef = 0;
const maxReconnectAttempts = 5;
const wsUrlRef = environment.wsUrl;
let messageCallback: ((data: WebSocketMessage) => void) | null = null;

function send(message: unknown) {
  if (wsRef?.readyState === WebSocket.OPEN) {
    wsRef.send(JSON.stringify(message));
  } else {
    console.error('[WebSocket] Not connected');
  }
}

function handleStreamChunk(data: WebSocketMessage) {
  if (!data.messageId) return;

  if (!messageBufferRef.has(data.messageId)) {
    messageBufferRef.set(data.messageId, '');
  }

  const currentContent = messageBufferRef.get(data.messageId) || '';
  messageBufferRef.set(data.messageId, currentContent + (data.content || ''));

  messageCallback?.({
    type: 'stream_chunk',
    messageId: data.messageId,
    content: messageBufferRef.get(data.messageId),
    isComplete: data.isComplete,
  });

  if (data.isComplete) {
    messageBufferRef.delete(data.messageId);
  }
}

function connect() {
  const url = wsUrlRef;

  try {
    const ws = new WebSocket(url);
    wsRef = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      reconnectAttemptsRef = 0;
      isConnected.value = true;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        if (data.type === 'stream_chunk') {
          handleStreamChunk(data);
        } else {
          messageCallback?.(data);
        }
      } catch (error) {
        console.error('[WebSocket] Parse error:', error);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      isConnected.value = false;

      // Auto-reconnect
      if (reconnectAttemptsRef < maxReconnectAttempts) {
        reconnectAttemptsRef++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttemptsRef),
          10000
        );
        console.log(
          `[WebSocket] Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef})`
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
    isConnected.value = false;
  }
}

function sendChatMessage(content: string, initialState?: InitialState) {
  send({
    type: 'chat_message',
    content,
    timestamp: Date.now(),
    initialState,
  });
}

function sendToolResult(result: {
  toolName: string;
  callId: string;
  success: boolean;
  message: string;
  error?: string;
  layerState?: Array<{ id: string; type: string; visible: boolean }>;
}) {
  send({
    type: 'tool_result',
    ...result,
  });
}

function onMessage(callback: (data: WebSocketMessage) => void) {
  messageCallback = callback;
}

export function useWebSocket(): WebSocketComposable {
  if (!_instance) {
    _instance = {
      isConnected,
      sendChatMessage,
      sendToolResult,
      onMessage,
    };
    // Initialize connection immediately
    connect();
  }
  return _instance;
}
