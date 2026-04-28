# Hello World — Agentic Tools

Minimal example of integrating [`@carto/agentic-deckgl`](https://www.npmjs.com/package/@carto/agentic-deckgl) with deck.gl using vanilla JavaScript.

Type natural language into the chat panel and an AI agent will control the map — adding layers, changing the view, placing markers, and more.

## Architecture

```
frontend/          Vanilla JS + deck.gl + MapLibre (Vite dev server)
  main.js          Map, chat UI, WebSocket client, tool executor
  index.html       Single-page HTML shell

backend/           Node.js + Express + WebSocket
  server.js        Connects to CARTO AI provider, runs @carto/agentic-deckgl
                   tools via Vercel AI SDK, streams responses to the frontend
```

**How it works:**

1. User types a message in the chat panel
2. Frontend sends it over WebSocket to the backend along with current map state
3. Backend feeds the message to an LLM (via CARTO's OpenAI-compatible endpoint)
4. The LLM calls `set-deck-state` / `set-marker` tools from `@carto/agentic-deckgl`
5. Tool calls are forwarded to the frontend, which applies them via `@deck.gl/json` JSONConverter
6. Streamed text responses appear in the chat panel

## Quick Start

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

Open http://localhost:5173 and start chatting.

## Environment Variables

### Backend (`.env`)

| Variable | Description |
|---|---|
| `CARTO_AI_API_BASE_URL` | CARTO AI LiteLLM-compatible endpoint |
| `CARTO_AI_API_KEY` | API key for the AI endpoint |
| `CARTO_AI_API_MODEL` | Model name (default: `gpt-4o`) |
| `PORT` | Server port (default: `3003`) |

### Frontend (`.env`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | CARTO API base URL |
| `VITE_API_ACCESS_TOKEN` | CARTO API access token (for rendering map layers) |
| `VITE_CONNECTION_NAME` | CARTO connection name (default: `carto_dw`) |
| `VITE_WS_URL` | Backend WebSocket URL (default: `ws://localhost:3003/ws`) |
