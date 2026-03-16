# E2E Tests

Playwright-based end-to-end tests that validate the full AI map pipeline: user message → WebSocket → backend LLM → tool call → deck.gl rendering.

Tests run across 11 LLM models with visual screenshot comparison to detect regressions.

## Structure

```
e2e/
├── playwright.config.ts          # Configuration (timeouts, webServer, screenshot threshold)
├── pages/                        # Page Object Models (POM)
│   ├── app.page.ts               # Root POM — composes Chat, Map, LayerToggle
│   ├── chat.page.ts              # Chat sidebar (send messages, click chips, wait for responses)
│   ├── map.page.ts               # Map canvas (stability detection, screenshots, viewState)
│   └── layer-toggle.page.ts      # Layer visibility controls and assertions
├── helpers/
│   └── model-config.ts           # Model list (11 models) and slug utilities
├── tests/
│   ├── semantic-direct-layer.spec.ts   # Chip: "Counties with 40%+ higher education"
│   ├── semantic-mcp-tool.spec.ts       # Chip: "MCP Demographics around Times Square"
│   ├── custom-tool-lds.spec.ts         # Free text: "Fly to New York" (LDS geocode)
│   ├── set-marker.spec.ts             # Marker CRUD: add, remove, clear, accumulate
└── screenshots/                  # Baseline screenshots (PNGs gitignored)
```

## Prerequisites

1. **Build the core library:**
   ```bash
   cd agentic-deckgl && npm install && npm run build
   ```

2. **Configure backend environment** (`backend-integration/vercel-ai-sdk/.env`):
   ```
   CARTO_AI_API_BASE_URL=<LiteLLM endpoint>
   CARTO_AI_API_KEY=<API key>
   CARTO_AI_API_MODEL=<model ID>
   CARTO_MCP_URL=<MCP server URL>
   CARTO_MCP_API_KEY=<MCP API key>
   CARTO_LDS_API_BASE_URL=<LDS geocoding endpoint>
   CARTO_LDS_API_KEY=<LDS API key>
   ```

3. **Configure frontend environment** (`frontend-integration/react/.env`):
   ```
   VITE_API_BASE_URL=https://gcp-us-east1.api.carto.com
   VITE_API_ACCESS_TOKEN=<CARTO access token>
   VITE_CONNECTION_NAME=carto_dw
   VITE_WS_URL=ws://localhost:3003/ws
   VITE_HTTP_API_URL=http://localhost:3003/api/chat
   VITE_USE_HTTP=false
   ```

4. **Install Playwright browsers:**
   ```bash
   cd frontend-integration/react && npx playwright install chromium
   ```

## Running Tests

All commands run from `frontend-integration/react/`:

```bash
# Headless (Playwright starts backend + frontend automatically)
pnpm e2e

# Headed mode (watch tests execute in browser)
pnpm e2e:headed

# Interactive UI mode
pnpm e2e:ui

# Run a single test file
pnpm e2e -- --grep "Counties"

# Update screenshot baselines
pnpm e2e:update-snapshots

# View HTML report after a run
pnpm e2e:report
```

### Running with a specific model

```bash
TEST_MODEL="ac_7xhfwyml::openai::gpt-5.2" pnpm e2e
```

### Using pre-started servers

If you already have the backend (port 3003) and frontend (port 5173) running, Playwright will reuse them (`reuseExistingServer: true`).

## Test Cases

| Test | Prompt | Validates |
|------|--------|-----------|
| `semantic-direct-layer` | Chip: "Counties with 40%+ higher education" | Direct semantic layer creation, layer toggle, screenshot |
| `semantic-mcp-tool` | Chip: "MCP Demographics around Times Square" | MCP tool execution, viewport fly-to NYC, screenshot |
| `custom-tool-lds` | Text: "Fly to New York" | LDS geocode tool, viewport assertion (~40.7, -74.0), screenshot |
| `set-marker` (6 tests) | Various marker commands | Full marker CRUD lifecycle (see below) |

### Set Marker Tests

The `set-marker.spec.ts` suite validates the `set-marker` tool across 6 scenarios:

| # | Test | Prompt(s) | Validates |
| - | ---- | --------- | --------- |
| 1 | Add marker (explicit) | "Fly to Times Square and add a marker" | Marker tool success message, screenshot |
| 2 | Marker in MCP workflow | Chip: "MCP Demographics around Times Square" | MCP workflow completes with tool calls, screenshot |
| 3 | Clear all markers | "Fly to Madrid and add a marker" → "Clear all markers" | Sequential: add then clear, "cleared" confirmation |
| 4 | Remove specific marker | "Fly to Madrid and add a marker" → "Remove the marker on Madrid" | Sequential: add then remove by location, "removed" confirmation |
| 5 | No marker on fly-to | "Fly to Paris" | Negative test: fly-to executes without placing a marker |
| 6 | Accumulate markers | "Fly to Madrid and add a marker" → "Fly to Barcelona and add a marker" | Sequential: two markers accumulate, "total markers: 2" confirmation |

## Page Object Models

- **AppPage** — entry point; calls `setup()` to navigate, wait for WebSocket connection, and open chat
- **ChatPage** — send messages, click welcome chips, wait for streaming completion and tool success
- **MapPage** — wait for canvas stability (consecutive screenshot comparison), capture screenshots, assert viewState via `window.__deckViewState`
- **LayerTogglePage** — count layers, check visibility, toggle layers

## Screenshot Comparison

- Threshold: `maxDiffPixelRatio: 0.3` (30%) — tolerates LLM output variation while catching structural regressions
- First run will fail comparisons (no baselines); run `pnpm e2e:update-snapshots` to capture them
- Screenshots are stored per-model using slug prefixes (e.g., `ac-7xhfwyml-openai-gpt-5-2/fly-to-new-york.png`)
- PNG files in `screenshots/` are gitignored; baselines live as CI artifacts

## CI/CD

The GitHub Actions workflow (`.github/workflows/e2e-tests.yml`) runs tests in an 11-model matrix. Each model runs as a separate job, and results are uploaded as artifacts for cross-model comparison.

Triggers: `push` to `main`/`dev`, and `pull_request` on any branch.

Required GitHub secrets: `CARTO_AI_API_BASE_URL`, `CARTO_AI_API_KEY`, `CARTO_MCP_URL`, `CARTO_MCP_API_KEY`, `CARTO_LDS_API_BASE_URL`, `CARTO_LDS_API_KEY`, `VITE_API_BASE_URL`, `VITE_API_ACCESS_TOKEN`.

## Configuration Reference

| Setting | Value | Reason |
|---------|-------|--------|
| Test timeout | 120s | LLM responses can take 30-60s |
| Expect timeout | 60s | Map tiles and canvas stability |
| Screenshot threshold | 30% | LLM non-determinism |
| Retries (CI) | 1 | LLM flakiness tolerance |
| Workers | 1 | Sequential — shared backend state |
| Browser | Chromium only | deck.gl WebGL focus |
