/**
 * Map AI Tools Orchestrator
 *
 * Central orchestration of WebSocket communication, message state,
 * tool execution, and loader state management.
 * Port of Angular's MapAIToolsService.
 */

import { EventEmitter } from '../state/event-emitter.js';
import { extractLegendFromLayer } from '../utils/legend.js';

export class MapAIToolsOrchestrator extends EventEmitter {
  constructor(wsClient, toolExecutor, deckState, environment) {
    super();
    this._wsClient = wsClient;
    this._toolExecutor = toolExecutor;
    this._deckState = deckState;
    this._environment = environment;

    // Message state
    this._messages = [];
    this._loaderState = null;
    this._loaderMessage = '';
    this._layerConfigs = [];

    // Streaming state
    this._streamingMessageIds = new Set();
    this._messageIdCounter = 0;
    this._pendingToolMessages = [];
    this._currentStreamingMessageId = null;
    this._streamingTimeout = null;
    this._STREAMING_TIMEOUT_MS = 30000;

    // Subscribe to deck state layers for legend extraction
    this._deckState.on('change', ({ state, changedKeys }) => {
      if (changedKeys.includes('layers')) {
        this._updateLayerConfigs(state.deckSpec.layers);
      }
    });
  }

  connect(wsUrl) {
    this._wsClient.connect(wsUrl);

    this._wsClient.on('message', (data) => this._handleMessage(data));
    this._wsClient.on('connected', (isConnected) => {
      this.emit('connected', isConnected);
    });
  }

  isConnected() {
    return this._wsClient.isConnected;
  }

  getLayerConfigs() {
    return this._layerConfigs;
  }

  sendMessage(content) {
    if (!this._wsClient.isConnected) {
      return false;
    }

    this._addMessage({ type: 'user', content, timestamp: Date.now() });

    // Reset streaming state
    this._streamingMessageIds.clear();
    this._pendingToolMessages = [];
    this._currentStreamingMessageId = null;
    if (this._streamingTimeout) {
      clearTimeout(this._streamingTimeout);
      this._streamingTimeout = null;
    }

    this._setLoaderState('thinking', 'Thinking...');

    const initialState = this._createInitialState();
    this._wsClient.sendChatMessage(content, initialState);

    return true;
  }

  clearMessages() {
    this._messages = [];
    this._streamingMessageIds.clear();
    this._messageIdCounter = 0;
    this._pendingToolMessages = [];
    this._currentStreamingMessageId = null;
    if (this._streamingTimeout) {
      clearTimeout(this._streamingTimeout);
      this._streamingTimeout = null;
    }
    this._setLoaderState(null);
    this.emit('messages', []);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  _createInitialState() {
    const state = this._deckState.getState();

    return {
      viewState: {
        longitude: state.deckSpec.initialViewState.longitude ?? 0,
        latitude: state.deckSpec.initialViewState.latitude ?? 0,
        zoom: state.deckSpec.initialViewState.zoom ?? 3,
        pitch: state.deckSpec.initialViewState.pitch ?? 0,
        bearing: state.deckSpec.initialViewState.bearing ?? 0,
      },
      layers: state.deckSpec.layers.filter((layer) => {
        const id = layer['id'] || '';
        return !id.startsWith('__');
      }).map((layer) => {
        const baseInfo = {
          id: layer['id'] || 'unknown',
          type: layer['@@type'] || 'Unknown',
          visible: layer['visible'] !== false,
        };

        const styleContext = {};
        const fillColor = layer['getFillColor'];
        if (fillColor && typeof fillColor === 'object') {
          styleContext.getFillColor = fillColor;
        }
        const lineColor = layer['getLineColor'];
        if (lineColor && typeof lineColor === 'object') {
          styleContext.getLineColor = lineColor;
        }
        const data = layer['data'];
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
      activeLayerId: state.activeLayerId,
      cartoConfig: {
        connectionName: this._environment.connectionName,
        hasCredentials: !!this._environment.accessToken,
      },
    };
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'stream_chunk':
        this._handleStreamChunk(data);
        break;
      case 'tool_call_start':
        this._handleToolCallStart(data);
        break;
      case 'mcp_tool_result':
        this._handleMcpToolResult(data);
        break;
      case 'tool_call':
        this._handleToolCall(data);
        break;
      case 'tool_result':
        this._handleToolResult(data);
        break;
      case 'error':
        this._addMessage({
          type: 'error',
          content: data.content || 'Unknown error',
          timestamp: Date.now(),
        });
        this._setLoaderState(null);
        break;
    }
  }

  _handleStreamChunk(data) {
    if (!data.messageId) return;

    const isNewMessage = !this._streamingMessageIds.has(data.messageId);

    if (isNewMessage) {
      this._setLoaderState(null);
    }

    // Skip empty completion chunks
    if (data.isComplete && !data.content) {
      this._updateMessage(data.messageId, { streaming: false });
      this._currentStreamingMessageId = null;
      if (this._streamingTimeout) {
        clearTimeout(this._streamingTimeout);
        this._streamingTimeout = null;
      }
      this._flushPendingToolMessages();
      return;
    }

    if (isNewMessage) {
      this._currentStreamingMessageId = data.messageId;

      if (this._streamingTimeout) {
        clearTimeout(this._streamingTimeout);
      }
      this._streamingTimeout = setTimeout(() => {
        this._currentStreamingMessageId = null;
        this._streamingTimeout = null;
        this._flushPendingToolMessages();
      }, this._STREAMING_TIMEOUT_MS);

      this._streamingMessageIds.add(data.messageId);
      this._addMessage({
        type: 'assistant',
        content: data.content || '',
        streaming: true,
        messageId: data.messageId,
        timestamp: data.timestamp || Date.now(),
      });
    } else {
      this._updateMessage(data.messageId, {
        content: data.content || '',
        streaming: !data.isComplete,
      });
    }

    if (data.isComplete) {
      this._streamingMessageIds.delete(data.messageId);
      this._currentStreamingMessageId = null;
      if (this._streamingTimeout) {
        clearTimeout(this._streamingTimeout);
        this._streamingTimeout = null;
      }
      this._flushPendingToolMessages();
    }
  }

  _flushPendingToolMessages() {
    if (this._pendingToolMessages.length === 0) return;
    this._messages = [...this._messages, ...this._pendingToolMessages];
    this._pendingToolMessages = [];
    this.emit('messages', [...this._messages]);
  }

  _handleToolCallStart(data) {
    const toolName = data.toolName || data.tool || 'tool';
    this._setLoaderState('mcp_request', `Working with ${toolName}...`);
  }

  _handleMcpToolResult(data) {
    const toolName = data.toolName || data.tool || 'tool';
    if (data.error) {
      console.error('[MapAIToolsOrchestrator] MCP tool error:', data.error);
    }
    this._setLoaderState('mcp_processing', `Processing ${toolName} result...`);
  }

  async _handleToolCall(data) {
    const toolName = data.tool || data.toolName;
    const parameters = data.parameters || data.data || {};
    const callId = data.callId || '';

    if (!toolName) {
      this.emit('error', 'No tool name provided');
      this._setLoaderState(null);
      return;
    }

    let stage = 'executing';
    if (toolName === 'set-deck-state') {
      stage = 'creating';
    }
    this._setLoaderState(stage, `Executing ${toolName}...`);

    try {
      const result = await this._toolExecutor.execute(toolName, parameters);

      const toolMessage = {
        id: this._generateMessageId(),
        type: 'tool',
        content: result.message,
        toolName,
        status: result.success ? 'success' : 'error',
        timestamp: Date.now(),
      };

      if (this._currentStreamingMessageId) {
        this._pendingToolMessages.push(toolMessage);
      } else {
        this._addMessage(toolMessage);
      }

      // Get current layer state for context preservation
      const currentLayers = this._deckState.getLayers().filter((layer) => {
        const id = layer['id'] || '';
        return !id.startsWith('__');
      }).map((layer) => ({
        id: layer['id'] || 'unknown',
        type: layer['@@type'] || 'Unknown',
        visible: layer['visible'] !== false,
      }));

      this._wsClient.sendToolResult({
        toolName,
        callId,
        success: result.success,
        message: result.message,
        error: result.error?.message,
        layerState: currentLayers,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', `Tool execution error: ${errorMessage}`);

      this._wsClient.sendToolResult({
        toolName,
        callId,
        success: false,
        message: `Execution error: ${errorMessage}`,
        error: errorMessage,
      });
    }

    this._setLoaderState(null);
  }

  _handleToolResult(data) {
    if (data.success === false) {
      this.emit('error', data.error || data.message || 'Tool execution failed');
    }
    this._setLoaderState(null);
  }

  _setLoaderState(state, message) {
    this._loaderState = state;
    this._loaderMessage = message || '';
    this.emit('loaderState', { state, message: message || '' });
  }

  _generateMessageId() {
    return `local_${Date.now()}_${this._messageIdCounter++}`;
  }

  _addMessage(msg) {
    const newMessage = {
      id: msg.id || this._generateMessageId(),
      type: msg.type || 'assistant',
      content: msg.content || '',
      streaming: msg.streaming,
      messageId: msg.messageId,
      toolName: msg.toolName,
      status: msg.status,
      timestamp: msg.timestamp || Date.now(),
    };
    this._messages = [...this._messages, newMessage];
    this.emit('messages', [...this._messages]);
  }

  _updateMessage(messageId, updates) {
    this._messages = this._messages.map((msg) =>
      msg.messageId === messageId ? { ...msg, ...updates } : msg
    );
    this.emit('messages', [...this._messages]);
  }

  _updateLayerConfigs(layers) {
    // Filter out system layers (__ prefix) from UI layer toggle
    const userLayers = layers.filter((layer) => {
      const id = layer['id'] || '';
      return !id.startsWith('__');
    });
    const layerConfigs = userLayers.map((layer) => {
      const id = layer['id'] || 'unknown';
      let color = '#036fe2';

      const legend = extractLegendFromLayer(layer);

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

      const center = this._deckState.getLayerCenter(id);

      return {
        id,
        name: id,
        color,
        visible: layer['visible'] !== false,
        center,
        legend,
      };
    });

    this._layerConfigs = layerConfigs;
    this.emit('layers', layerConfigs);
  }
}
