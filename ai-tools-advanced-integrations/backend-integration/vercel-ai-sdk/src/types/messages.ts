/**
 * Message types for WebSocket and HTTP communication
 */

import type { UserContext } from './user-context.js';

export type { UserContext } from './user-context.js';

/**
 * Initial map state sent with chat messages
 */
export interface InitialState {
  // View state - supports both naming conventions
  viewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
  };
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch?: number;
    bearing?: number;
  };

  // Layers
  layers?: Array<{
    id: string;
    type?: string;
    visible?: boolean;
    [key: string]: unknown;
  }>;

  // Active layer ID - the last created/modified layer
  // Used to track which layer to update when user doesn't specify
  activeLayerId?: string;

  // User context for business location analysis
  userContext?: UserContext;
}

/**
 * Client to Server message types
 */
export interface ChatMessage {
  type: 'chat_message';
  content: string;
  timestamp: number;
  initialState?: InitialState;
}

/**
 * Client to Server: Tool execution result from frontend
 */
export interface ToolResultMessage {
  type: 'tool_result';
  toolName: string;
  callId: string;
  success: boolean;
  message: string;
  error?: string;
  // Current layer state after tool execution - used to preserve context across turns
  layerState?: Array<{
    id: string;
    type: string;
    visible: boolean;
  }>;
}

/**
 * Server to Client message types
 */
export interface StreamChunk {
  type: 'stream_chunk';
  content: string;
  messageId: string;
  isComplete: boolean;
}

export interface ToolCallMessage {
  type: 'tool_call';
  toolName: string;
  data: unknown;
  callId: string;
  message?: string;
}

export interface ErrorMessage {
  type: 'error';
  content: string;
  code?: string;
}

export type ServerMessage = StreamChunk | ToolCallMessage | ErrorMessage;

/**
 * Conversation history message
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}
