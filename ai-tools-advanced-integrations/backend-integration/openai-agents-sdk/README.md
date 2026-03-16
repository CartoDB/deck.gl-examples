# @carto/agentic-deckgl -- OpenAI Agents SDK Backend

> Express + WebSocket server using the OpenAI Agents SDK (`@openai/agents`) for streaming AI responses and tool calling. This is the **default and recommended** backend. Connects frontend applications to an OpenAI-compatible LLM endpoint with support for MCP tool servers and CARTO LDS geocoding.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Agent Runner](#agent-runner)
- [Tool System](#tool-system)
- [System Prompt](#system-prompt)
- [Semantic Layer](#semantic-layer)
- [Session Management](#session-management)
- [Endpoints](#endpoints)
- [Testing](#testing)

---

## Getting Started

### Prerequisites

- Node.js v22+
- npm
- A CARTO AI API key and endpoint (OpenAI-compatible)

### Installation

```bash
npm install
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
| `MCP_MOCK_MODE` | No | Use fixture-backed MCP tools for testing |

### Running

```bash
# Development with hot reload
npm run dev     # http://localhost:3003

# Development with MCP mock mode (fixture-backed tools)
npm run dev:mock-mcp

# Production
npm run build && npm start
```

### Development Commands

```bash
npm run dev          # Start with tsx watch (hot reload)
npm run dev:mock-mcp # Start with MCP mock mode
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production build
npm run typecheck    # Type check without emitting
npm test             # Run unit tests (Vitest)
```

---

## Project Structure

```text
src/
+-- index.ts                        # Entry point: validates credentials, initializes MCP, starts server
+-- server.ts                       # Express + WebSocket server, session management
|
+-- agent/
|   +-- providers.ts                # OpenAI client + setDefaultOpenAIClient + OpenAIChatCompletionsModel
|   +-- tools.ts                    # Tool aggregation: local + custom + MCP (with parseFrontendToolResult)
|   +-- custom-tools.ts             # Backend-only tools (LDS geocoding)
|   +-- mcp-tools.ts                # MCP server integration and tool conversion
|   +-- mcp-mock-fixtures.ts        # MCP mock fixtures for testing
|
+-- services/
|   +-- agent-runner.ts             # Agent + run() orchestration with streaming
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

tests/
+-- unit/
    +-- agent/                      # Provider and tool tests
    +-- services/                   # Agent runner, conversation manager, MCP client, utils tests
    +-- prompts/                    # System prompt builder tests
    +-- semantic/                   # Semantic model loading and validation tests
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
    (Agent + run() streaming)
         |
    +-----------+-----------+
    |           |           |
providers.ts  tools.ts   system-prompt.ts
(OpenAI       (tool      (prompt builder)
 client +      aggregation)
 model)        |
    +---------+---------+
    |         |         |
  local    custom     MCP
  tools    tools      tools
  (from    (geocode)  (remote
  library)            servers)
```

### Request Flow

1. **Client connects** via WebSocket (`/ws`) or sends HTTP POST (`/api/chat`)
2. **Server creates session** with a `ConversationManager` for history tracking
3. **User sends message** with current map state (`initialState`)
4. **Server builds system prompt** using `buildSystemPrompt()` from `@carto/agentic-deckgl` plus semantic context and custom instructions
5. **Agent runner** creates an `Agent` with tools and calls `run()` with streaming enabled
6. **Streaming loop**: processes `RunItemStreamEvent` and `RunRawModelStreamEvent` events
   - Text chunks are streamed back to the client
   - `set-deck-state` tool calls are forwarded to the frontend for execution
   - Backend-only tools (geocoding) are executed server-side
   - MCP tool calls are forwarded to the MCP server
7. **Frontend executes tool** and sends result back
8. **Agent runner** continues the loop with tool results until the AI is done

---

## Agent Runner

The agent runner (`services/agent-runner.ts`) orchestrates the AI interaction using the OpenAI Agents SDK's `Agent` + `run()`:

- Creates an `Agent` instance with the system prompt, model, and tools
- Calls `run()` with streaming enabled to process the conversation
- Processes two event types:
  - `RunItemStreamEvent` -- handles `tool_called`, `tool_output`, and `message_output_created` events
  - `RunRawModelStreamEvent` -- streams text deltas to the client
- Handles non-streamed text via `message_output_created` fallback (for Chat Completions mode where deltas may not arrive)
- Uses `parseFrontendToolResult()` to distinguish frontend tool outputs from backend-executed ones
- Sanitizes malformed keys from certain AI providers (e.g., Gemini wraps `@@type` in quotes)
- Strips CARTO credentials from tool call data before sending to the frontend

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

The consolidated tools (`set-deck-state`, `set-marker`, `set-mask-layer`) are imported from the core library and converted to OpenAI Agents SDK format using `getToolsForOpenAIAgents()`. A custom `zodV4ToJsonSchema()` converter is used because the SDK's built-in schema converter cannot handle `z.unknown()` used in flexible layer configs.

### Custom Tools (`agent/custom-tools.ts`)

Backend-only tools that execute server-side:

- **`lds-geocode`** -- CARTO LDS Geocoding. Converts addresses, cities, or landmarks to latitude/longitude coordinates. Only available when `CARTO_LDS_API_BASE_URL` and `CARTO_LDS_API_KEY` are configured.

### MCP Tools (`agent/mcp-tools.ts`)

Remote tools from MCP (Model Context Protocol) servers. Configured via environment variables. Tool definitions are fetched from the MCP server at startup and converted to OpenAI Agents SDK format.

The `MCP_WHITELIST_CARTO` variable filters which tools are available. MCP tool results are executed server-side and sent to the frontend via `mcp_tool_result` messages.

### MCP Mock Mode (`agent/mcp-mock-fixtures.ts`)

When `MCP_MOCK_MODE=true`, the backend uses fixture-backed tool responses instead of connecting to a real MCP server. Useful for testing and development without MCP credentials.

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

### YAML Configuration

Semantic layers are defined in YAML files under `semantic/layers/`. Each file describes:

```yaml
# Example structure
name: "My Data Catalog"
initialViewState:
  latitude: 40.7
  longitude: -74.0
  zoom: 10
welcomeMessage: "Welcome! Ask me about..."
cubes:
  - name: population
    tableName: "project.dataset.population_table"
    geometryType: h3
    dimensions:
      - name: state
        sql: state_name
        type: string
    measures:
      - name: total_population
        sql: population
        agg: sum
    vizHints:
      - colorFunction: colorBins
        palette: Sunset
        domain: [0, 1000, 10000, 100000]
```

### Key Types (from `semantic/schema.ts`)

| Type | Description |
| ---- | ----------- |
| `GeoCube` | Table definition with dimensions, measures, joins, and visualization hints |
| `GeoDimension` | Filterable/groupable column (name, SQL expression, type) |
| `GeoMeasure` | Aggregatable column (name, SQL expression, aggregation type) |
| `GeoVizHint` | Recommended styling (color function, palette, domain) |
| `SemanticLayer` | Root configuration combining cubes, business context, and metadata |

### Loader Functions (from `semantic/loader.ts`)

| Function | Description |
| -------- | ----------- |
| `loadSemanticLayer()` | Reads the first YAML file from `semantic/layers/` |
| `renderSemanticLayerAsMarkdown(layer)` | Converts to prompt-ready markdown |
| `getPrimaryCube(layer)` | Returns the first GeoCube |
| `getInitialViewState(layer)` | Extracts map view state from the primary cube |
| `getWelcomeMessage(layer)` | Returns the welcome message string |

---

## Session Management

The `ConversationManager` (`services/conversation-manager.ts`) handles per-session state:

- Maintains conversation history up to **20 messages**
- Preserves the first message (context) and trims from the middle when pruning
- Each WebSocket connection gets its own session
- Sessions are cleaned up on disconnect

---

## Endpoints

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/ws` | WebSocket | Primary communication channel (streaming + tool calls) |
| `/api/chat` | POST | HTTP SSE fallback for environments without WebSocket |
| `/health` | GET | Health check |
| `/api/semantic-config` | GET | Returns semantic layer configuration (welcome message, chips) |

---

## Testing

Unit tests use **Vitest** and cover:

```bash
npm test    # Run all tests
```

```text
tests/unit/
+-- agent/              # Provider configuration and tool aggregation
+-- services/           # Conversation manager, MCP client, utils
+-- prompts/            # System prompt builder
+-- semantic/           # Semantic model loading and validation
```
