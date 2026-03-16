/**
 * Express + WebSocket Server for OpenAI Agents SDK
 *
 * Provides both WebSocket (/ws) and HTTP (/api/chat) endpoints.
 * Speaks the same protocol as the Vercel AI SDK backend so the
 * Angular frontend works with either backend without changes.
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { runMapAgent } from './services/agent-runner.js';
import { ConversationManager } from './services/conversation-manager.js';
import { loadSemanticModel, getWelcomeMessage, getWelcomeChips } from './semantic/index.js';
import type { ChatMessage, ToolResultMessage } from './types/messages.js';
import type { Express } from 'express';

const app: Express = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const conversationManager = new ConversationManager();

// ============================================
// WebSocket Handler
// ============================================
const sessions = new Map<WebSocket, string>();

wss.on('connection', (ws) => {
  const sessionId = randomUUID();
  sessions.set(ws, sessionId);
  console.log(`[WS] New connection: ${sessionId}`);

  ws.on('message', async (data) => {
    try {
      const rawMessage = JSON.parse(data.toString()) as { type: string };
      const sid = sessions.get(ws);

      if (!sid) {
        console.error('[WS] No session ID found for connection');
        return;
      }

      if (rawMessage.type === 'chat_message') {
        const message = rawMessage as ChatMessage;
        const history = conversationManager.getHistory(sid);

        conversationManager.addMessage(sid, {
          role: 'user',
          content: message.content,
        });

        const response = await runMapAgent(
          message.content,
          ws,
          sid,
          history,
          message.initialState,
          (msg) => conversationManager.addMessage(sid, msg),
        );

        if (response) {
          conversationManager.addMessage(sid, response);
        }
      } else if (rawMessage.type === 'tool_result') {
        // Handle tool execution results from frontend
        const toolResult = rawMessage as ToolResultMessage;
        console.log(`[WS] Tool result received: ${toolResult.toolName} - ${toolResult.success ? 'success' : 'failed'}`);

        if (toolResult.success) {
          // Tool succeeded - add to conversation history so AI knows what exists
          let historyContent = `[Tool executed successfully: ${toolResult.toolName}] ${toolResult.message}`;

          // Include layer state in history for AI context across turns
          if (toolResult.layerState && toolResult.layerState.length > 0) {
            historyContent += `\n[Current layers on map: ${toolResult.layerState.map(l => `"${l.id}" (${l.type})`).join(', ')}]`;
          } else if (toolResult.layerState) {
            historyContent += `\n[No layers currently on map]`;
          }

          conversationManager.addMessage(sid, {
            role: 'assistant',
            content: historyContent,
          });
        } else {
          // Tool failed - send a correction message to inform the user
          const correctionMessage = `I apologize, but the ${toolResult.toolName} operation failed: ${toolResult.error || toolResult.message}`;

          // Add the failure to conversation history for context
          conversationManager.addMessage(sid, {
            role: 'assistant',
            content: `[Tool execution failed: ${toolResult.toolName}] ${toolResult.error || toolResult.message}`,
          });

          // Send correction as a stream chunk to the client
          const correctionId = `correction_${Date.now()}`;
          ws.send(
            JSON.stringify({
              type: 'stream_chunk',
              content: correctionMessage,
              messageId: correctionId,
              isComplete: false,
            })
          );
          ws.send(
            JSON.stringify({
              type: 'stream_chunk',
              content: '',
              messageId: correctionId,
              isComplete: true,
            })
          );
        }
      }
    } catch (error) {
      console.error('[WS] Error:', error);
      ws.send(
        JSON.stringify({
          type: 'error',
          content: 'Invalid message format',
        })
      );
    }
  });

  ws.on('close', () => {
    const sid = sessions.get(ws);
    if (sid) conversationManager.clearHistory(sid);
    sessions.delete(ws);
    console.log('[WS] Connection closed');
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
});

// ============================================
// HTTP/SSE Route
// ============================================
app.post('/api/chat', async (req, res) => {
  const { message, initialState } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Create a mock WebSocket-like interface for SSE
    const sseWriter = {
      send: (data: string) => {
        res.write(`data: ${data}\n\n`);
      },
    } as WebSocket;

    await runMapAgent(message, sseWriter, 'http-session', [], initialState);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const err = error as Error;
    res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    res.end();
  }
});

// Semantic config endpoint — provides welcome message and chips to the frontend
app.get('/api/semantic-config', (_req, res) => {
  const model = loadSemanticModel();
  if (!model) {
    res.json({ welcomeMessage: '', welcomeChips: [] });
    return;
  }
  res.json({
    welcomeMessage: getWelcomeMessage(model),
    welcomeChips: getWelcomeChips(model),
  });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    sdk: 'openai-agents',
    provider: 'carto',
    activeSessions: conversationManager.getActiveSessionCount(),
  });
});

// Start server
export function startServer(port: number = 3003): void {
  server.listen(port, () => {
    console.log(`[Server] OpenAI Agents SDK backend running on port ${port}`);
    console.log(`  WebSocket: ws://localhost:${port}/ws`);
    console.log(`  HTTP API:  http://localhost:${port}/api/chat`);
    console.log(`  Health:    http://localhost:${port}/health`);
  });
}

export { server, app };
