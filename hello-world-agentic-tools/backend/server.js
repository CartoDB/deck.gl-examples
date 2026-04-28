/**
 * Hello World Agentic Tools — Backend
 *
 * Minimal Express + WebSocket server that connects to a CARTO AI provider
 * and exposes @carto/agentic-deckgl tools for map control via natural language.
 *
 * One file. No MCP, no semantic layer, no custom tools.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import {
  getToolsForVercelAI,
  TOOL_NAMES,
  buildSystemPrompt,
  isFrontendToolResult,
} from '@carto/agentic-deckgl';

// Hello-world supports a deliberately small subset of @carto/agentic-deckgl.
// Drop set-mask-layer (no MaskExtension plumbing in this example).
const ENABLED_TOOLS = [TOOL_NAMES.SET_DECK_STATE, TOOL_NAMES.SET_MARKER];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const {
  CARTO_AI_API_BASE_URL,
  CARTO_AI_API_KEY,
  CARTO_AI_API_MODEL = 'claude-sonnet-4-6',
  PORT = '3003',
} = process.env;

if (!CARTO_AI_API_BASE_URL || !CARTO_AI_API_KEY) {
  console.error('Missing CARTO_AI_API_BASE_URL or CARTO_AI_API_KEY in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AI provider
// ---------------------------------------------------------------------------

const carto = createOpenAI({
  baseURL: CARTO_AI_API_BASE_URL,
  apiKey: CARTO_AI_API_KEY,
  name: 'carto',
});

const model = carto.chat(CARTO_AI_API_MODEL);

// ---------------------------------------------------------------------------
// Tools — only the consolidated map tools from @carto/agentic-deckgl
// ---------------------------------------------------------------------------

function createMapTools() {
  const toolDefs = getToolsForVercelAI(ENABLED_TOOLS);
  return Object.fromEntries(
    toolDefs.map((def) => [
      def.name,
      tool({ description: def.description, inputSchema: def.inputSchema, execute: def.execute }),
    ])
  );
}

// ---------------------------------------------------------------------------
// Demo data catalog — tells the AI what tables are available.
// Kept intentionally short for "hello world" — see the
// ai-tools-advanced-integrations example for richer prompts.
// ---------------------------------------------------------------------------

const DEMO_DATA_PROMPT = `
## This example: hello world

This is the *minimal* @carto/agentic-deckgl integration. The frontend supports
a deliberately small set of features. Stay inside it.

### What you CAN do

- Navigate the camera (\`initialViewState\`) and change the basemap (\`mapStyle\`)
  when explicitly asked.
- Add, update, and remove deck.gl layers via \`set-deck-state\` using the data
  catalog below. Layer styling (colorBins / colorCategories / colorContinuous,
  opacity, radius, etc.) is fully supported.
- Apply server-side data \`filters\` inside a source config (e.g.
  \`"filters": { "group_name": { "in": { "values": ["Financial"] } } }\`).
  Update or clear filters by re-sending the same layer ID with a new (or
  empty) \`filters\` object. Wrap values in \`{ "values": [...] }\`.
- Place pin markers with \`set-marker\` (\`add\` to drop one, \`clear-all\` to
  remove them).

### What you CANNOT do in this example (do NOT attempt)

- **Widgets** — there is no widget panel. Never put a \`widgets\` array or
  \`removeWidgetIds\` in your tool calls. If asked, say widgets are part of
  the advanced example, not this one.
- **Effects** — no effects pipeline. Never include an \`effects\` field.
- **Spatial masks / drawing** — \`set-mask-layer\` is not available. There is
  no \`enable-draw\` mode. If the user asks to filter by area, use a server-
  side \`filters\` clause on a column (e.g. state_name, adm0name) when one
  fits, or say the masking feature is not in this example.
- **MCP / async workflows / semantic-layer queries** — none of those tools
  exist here. Don't reference job IDs, async polling, or MCP results.
- **Tooltips, legends, controls** — these are not configurable from tool
  calls in this example.

### Data catalog

Connection: \`carto_dw\`. Use ONLY these tables — do not invent table names or
columns. If the user asks for data not listed here, say you don't have it.

| Table | Source helper | Useful columns |
|---|---|---|
| carto-demo-data.demo_tables.populated_places | vectorTableSource | name, pop_max, adm0name (country), adm1name (state) |
| carto-demo-data.demo_tables.osm_pois_usa | vectorTableSource | name, group_name (category) |
| carto-demo-data.demo_tables.usa_counties | vectorTableSource | name, state_name, total_pop |
| cartobq.public_account.derived_spatialfeatures_usa_h3int_res8_v1_yearly_v2 | h3QuerySource | population, urbanity (H3 res 8) |

\`group_name\` values in osm_pois_usa: Others, Education, Sustenance,
Commercial, Entertainment, Arts & Culture, Financial, Tourism, Healthcare,
Civic amenities, Transportation.

### Rules of thumb

- Use \`VectorTileLayer\` for vector tables, \`H3TileLayer\` for H3 tables.
- For \`h3QuerySource\`, write \`SELECT * FROM <table>\` and an
  \`aggregationExp\` aliased as \`value\` (e.g. \`"SUM(population) as value"\`);
  matching \`colorBins\` should use \`attr: "value"\`.
- When styling by a column, include \`"columns": ["<col>"]\` in the source
  config so the column is fetched.
- Never set \`accessToken\`, \`apiBaseUrl\`, or \`connectionName\` — the
  frontend injects credentials automatically.
- Be concise in chat replies. The map speaks for itself.
`;

// ---------------------------------------------------------------------------
// Conversation history (in-memory, per WebSocket connection — lost on reload)
// ---------------------------------------------------------------------------

const history = new Map(); // sessionId -> [{role, content}]

// ---------------------------------------------------------------------------
// Strip CARTO credentials from anything we send to the frontend. Belt and
// braces: tool call payloads should never carry them, but the AI may try.
// ---------------------------------------------------------------------------

const CREDENTIAL_FIELDS = ['accessToken', 'apiBaseUrl', 'connectionName', 'connection'];

function stripCredentials(data) {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(stripCredentials);
  if (typeof data === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      if (!CREDENTIAL_FIELDS.includes(key)) result[key] = stripCredentials(value);
    }
    return result;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Agent runner
// ---------------------------------------------------------------------------

async function runAgent(userMessage, ws, sessionId, initialState) {
  const messageId = `msg_${Date.now()}`;
  const messages = history.get(sessionId) || [];
  messages.push({ role: 'user', content: userMessage });

  const systemPrompt = buildSystemPrompt({
    toolNames: ENABLED_TOOLS,
    initialState: initialState && {
      viewState: initialState.viewState,
      layers: initialState.layers,
    },
    additionalPrompt: DEMO_DATA_PROMPT,
  });

  const agent = new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools: createMapTools(),
    stopWhen: stepCountIs(20),
  });

  try {
    const streamResult = await agent.stream({ messages });
    let fullText = '';

    for await (const part of streamResult.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          const delta = part.text;
          if (delta) {
            fullText += delta;
            ws.send(JSON.stringify({ type: 'stream_chunk', content: delta, messageId, isComplete: false }));
          }
          break;
        }

        case 'tool-result': {
          if (isFrontendToolResult(part.output)) {
            const fr = part.output;
            ws.send(
              JSON.stringify({
                type: 'tool_call',
                toolName: fr.toolName,
                data: stripCredentials(fr.data),
                callId: part.toolCallId,
              })
            );
          }
          break;
        }

        case 'error':
          console.error('[Agent] Stream error:', part.error);
          ws.send(JSON.stringify({ type: 'error', content: String(part.error) }));
          break;
      }
    }

    ws.send(JSON.stringify({ type: 'stream_chunk', content: '', messageId, isComplete: true }));

    const text = (await streamResult.text) || fullText || '';
    messages.push({ role: 'assistant', content: text });
    history.set(sessionId, messages);
  } catch (err) {
    console.error('[Agent] Error:', err);
    ws.send(JSON.stringify({ type: 'error', content: err.message || 'Agent error' }));
  }
}

// ---------------------------------------------------------------------------
// Express + WebSocket server
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const sessions = new Map();

wss.on('connection', (ws) => {
  const sessionId = randomUUID();
  sessions.set(ws, sessionId);
  console.log(`[WS] Connected: ${sessionId}`);
  ws.send(JSON.stringify({ type: 'session_info', model: CARTO_AI_API_MODEL }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const sid = sessions.get(ws);

      if (msg.type === 'chat_message') {
        await runAgent(msg.content, ws, sid, msg.initialState);
      } else if (msg.type === 'tool_result') {
        // Frontend acknowledgement — log for debugging only. The agent already
        // has the tool's return value from its own loop, so we don't replay
        // these into history.
        const status = msg.success ? 'success' : 'failed';
        console.log(`[WS] Tool ack: ${msg.toolName} — ${status}`);
      }
    } catch (err) {
      console.error('[WS] Error:', err);
      ws.send(JSON.stringify({ type: 'error', content: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    history.delete(sessions.get(ws));
    sessions.delete(ws);
    console.log('[WS] Disconnected');
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

server.listen(parseInt(PORT), () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket:  ws://localhost:${PORT}/ws`);
});
