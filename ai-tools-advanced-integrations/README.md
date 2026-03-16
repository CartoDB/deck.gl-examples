# AI Tools Advanced Integrations

> AI-powered map control framework using `@carto/agentic-deckgl`. Users interact with deck.gl maps through natural language chat. Messages are processed by an LLM that generates tool calls executed client-side to manipulate the map.

## Architecture

```text
User Message --> Frontend (WebSocket) --> Backend Server
                                              |
                                    AI SDK (streaming + tool calling)
                                              |
                              text chunks + tool_call messages
                                              |
                Frontend: Display text + Execute tool calls
                                              |
                              deck.gl state update --> Map renders
```

The AI generates deck.gl JSON specifications using 3 consolidated tools:

| Tool | Description |
| --- | --- |
| `set-deck-state` | Full deck.gl state control: navigation, basemap, layers, widgets, and effects |
| `set-marker` | Places location marker pins at specified coordinates |
| `set-mask-layer` | Editable mask layer for spatial filtering (GeoJSON geometry, draw mode, or clear) |

## Project Structure

```text
ai-tools-advanced-integrations/
├── README.md
├── frontend-integration/
│   ├── angular/           # Angular 20 (npm)
│   ├── react/             # React 19 (npm)
│   ├── vue/               # Vue 3 (npm)
│   ├── vanilla/           # Vanilla JS (npm)
│   └── README.md
└── backend-integration/
    ├── openai-agents-sdk/  # OpenAI Agents SDK (npm) — default
    ├── vercel-ai-sdk/      # Vercel AI SDK v6 (npm)
    ├── google-adk/         # Google ADK (npm)
    └── README.md
```

## Prerequisites

- **Node.js** >= 18
- **npm** (bundled with Node.js)
- **CARTO account** with API access token
- **LLM API access** (OpenAI-compatible endpoint)

## Setup

These examples depend on the `@carto/agentic-deckgl` library, which lives in a separate repository. You need to install it locally before running the examples.

All examples use **npm**. The library is installed via `npm install /path/to/agentic-deckgl`, which adds a `file:` reference to `package.json` — this is faster than `npm link` because it avoids symlink overhead in Vite's dev server.

### 1. Build the core library

```bash
# Clone the library repo (if not already cloned)
git clone https://github.com/CartoDB/carto-agentic-deckgl.git

# Build the library
cd carto-agentic-deckgl/agentic-deckgl
npm install
npm run build
```

You only need to rebuild the library after making changes to it.

### 2. Configure and start a backend (pick one)

```bash
# Replace with the actual path to your agentic-deckgl directory
LIBRARY_PATH=/path/to/carto-agentic-deckgl/agentic-deckgl

# Option A: OpenAI Agents SDK (default, recommended)
cd backend-integration/openai-agents-sdk

# Option B: Vercel AI SDK
cd backend-integration/vercel-ai-sdk

# Option C: Google ADK
cd backend-integration/google-adk
```

```bash
npm install                     # Install dependencies
npm install $LIBRARY_PATH       # Install the local library (adds file: reference)
cp .env.example .env            # Edit with your credentials
npm run dev                     # http://localhost:3003
```

### 3. Pick a frontend and start it

```bash
# Angular 20
cd frontend-integration/angular
npm install
npm install $LIBRARY_PATH
npm start              # http://localhost:4200

# React 19
cd frontend-integration/react
npm install
npm install $LIBRARY_PATH
npm run dev                # http://localhost:5173

# Vue 3
cd frontend-integration/vue
npm install
npm install $LIBRARY_PATH
npm run dev                # http://localhost:5174

# Vanilla JS
cd frontend-integration/vanilla
npm install
npm install $LIBRARY_PATH
npm run dev                # http://localhost:5173
```

Each frontend needs CARTO credentials configured in its environment file (see [Environment Variables](#environment-variables)).

## Environment Variables

### Backend (.env)

All backends use the same environment variables. Copy `.env.example` to `.env` and fill in:

```bash
CARTO_AI_API_BASE_URL=https://...    # Required: LLM API endpoint
CARTO_AI_API_KEY=your-key            # Required: LLM API key
CARTO_AI_API_MODEL=gpt-4o            # Optional: defaults to gpt-4o
PORT=3003                            # Optional: defaults to 3003
CARTO_MCP_URL=https://...            # Optional: MCP server URL
CARTO_MCP_API_KEY=your-key           # Optional: MCP API key
MCP_WHITELIST_CARTO=tool1,tool2      # Optional: comma-separated MCP tool whitelist
CARTO_LDS_API_BASE_URL=https://...   # Optional: LDS geocoding endpoint
CARTO_LDS_API_KEY=your-key           # Optional: LDS API key
```

### Frontend — Angular

Edit `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'https://gcp-us-east1.api.carto.com',
  accessToken: 'YOUR_CARTO_ACCESS_TOKEN',
  connectionName: 'carto_dw',
  wsUrl: 'ws://localhost:3003/ws',
  httpApiUrl: 'http://localhost:3003/api/chat',
  useHttp: false,
};
```

### Frontend — Vue / React / Vanilla

Create a `.env` file (copy from `.env.example`):

```bash
VITE_API_BASE_URL=https://gcp-us-east1.api.carto.com
VITE_API_ACCESS_TOKEN=YOUR_CARTO_ACCESS_TOKEN
VITE_CONNECTION_NAME=carto_dw
VITE_WS_URL=ws://localhost:3003/ws
VITE_HTTP_API_URL=http://localhost:3003/api/chat
VITE_USE_HTTP=false
```

## Library Installation Troubleshooting

1. Always run `npm install` first, then `npm install /path/to/agentic-deckgl` to add the local library
2. After `npm install /path/to/agentic-deckgl`, a `file:` reference is added to `package.json` — this path is local to your machine, do not commit it
3. Re-run `npm install /path/to/agentic-deckgl` after a clean `npm install` if the reference is lost
4. For Angular, add `"preserveSymlinks": true` to `tsconfig.json` under `compilerOptions` if the linked package can't be resolved
5. Use the same Node version across all examples

## WebSocket Protocol

All backends implement the same WebSocket protocol, so any frontend works with any backend.

**Client to Server:**

- `chat_message` — User's natural language input + current map state
- `tool_result` — Result of executing a tool call on the frontend

**Server to Client:**

- `stream_chunk` — Streaming text response from the AI
- `tool_call` — Tool call to execute on the frontend
- `mcp_tool_result` — Result from an MCP tool executed server-side
- `error` — Error message

## Development Commands

### Backend

```bash
npm run dev             # Start dev server with hot reload (port 3003)
npm run build           # Compile TypeScript to dist/
npm run typecheck       # Type check without emitting
```

### Frontend

```bash
npm install         # Install dependencies
npm start           # Start dev server (Angular: port 4200)
npm run dev             # Start dev server (React/Vue/Vanilla)
npm run build           # Build for production
npm test            # Run unit tests
```

## License

MIT
