# Backend Integrations

> Server implementations that connect frontend applications to AI models using `@carto/agentic-deckgl`. Each backend handles WebSocket/HTTP communication, tool orchestration, session management, and semantic context injection.

## Available Integrations

| Integration | SDK | Directory | Documentation |
| ----------- | --- | --------- | ------------- |
| Vercel AI SDK | v6 | [vercel-ai-sdk/](vercel-ai-sdk/) | [README](vercel-ai-sdk/README.md) |
| OpenAI Agents SDK | @openai/agents | [openai-agents-sdk/](openai-agents-sdk/) | [README](openai-agents-sdk/README.md) |
| Google ADK | @google/adk | [google-adk/](google-adk/) | [README](google-adk/README.md) |

All three backends speak the same WebSocket protocol, so any frontend works with any backend without changes.

---

## Shared Responsibilities

Every backend integration must handle the following:

### WebSocket / HTTP Server

- Accept client connections via WebSocket (`/ws`) or HTTP SSE (`/api/chat`)
- Route incoming messages (chat messages, tool results)
- Stream responses back to the frontend (text chunks, tool calls, errors)

### Tool Orchestration

- Import tool definitions from `@carto/agentic-deckgl`
- Configure an AI provider (OpenAI-compatible endpoint)
- Run a tool-calling loop: send messages to the AI, receive tool calls, forward them to the frontend, collect results, and continue the loop
- Optionally add backend-only tools (e.g., geocoding) that execute server-side

### Session Management

- Maintain per-session conversation history
- Prune old messages to stay within context limits
- Track tool call state across the streaming loop

### System Prompt

- Use `buildSystemPrompt()` from `@carto/agentic-deckgl` to generate the base prompt
- Inject semantic context (data catalog) describing available tables and columns
- Add application-specific instructions and guardrails

### Semantic Layer

- Load YAML-based data catalogs (GeoCubes) describing available data sources
- Render them as markdown and inject into the system prompt
- Expose semantic configuration to frontends via HTTP endpoint

---

## WebSocket Message Protocol

All backend integrations use the same message protocol for frontend communication.

### Client to Server

```typescript
// User sends a chat message with current map state
{ type: 'chat_message', content: string, timestamp: number, initialState?: InitialState }

// Frontend reports tool execution result
{ type: 'tool_result', toolName: string, callId: string, success: boolean, message: string, layerState?: LayerSpec[] }
```

### Server to Client

```typescript
// Streaming text response from the AI
{ type: 'stream_chunk', content: string, messageId: string, isComplete: boolean }

// Tool call to be executed on the frontend
{ type: 'tool_call_start', toolName: string, callId: string }
{ type: 'tool_call', toolName: string, data: object, callId: string }

// Result from an MCP tool executed server-side
{ type: 'mcp_tool_result', toolName: string, result: unknown, callId: string }

// Error
{ type: 'error', content: string, code?: string }
```

---

## Adding a New Backend Integration

To add a new backend integration:

1. Create a new directory under `examples/backend/` (e.g., `examples/backend/openai-agents-sdk/`)
2. Import tools from `@carto/agentic-deckgl` using the appropriate converter:

   ```typescript
   // Vercel AI SDK
   import { getToolsRecordForVercelAI } from '@carto/agentic-deckgl';

   // OpenAI Agents SDK
   import { getToolsForOpenAIAgents } from '@carto/agentic-deckgl';

   // Google ADK
   import { getToolsForGoogleADK } from '@carto/agentic-deckgl';
   ```

3. Implement the WebSocket message protocol described above
4. Use `buildSystemPrompt()` for system prompt generation
5. Add a README documenting the integration-specific setup
