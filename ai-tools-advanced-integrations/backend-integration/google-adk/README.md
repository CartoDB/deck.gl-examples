# @carto/agentic-deckgl -- Google ADK Backend

> Express + WebSocket server using Google ADK (`@google/adk`) for streaming AI responses and tool calling. This is an **experimental** backend integration. Connects frontend applications to an OpenAI-compatible LLM endpoint via a custom `BaseLlm` bridge, with support for MCP tool servers and CARTO LDS geocoding.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [CartoLiteLlm Bridge](#cartolitellm-bridge)
- [Agent Runner](#agent-runner)
- [Tool System](#tool-system)
- [System Prompt](#system-prompt)
- [Semantic Layer](#semantic-layer)
- [Session Management](#session-management)
- [Endpoints](#endpoints)

---

## Getting Started

### Prerequisites

- Node.js v22+
- npm
- A CARTO AI API key and endpoint (OpenAI-compatible)

### Installation

```bash
npm install --force    # --force needed for peer dependency conflicts
```

### Environment Setup

Copy the example file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required: LLM provider (OpenAI-compatible endpoint)
CARTO_AI_API_BASE_URL=https://your-endpoint.example.com/v1
CARTO_AI_API_KEY=your-api-key
CARTO_AI_API_MODEL=gpt-4o

# Optional: server port (default: 3003)
PORT=3003

# Optional: MCP server for additional tools
CARTO_MCP_URL=https://your-mcp-server.com/mcp
CARTO_MCP_API_KEY=your-mcp-api-key
MCP_WHITELIST_CARTO=tool1,tool2

# Optional: CARTO LDS geocoding
CARTO_LDS_API_BASE_URL=https://gcp-us-east1.api.carto.com/v3/lds/geocoding/geocode
CARTO_LDS_API_KEY=your-lds-api-key
```

### Environment Variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `CARTO_AI_API_BASE_URL` | Yes | OpenAI-compatible LLM endpoint URL |
| `CARTO_AI_API_KEY` | Yes | API key for the LLM endpoint |
| `CARTO_AI_API_MODEL` | No | Model name (default: `gpt-4o`) |
| `PORT` | No | Server port (default: `3003`) |
| `CARTO_MCP_URL` | No | MCP server URL for remote tools |
| `CARTO_MCP_API_KEY` | No | MCP server API key |
| `MCP_WHITELIST_CARTO` | No | Comma-separated list of MCP tools to include (all if unset) |
| `CARTO_LDS_API_BASE_URL` | No | CARTO LDS geocoding endpoint |
| `CARTO_LDS_API_KEY` | No | CARTO LDS API key |

### Running

```bash
# Development with hot reload
npm run dev     # http://localhost:3003

# Production
npm run build && npm start
```

### Development Commands

```bash
npm run dev        # Start with tsx watch (hot reload)
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled production build
npm run typecheck  # Type check without emitting
npm run poc        # Run ADK prototype script
npm run poc:stream # Run ADK streaming prototype script
```

---

## Project Structure

```text
src/
+-- index.ts                        # Entry point: validates credentials, initializes MCP, starts server
+-- server.ts                       # Express + WebSocket server, session management
|
+-- models/
|   +-- carto-litellm.ts            # CartoLiteLlm: BaseLlm bridge (ADK <-> OpenAI Chat Completions)
|
+-- agent/
|   +-- providers.ts                # CartoLiteLlm lazy singleton
|   +-- tools.ts                    # Tool aggregation: local + custom + MCP (with isFrontendToolResult)
|   +-- custom-tools.ts             # Backend-only tools (LDS geocoding)
|   +-- mcp-tools.ts                # MCP server integration and tool conversion
|
+-- services/
|   +-- agent-runner.ts             # LlmAgent + InMemoryRunner orchestration with streaming
|   +-- conversation-manager.ts     # Per-session conversation history (max 20 messages)
|   +-- mcp-client.ts               # MCP client management
|   +-- utils.ts                    # Sanitize malformed keys, strip credentials
|
+-- prompts/
|   +-- system-prompt.ts            # System prompt builder (delegates to library + adds semantic)
|   +-- custom-prompt.ts            # Application-specific AI instructions and guardrails
|
+-- semantic/
|   +-- index.ts                    # Public API exports
|   +-- schema.ts                   # Zod schemas for semantic model validation
|   +-- loader.ts                   # YAML loader + markdown renderer
|   +-- layers/
|       +-- counties.yaml           # Example semantic layer definition
|       +-- h3-spatial-features.yaml
|
+-- types/
    +-- messages.ts                 # WebSocket message type definitions
    +-- user-context.ts             # User analysis context types
```

---

## Architecture

```text
Client (WebSocket or HTTP)
         |
    server.ts
    (Express + WS)
         |
    agent-runner.ts
    (LlmAgent + InMemoryRunner)
         |
    +-----------+-----------+
    |           |           |
providers.ts  tools.ts   system-prompt.ts
(CartoLiteLlm (tool      (prompt builder)
 singleton)    aggregation)
    |          |
    |   +---------+---------+
    |   |         |         |
    | local    custom     MCP
    | tools    tools      tools
    | (from    (geocode)  (remote
    | library)            servers)
    |
 models/carto-litellm.ts
 (BaseLlm -> OpenAI Chat Completions)
```

### Request Flow

1. **Client connects** via WebSocket (`/ws`) or sends HTTP POST (`/api/chat`)
2. **Server creates session** with a `ConversationManager` for history tracking
3. **User sends message** with current map state (`initialState`)
4. **Server builds system prompt** using `buildSystemPrompt()` from `@carto/agentic-deckgl` plus semantic context and custom instructions
5. **Agent runner** creates an `LlmAgent` with tools and uses `InMemoryRunner.runAsync()` with `StreamingMode.SSE`
6. **ADK handles the tool loop internally** -- unlike the other backends, there is no manual tool loop
7. **Streaming events** contain `Content.parts[]` with text, functionCall, or functionResponse
   - Text chunks are streamed back to the client (deltas computed from accumulated text)
   - `set-deck-state` tool calls are forwarded to the frontend for execution
   - Backend-only tools (geocoding) are executed server-side
   - MCP tool calls are forwarded to the MCP server
8. **Frontend executes tool** and sends result back
9. **Agent continues** until the AI is done

---

## CartoLiteLlm Bridge

The `CartoLiteLlm` class (`models/carto-litellm.ts`) extends ADK's `BaseLlm` to bridge ADK's `Content/Part` format with OpenAI's Chat Completions API. This is needed because ADK natively expects Google Gemini, but this project uses an OpenAI-compatible LiteLLM proxy.

Key responsibilities:

- **ADK Content[] to OpenAI messages** -- Converts ADK's flat `Part[]` arrays into OpenAI's structured message format (multiple `functionCalls` become a single assistant message with `tool_calls[]`, each `functionResponse` becomes a separate tool message)
- **FunctionDeclarations to OpenAI tools** -- Converts Google schema types (`OBJECT`, `STRING`, etc.) to JSON Schema for the Chat Completions API
- **Tool call ID round-tripping** -- Maintains a `toolCallIdMap` to track the mapping between ADK-generated function call IDs and OpenAI's `tool_call_id` values
- **Streaming and non-streaming** -- Supports both modes, yielding `LlmResponse` objects with `partial`/`turnComplete` flags
- **Google schema type conversion** -- Maps Google's type enum (`OBJECT`, `STRING`, `NUMBER`, `INTEGER`, `BOOLEAN`, `ARRAY`) to JSON Schema types

---

## Agent Runner

The agent runner (`services/agent-runner.ts`) orchestrates the AI interaction using ADK's `LlmAgent` + `InMemoryRunner`:

- Creates an `LlmAgent` with system prompt, model (`CartoLiteLlm`), and tools
- Uses `InMemoryRunner.runAsync()` with `StreamingMode.SSE` for streaming
- ADK handles the tool execution loop internally (no manual tool loop needed)
- Key differences from other backends:
  - **Accumulated text, not deltas** -- ADK sends accumulated text in events; the runner computes deltas by tracking `lastTextLength`
  - **Content.parts[] events** -- Events contain `text`, `functionCall`, or `functionResponse` parts
  - **`isFrontendToolResult()`** -- Works on objects directly (no `JSON.parse` needed, unlike OpenAI Agents SDK's `parseFrontendToolResult`)
  - **Conversation history as context prefix** -- Conversation history is embedded as a context prefix in the user message
- Sanitizes malformed keys and strips credentials before forwarding to the frontend

### MCP Table Name Caching

When an MCP async workflow completes (`async_workflow_job_get_results`), the agent runner extracts the `workflowOutputTableName` from the tool call input parameters. This table name identifies where the MCP workflow stored its output in CARTO.

The table name is stored in conversation history with a `[MCP Result Table Available]` marker:
> `[MCP Result Table Available] The MCP workflow result is stored in table "<table>". When the user asks to filter or mask by this area, call set-mask-layer { action: "set", tableName: "<table>" }.`

When the user later asks to "filter by this area" or "mask the map to this region", the AI retrieves the cached table name and calls `set-mask-layer { action: "set", tableName: "<table>" }`. The frontend fetches the geometry directly from the CARTO table via `vectorTableSource`.

The agent runner also extracts coordinates from the MCP result (via `extractCoordinatesFromMcpResult()`) for centering the map. If the LLM fails to add a layer with the MCP table, a fallback `VectorTileLayer` is auto-injected.

---

## Tool System

Tools are aggregated from three sources in `agent/tools.ts`:

### Local Tools (from `@carto/agentic-deckgl`)

The consolidated tools (`set-deck-state`, `set-marker`, `set-mask-layer`) are imported from the core library and converted to Google ADK format using `getToolsForGoogleADK()`. Unlike the OpenAI Agents SDK backend, no `zodV4ToJsonSchema()` workaround is needed -- ADK handles Zod schemas natively.

### Custom Tools (`agent/custom-tools.ts`)

Backend-only tools that execute server-side:

- **`lds-geocode`** -- CARTO LDS Geocoding. Converts addresses, cities, or landmarks to latitude/longitude coordinates. Only available when `CARTO_LDS_API_BASE_URL` and `CARTO_LDS_API_KEY` are configured.

### MCP Tools (`agent/mcp-tools.ts`)

Remote tools from MCP (Model Context Protocol) servers. Configured via environment variables. Tool definitions are fetched from the MCP server at startup and converted to Google ADK format.

The `MCP_WHITELIST_CARTO` variable filters which tools are available. MCP tool results are executed server-side and sent to the frontend via `mcp_tool_result` messages.

---

## System Prompt

The system prompt is built in two layers:

### Library Prompt (`@carto/agentic-deckgl`)

`buildSystemPrompt()` generates the base prompt with:

- Tool-specific instructions (how to use `set-deck-state`, `set-marker`, and `set-mask-layer`)
- Current map state (camera position, active layers)
- User context (country, business type)
- MCP instructions (if MCP tools are available)
- Mask layer instructions (geometry caching, trigger phrases, no-fabrication rules)

### Custom Prompt (`prompts/custom-prompt.ts`)

Application-specific instructions appended to the library prompt:

- SQL limitations (no SQL tool available in this integration)
- Table name format (Databricks FQN with backticks)
- Security guardrails (spatial analysis only)
- Agent behavior rules (no loops, no self-responses)
- Layer styling guidance
- Geocoding workflow sequence (`lds-geocode -> set-deck-state -> MCP tool`)

---

## Semantic Layer

The semantic layer provides the AI with structured knowledge about available data sources. It acts as a data catalog injected into the system prompt.

Semantic layers are defined in YAML files under `semantic/layers/`. See the [Vercel AI SDK README](../vercel-ai-sdk/README.md#semantic-layer) for the full YAML schema and loader function reference -- the semantic layer implementation is identical across all backends.

---

## Session Management

The `ConversationManager` (`services/conversation-manager.ts`) handles per-session state:

- Maintains conversation history up to **20 messages**
- Preserves the first message (context) and trims from the middle when pruning
- Each WebSocket connection gets its own session
- Sessions are cleaned up on disconnect

Additionally, ADK's `InMemoryRunner.sessionService` manages per-request ADK sessions alongside the conversation manager.

---

## Endpoints

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/ws` | WebSocket | Primary communication channel (streaming + tool calls) |
| `/api/chat` | POST | HTTP SSE fallback for environments without WebSocket |
| `/health` | GET | Health check |
| `/api/semantic-config` | GET | Returns semantic layer configuration (welcome message, chips) |
