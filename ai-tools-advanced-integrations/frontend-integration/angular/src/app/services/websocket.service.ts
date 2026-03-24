/**
 * WebSocket Service
 *
 * Handles WebSocket connection and message handling.
 * Supports HTTP fallback mode for environments without WebSocket.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WebSocketMessage, InitialState } from '../models/message.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private messageBuffer = new Map<string, string>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private wsUrl: string = '';

  public isConnected$ = new BehaviorSubject<boolean>(false);
  public message$ = new Subject<WebSocketMessage>();

  constructor() {}

  /**
   * Connect to WebSocket server
   */
  connect(url?: string): void {
    this.wsUrl = url || environment.wsUrl;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.isConnected$.next(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.handleMessage(data);
        } catch (error) {
          console.error('[WebSocket] Parse error:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnected$.next(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.isConnected$.next(false);
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocketMessage): void {
    if (data.type === 'stream_chunk') {
      this.handleStreamChunk(data);
    } else {
      // Pass all other message types directly
      this.message$.next(data);
    }
  }

  /**
   * Handle stream chunks with message buffering
   */
  private handleStreamChunk(data: WebSocketMessage): void {
    if (!data.messageId) return;

    // Initialize buffer for new message
    if (!this.messageBuffer.has(data.messageId)) {
      this.messageBuffer.set(data.messageId, '');
    }

    // Accumulate content
    const currentContent = this.messageBuffer.get(data.messageId) || '';
    this.messageBuffer.set(data.messageId, currentContent + (data.content || ''));

    // Emit accumulated content
    this.message$.next({
      type: 'stream_chunk',
      messageId: data.messageId,
      content: this.messageBuffer.get(data.messageId),
      isComplete: data.isComplete
    });

    // Clean up buffer when complete
    if (data.isComplete) {
      this.messageBuffer.delete(data.messageId);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`[WebSocket] Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(this.wsUrl), delay);
    } else {
      console.error('[WebSocket] Max reconnection attempts reached');
    }
  }

  /**
   * Send a message through WebSocket
   */
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('[WebSocket] Not connected');
    }
  }

  /**
   * Send a chat message with initial state
   */
  sendChatMessage(content: string, initialState?: InitialState): void {
    this.send({
      type: 'chat_message',
      content,
      timestamp: Date.now(),
      initialState
    });
  }

  /**
   * Send a tool result back to the server
   */
  sendToolResult(result: {
    toolName: string;
    callId: string;
    success: boolean;
    message: string;
    error?: string;
    layerState?: Array<{
      id: string;
      type: string;
      visible: boolean;
    }>;
  }): void {
    this.send({
      type: 'tool_result',
      ...result
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected$.next(false);
  }
}
