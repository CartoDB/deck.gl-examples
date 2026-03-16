/**
 * WebSocket Client
 *
 * Handles WebSocket connection and message handling.
 * Port of Angular's WebSocketService using EventEmitter.
 */

import { EventEmitter } from '../state/event-emitter.js';
import { environment } from '../config/environment.js';

export class WebSocketClient extends EventEmitter {
  constructor() {
    super();
    this._ws = null;
    this._messageBuffer = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._wsUrl = '';
    this._connected = false;
  }

  get isConnected() {
    return this._connected;
  }

  connect(url) {
    this._wsUrl = url || environment.wsUrl;

    try {
      this._ws = new WebSocket(this._wsUrl);

      this._ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this._reconnectAttempts = 0;
        this._connected = true;
        this.emit('connected', true);
      };

      this._ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this._handleMessage(data);
        } catch (error) {
          console.error('[WebSocket] Parse error:', error);
        }
      };

      this._ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this._connected = false;
        this.emit('connected', false);
        this._attemptReconnect();
      };

      this._ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this._connected = false;
      this.emit('connected', false);
    }
  }

  _handleMessage(data) {
    if (data.type === 'stream_chunk') {
      this._handleStreamChunk(data);
    } else {
      this.emit('message', data);
    }
  }

  _handleStreamChunk(data) {
    if (!data.messageId) return;

    if (!this._messageBuffer.has(data.messageId)) {
      this._messageBuffer.set(data.messageId, '');
    }

    const currentContent = this._messageBuffer.get(data.messageId) || '';
    this._messageBuffer.set(data.messageId, currentContent + (data.content || ''));

    this.emit('message', {
      type: 'stream_chunk',
      messageId: data.messageId,
      content: this._messageBuffer.get(data.messageId),
      isComplete: data.isComplete,
    });

    if (data.isComplete) {
      this._messageBuffer.delete(data.messageId);
    }
  }

  _attemptReconnect() {
    if (this._reconnectAttempts < this._maxReconnectAttempts) {
      this._reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 10000);
      console.log(
        `[WebSocket] Reconnecting in ${delay}ms... (attempt ${this._reconnectAttempts})`
      );
      setTimeout(() => this.connect(this._wsUrl), delay);
    } else {
      console.error('[WebSocket] Max reconnection attempts reached');
    }
  }

  send(message) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(message));
    } else {
      console.error('[WebSocket] Not connected');
    }
  }

  sendChatMessage(content, initialState) {
    this.send({
      type: 'chat_message',
      content,
      timestamp: Date.now(),
      initialState,
    });
  }

  sendToolResult(result) {
    this.send({
      type: 'tool_result',
      ...result,
    });
  }

  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
    this.emit('connected', false);
  }
}
