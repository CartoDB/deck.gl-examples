# Frontend Integrations

> Reference implementations of the AI-powered map application across 4 frontend frameworks. Each integration demonstrates how to build the complete chat-to-map experience using `@carto/agentic-deckgl`.

## Available Integrations

| Framework | Version | Directory | Dev Server | Documentation |
| --------- | ------- | --------- | ---------- | ------------- |
| Angular | 20 | [angular/](angular/) | `http://localhost:4200` | [README](angular/README.md) |
| Vue | 3 | [vue/](vue/) | `http://localhost:5174` | [README](vue/README.md) |
| React | 19 | [react/](react/) | `http://localhost:5173` | [README](react/README.md) |
| Vanilla JS | ES6 | [vanilla/](vanilla/) | `http://localhost:5173` | [README](vanilla/README.md) |

---

## Shared Architecture

All 4 integrations implement the same application and follow the same architectural pattern, adapted to each framework's idioms.

### Components (6 per framework)

| Component | Purpose |
| --------- | ------- |
| MapView | deck.gl + MapLibre map container |
| ChatUI | Chat interface with markdown rendering and streaming |
| LayerToggle | Layer visibility controls with legend panel |
| ZoomControls | Zoom in/out buttons |
| Snackbar | Toast notifications |
| ConfirmationDialog | Modal confirmation dialogs |

### Service Layer

Each framework implements 4 core services (as Angular services, Vue composables, React contexts, or ES6 classes):

| Service | Responsibility |
| ------- | -------------- |
| **State** | Centralized reactive state for the unified `DeckSpec` (viewState, layers, widgets, effects) plus basemap and active layer tracking |
| **WebSocket** | WebSocket client with auto-reconnect |
| **Orchestrator** | Coordinates messages, routes WebSocket events, executes tool calls, manages chat history and loader state |
| **Tool Executor** | Handles `set-deck-state`, `set-marker`, and `set-mask-layer` tools. System layers (`__` prefix) are hidden from UI and AI context |

### Configuration Files

Each integration includes:

- **deck-json-config** -- `JSONConverter` setup for resolving `@@type`, `@@function`, `@@=`, and `@@#` prefixes
- **environment** -- CARTO credentials and backend URLs
- **semantic-config** -- Welcome chips configuration

### Utilities

Three pure utility modules are duplicated across frameworks (see [rationale](../TEST-UNIT.md)):

| Utility | Purpose |
| ------- | ------- |
| **layer-merge** | Deep merge layer specs for partial updates |
| **legend** | Extract legend data from layer color styling |
| **tooltip** | Format tooltip content for hover display |

---

## Framework Comparison

### State Management

| Pattern | Angular | Vue | React | Vanilla |
| ------- | ------- | --- | ----- | ------- |
| State container | `BehaviorSubject` | `reactive()` | `useReducer` | EventEmitter |
| Change notification | RxJS `Observable` | Vue watchers | Context re-render | `emit('change')` |
| Mutable refs (no re-render) | N/A | Module-scoped `let` | `useRef` | Instance properties |
| Computed/derived | RxJS `pipe` + `map` | `computed()` | `useMemo` | Getter methods |

### Dependency Injection

| Pattern | Angular | Vue | React | Vanilla |
| ------- | ------- | --- | ----- | ------- |
| Mechanism | `@Injectable({ providedIn: 'root' })` | Singleton composables | Context + Providers | Constructor injection |
| Wiring | Automatic (Angular DI) | Module-scoped singletons | Nested Providers in `main.tsx` | Manual in `main.js` |
| Access | `inject(Service)` | `useXxx()` | `useXxx()` hook | Direct reference |

### deck.gl Integration

| Approach | Angular | Vue | React | Vanilla |
| -------- | ------- | --- | ----- | ------- |
| Style | Imperative | Imperative | Declarative | Imperative |
| Deck instance | `new Deck()` | `new Deck()` | `<DeckGL>` component | `new Deck()` |
| Map sync | `map.jumpTo()` | `map.jumpTo()` | `react-map-gl` `<Map>` | `map.jumpTo()` |
| State-to-render | `state$.subscribe()` | `watch()` | `useMemo` + spread | `on('change')` |

---

## Tool Execution Pipeline

All frameworks handle 3 tools:

### `set-deck-state` -- Three-Phase Pipeline

1. **Phase 1: ViewState** -- Update camera position (`setInitialViewState`)
2. **Phase 2: Basemap** -- Change map style (`setBasemap`)
3. **Phase 3: Layers** -- Process layer changes:
   - Remove layers listed in `removeLayerIds`
   - Deep merge incoming layers with existing (by ID) using `mergeLayerSpecs()`
   - Apply `layerOrder` if specified
   - Ensure system layers (`__` prefix) render on top of user layers
   - Validate columns with `validateLayerColumns()`
   - Track active layer (skipping system layers)
   - Update state via `setDeckLayers()`

### `set-marker` -- Location Pin Placement

Places an `IconLayer` with ID `__location-marker__` at the specified coordinates. Markers accumulate across calls -- each new position is added to the existing set. If a marker already exists at the exact same coordinates, it is not duplicated. The marker layer is a system layer (hidden from UI toggle and AI state context).

### `set-mask-layer` -- Spatial Mask Filter

Manages an editable mask layer for spatial filtering. Three actions are supported:

| Action | Behavior |
| --- | --- |
| `set` | Applies a GeoJSON geometry or CARTO table name as the mask. All data layers are visually clipped to the mask area. The mask enters edit mode so the user can modify it. |
| `enable-draw` | Activates drawing mode. The user draws a polygon on the map to define the mask area. |
| `clear` | Removes the mask. All data layers return to full visibility. |

The mask layer uses a three-layer composition:

1. **`GeoJsonLayer`** (`__mask-layer__`) with `operation: 'mask'` -- defines the GPU-accelerated mask geometry
2. **`EditableGeoJsonLayer`** (`__editable-mask__`) -- user interaction layer for drawing and editing polygons
3. **`MaskExtension`** -- injected into all data layers when a mask is active, linking them to the mask geometry

Both mask layers are system layers (`__` prefix) -- hidden from the UI layer toggle and AI state context.

### System Layers

Layers with IDs prefixed by `__` (e.g., `__location-marker__`, `__mask-layer__`, `__editable-mask__`) are treated as system layers:

- **Rendering**: Always placed on top of user layers in the layer stack
- **UI**: Filtered out of the layer toggle panel
- **AI context**: Excluded from the initial state sent to the backend, so the AI doesn't see or manipulate them
- **Active layer tracking**: Skipped when determining the active layer ID

---

## Environment Configuration

### Angular

Edit `src/environments/environment.ts` (copy from `.example`):

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

### Vue / React / Vanilla

Create a `.env` file in the project root:

```bash
VITE_API_BASE_URL=https://gcp-us-east1.api.carto.com
VITE_API_ACCESS_TOKEN=YOUR_CARTO_ACCESS_TOKEN
VITE_CONNECTION_NAME=carto_dw
VITE_WS_URL=ws://localhost:3003/ws
VITE_HTTP_API_URL=http://localhost:3003/api/chat
VITE_USE_HTTP=false
```

| Variable | Description |
| -------- | ----------- |
| `apiBaseUrl` / `VITE_API_BASE_URL` | CARTO API endpoint URL |
| `accessToken` / `VITE_API_ACCESS_TOKEN` | CARTO API access token |
| `connectionName` / `VITE_CONNECTION_NAME` | Data warehouse connection name |
| `wsUrl` / `VITE_WS_URL` | Backend WebSocket URL |
| `httpApiUrl` / `VITE_HTTP_API_URL` | Backend HTTP URL (fallback) |
| `useHttp` / `VITE_USE_HTTP` | Use HTTP instead of WebSocket (`false` recommended) |

---

## Testing

All frameworks use **Vitest** for unit testing. Each has its own self-contained test suite covering the shared utilities (legend, layer-merge, tooltip).

```bash
# Run tests for any framework
cd <framework-directory>
npm test    # or: npx vitest run
```

| Framework | Test Files | Test Count | Location |
| --------- | ---------- | ---------- | -------- |
| Angular | 3 | 75 | `tests/unit/utils/` |
| Vue | 3 | 75 | `tests/unit/utils/` |
| React | 3 | 75 | `tests/unit/utils/` |
| Vanilla | 3 | 75 | `tests/unit/utils/` |

See [TEST-UNIT.md](../TEST-UNIT.md) for the rationale behind the per-framework test strategy.
