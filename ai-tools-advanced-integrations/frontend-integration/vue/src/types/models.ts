/**
 * Shared type definitions for the React frontend.
 * Ported from Angular's message.model.ts.
 */

import type { LegendData } from '../utils/legend';

export interface Message {
  type: 'user' | 'assistant' | 'action' | 'error' | 'system' | 'tool';
  content: string;
  streaming?: boolean;
  messageId?: string;
  id?: string;
  toolName?: string;
  status?: 'success' | 'error' | 'pending';
  timestamp?: number;
}

export interface WebSocketMessage {
  type:
    | 'chat_message'
    | 'stream_chunk'
    | 'tool_call'
    | 'tool_call_start'
    | 'mcp_tool_result'
    | 'custom_tool_result'
    | 'tool_result'
    | 'error'
    | 'welcome';
  content?: string;
  messageId?: string;
  isComplete?: boolean;
  tool?: string;
  toolName?: string;
  parameters?: unknown;
  data?: unknown;
  result?: unknown;
  callId?: string;
  timestamp?: number;
  success?: boolean;
  message?: string;
  error?: string;
}

export type LoaderStage =
  | 'thinking'
  | 'starting'
  | 'mcp_request'
  | 'mcp_processing'
  | 'enriching'
  | 'creating'
  | 'loading'
  | 'executing';

export type LoaderState = LoaderStage | null;

export interface LayerConfig {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  center?: { longitude: number; latitude: number; zoom?: number };
  legend?: LegendData;
}

export interface SnackbarConfig {
  message: string | null;
  type: 'error' | 'info' | 'success';
}

export interface InitialState {
  viewState: {
    longitude: number;
    latitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  layers: Array<{
    id: string;
    type: string;
    visible: boolean;
    styleContext?: {
      getFillColor?: unknown;
      filters?: unknown;
      updateTriggers?: unknown;
    };
  }>;
  activeLayerId?: string;
  cartoConfig: {
    connectionName: string;
    hasCredentials: boolean;
  };
}
