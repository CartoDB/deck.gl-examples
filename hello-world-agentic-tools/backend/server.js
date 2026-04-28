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
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, stepCountIs, tool } from 'ai';
import {
  getToolsForVercelAI,
  consolidatedToolNames,
  buildSystemPrompt,
  isFrontendToolResult,
} from '@carto/agentic-deckgl';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const {
  CARTO_AI_API_BASE_URL,
  CARTO_AI_API_KEY,
  CARTO_AI_API_MODEL = 'gpt-4o',
  PORT = '3003',
} = process.env;

if (!CARTO_AI_API_BASE_URL || !CARTO_AI_API_KEY) {
  console.error('Missing CARTO_AI_API_BASE_URL or CARTO_AI_API_KEY in .env');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AI Provider
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
  const toolDefs = getToolsForVercelAI(consolidatedToolNames);
  return Object.fromEntries(
    toolDefs.map((def) => [
      def.name,
      tool({ description: def.description, inputSchema: def.inputSchema, execute: def.execute }),
    ])
  );
}

// ---------------------------------------------------------------------------
// Conversation history (minimal in-memory store)
// ---------------------------------------------------------------------------

const history = new Map(); // sessionId -> [{role, content}]

// ---------------------------------------------------------------------------
// Demo data catalog — tells the AI what tables are available
// ---------------------------------------------------------------------------

const DEMO_DATA_PROMPT = `
## Available Data

You MUST ONLY use the tables listed below. They all live in connection "carto_dw".
Do NOT invent table names. If the user asks for data you don't have, say so.

### Tables (vectorTableSource)
| Table | Description | Key columns |
|---|---|---|
| carto-demo-data.demo_tables.populated_places | Major populated places worldwide | name, pop_max, adm0name (country), adm1name (state) |
| carto-demo-data.demo_tables.osm_pois_usa | 1.4M Points of Interest across the US | name, group_name, subgroup_name, address |
| carto-demo-data.demo_tables.usa_counties | US county boundaries | name, state_name, total_pop |
| carto-demo-data.demo_tables.fires_worldwide | Global wildfire incidents | brightness, frp (fire radiative power), confidence |
| carto-demo-data.demo_tables.riskanalysis_railroad_accidents | US railroad accidents | year, damage, county, state |

### POI Categories (group_name values in osm_pois_usa)
The group_name column has these exact values: Others, Education, Sustenance, Commercial, Entertainment, Arts & Culture, Financial, Tourism, Healthcare, Civic amenities, Transportation.

**Styling POIs by category:** When asked to style POIs by category (group_name), ALWAYS use colorCategories with the Bold palette and include ALL category values in the domain. Do NOT use @@= expressions for this — there are too many categories and unmatched ones would appear grey.

Example:
{
  "getFillColor": {
    "@@function": "colorCategories",
    "attr": "group_name",
    "domain": ["Others", "Education", "Sustenance", "Commercial", "Entertainment, Arts & Culture", "Financial", "Tourism", "Healthcare", "Civic amenities", "Transportation"],
    "colors": "Bold"
  },
  "updateTriggers": {
    "getFillColor": { "attr": "group_name", "domain": ["Others", "Education", "Sustenance", "Commercial", "Entertainment, Arts & Culture", "Financial", "Tourism", "Healthcare", "Civic amenities", "Transportation"], "colors": "Bold" }
  }
}
You MUST also include "columns": ["group_name"] in the data source.

### County Population (usa_counties)
The population column is "total_pop" (total population count). Use colorBins or colorContinuous for styling.
Suggested domain for colorBins: [0, 50000, 100000, 500000, 1000000, 5000000].
You MUST include "columns": ["total_pop"] in the data source when styling by population.

### H3 Tables (h3QuerySource)
| Table | Description | Key columns |
|---|---|---|
| cartobq.public_account.derived_spatialfeatures_usa_h3int_res8_v1_yearly_v2 | US spatial features aggregated at H3 resolution 8 | population, urbanity |

**H3 usage rules:**
- Use H3TileLayer with h3QuerySource for H3 tables.
- h3QuerySource requires \`sqlQuery\` and \`aggregationExp\`. Do NOT use \`columns\` — it is not a valid parameter for h3QuerySource.
- The \`aggregationExp\` MUST alias the result as \`value\` (e.g. \`SUM(population) as value\`). The \`attr\` in colorBins MUST match this alias: \`"value"\`.
- You MUST include \`updateTriggers\` for \`getFillColor\` — without it the hexagons will appear grey.
- H3 layers look best with the dark-matter basemap.

**Complete H3 layer example:**
\`\`\`json
{
  "@@type": "H3TileLayer",
  "id": "h3-population",
  "data": {
    "@@function": "h3QuerySource",
    "sqlQuery": "SELECT * FROM cartobq.public_account.derived_spatialfeatures_usa_h3int_res8_v1_yearly_v2",
    "aggregationExp": "SUM(population) as value"
  },
  "opacity": 0.8,
  "pickable": true,
  "getFillColor": {
    "@@function": "colorBins",
    "attr": "value",
    "domain": [0, 100, 1000, 10000, 100000, 1000000],
    "colors": "PinkYl"
  },
  "updateTriggers": {
    "getFillColor": { "attr": "value", "domain": [0, 100, 1000, 10000, 100000, 1000000], "colors": "PinkYl" }
  }
}
\`\`\`

### Usage rules
- Use VectorTileLayer with vectorTableSource for vector tables.
- Use H3TileLayer with h3QuerySource for H3 tables.
- Connection name is always "carto_dw".
- Do not set accessToken, apiBaseUrl, or connectionName — the frontend injects credentials automatically.

### Spatial filtering (set-mask-layer)
- The "enable-draw" action is NOT available. NEVER use it.
- When the user asks to filter data to a specific area (city, neighborhood, region, etc.), you MUST generate the GeoJSON geometry yourself and call set-mask-layer with action "set" and the geometry.
- Create an approximate bounding polygon for the area. For a city, use a rough rectangular or polygonal boundary. For example, for Manhattan you might use a 4-6 point polygon approximating its shape. For a circular area around a point, generate an approximate polygon with ~12 vertices.
- You are expected to use your geographic knowledge to produce reasonable boundaries. They don't need to be exact administrative boundaries — a rough approximation is fine.
- To clear a spatial filter, use action "clear".
`;

// ---------------------------------------------------------------------------
// Agent runner
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

async function runAgent(userMessage, ws, sessionId, initialState) {
  const messageId = `msg_${Date.now()}`;
  const messages = history.get(sessionId) || [];

  // Add user message to history
  messages.push({ role: 'user', content: userMessage });

  const toolNames = [...consolidatedToolNames];
  const systemPrompt = buildSystemPrompt({
    toolNames,
    initialState: initialState
      ? {
          viewState: initialState.viewState,
          initialViewState: initialState.initialViewState,
          layers: initialState.layers,
          activeLayerId: initialState.activeLayerId,
        }
      : undefined,
    additionalPrompt: DEMO_DATA_PROMPT,
  });

  const agent = new ToolLoopAgent({
    model,
    instructions: systemPrompt,
    tools: createMapTools(),
    stopWhen: stepCountIs(20),
  });

  try {
    const streamResult = await agent.stream({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

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

    // Signal completion
    ws.send(JSON.stringify({ type: 'stream_chunk', content: '', messageId, isComplete: true }));

    // Save assistant reply to history
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

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const sid = sessions.get(ws);

      if (msg.type === 'chat_message') {
        await runAgent(msg.content, ws, sid, msg.initialState);
      } else if (msg.type === 'tool_result') {
        // Acknowledge tool results from the frontend
        const status = msg.success ? 'success' : 'failed';
        console.log(`[WS] Tool result: ${msg.toolName} — ${status}`);

        const h = history.get(sid) || [];
        h.push({
          role: 'assistant',
          content: `[Tool ${status}: ${msg.toolName}] ${msg.message}`,
        });
        history.set(sid, h);
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
