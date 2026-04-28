## Example: Hello World Agentic Tools

The smallest possible integration of [`@carto/agentic-deckgl`](https://www.npmjs.com/package/@carto/agentic-deckgl) with deck.gl using vanilla JavaScript.

Type natural language into the chat panel and an AI agent controls the map — adding layers from CARTO demo data, changing the basemap, flying to locations, and placing markers.

> [!WARNING]
> This example needs a **Node backend** to keep your AI provider key off the browser, so it cannot run in StackBlitz. Clone the repo and run it locally.

> [!NOTE]
> For a richer setup with MCP, multiple SDKs (Vercel AI / OpenAI Agents / Google ADK), and frontend variants (React, Vue, Angular, vanilla), see [ai-tools-advanced-integrations](../ai-tools-advanced-integrations/).

## Architecture

```text
frontend/        Vanilla JS + deck.gl + MapLibre (Vite)
  main.js        Map, chat UI, WebSocket client, tool executor
  index.html     Single-page HTML shell

backend/         Node.js + Express + WebSocket
  server.js      Connects to a CARTO AI provider, runs @carto/agentic-deckgl
                 tools via the Vercel AI SDK, streams responses back
```

**How it works:**

1. User types a message in the chat panel.
2. Frontend sends it over WebSocket to the backend along with current map state.
3. Backend feeds the message to an LLM via CARTO's OpenAI-compatible endpoint.
4. The LLM calls `set-deck-state` / `set-marker` tools from `@carto/agentic-deckgl`.
5. Tool calls are forwarded to the frontend, which applies them via `@deck.gl/json` JSONConverter.
6. Streamed text replies appear in the chat panel.

## Usage

> [!WARNING]
> You'll need credentials for both a CARTO API access token (for the map data) and a CARTO AI / OpenAI-compatible endpoint (for the LLM). See `.env.example` in each folder.

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in your CARTO AI credentials
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # fill in your CARTO API access token
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`) and start chatting.

## Things to try

- "Show populated places worldwide"
- "Show POIs in the US styled by category"
- "Fly to Manhattan"
- "Show US population by H3 hexagons"
- "Add a marker at the Eiffel Tower"

## Environment variables

### Backend (`.env`)

| Variable | Description |
|---|---|
| `CARTO_AI_API_BASE_URL` | CARTO AI / OpenAI-compatible endpoint |
| `CARTO_AI_API_KEY` | API key for the AI endpoint |
| `CARTO_AI_API_MODEL` | Model name (default: `claude-sonnet-4-6`) |
| `PORT` | Server port (default: `3003`) |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | CARTO API base URL |
| `VITE_API_ACCESS_TOKEN` | CARTO API access token (for rendering map layers) |
| `VITE_CONNECTION_NAME` | CARTO connection name (default: `carto_dw`) |
| `VITE_WS_URL` | Backend WebSocket URL (default: `ws://localhost:3003/ws`) |
