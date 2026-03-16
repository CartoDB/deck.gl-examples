import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the semantic model loader before importing the module under test
vi.mock('../../../src/semantic/index.js', () => ({
  loadSemanticModel: vi.fn(),
  renderSemanticModelAsMarkdown: vi.fn(),
}));

// Mock the custom prompt
vi.mock('../../../src/prompts/custom-prompt.js', () => ({
  customPrompt: 'CUSTOM_PROMPT_CONTENT',
}));

// Mock the library's buildSystemPrompt to capture what options it receives
vi.mock('@carto/agentic-deckgl', () => ({
  buildSystemPrompt: vi.fn((options: Record<string, unknown>) => {
    // Return a deterministic string so we can assert on the options passed in
    return `SYSTEM_PROMPT[tools=${JSON.stringify(options.toolNames)},semantic=${!!options.semanticContext},mcp=${JSON.stringify(options.mcpToolNames)},additional=${!!options.additionalPrompt}]`;
  }),
}));

import { buildSystemPrompt } from '../../../src/prompts/system-prompt.js';
import { loadSemanticModel, renderSemanticModelAsMarkdown } from '../../../src/semantic/index.js';
import { buildSystemPrompt as libBuildSystemPrompt } from '@carto/agentic-deckgl';

const mockLoad = vi.mocked(loadSemanticModel);
const mockRender = vi.mocked(renderSemanticModelAsMarkdown);
const mockLibBuild = vi.mocked(libBuildSystemPrompt);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockReturnValue(null);
});

describe('buildSystemPrompt', () => {
  it('calls loadSemanticModel on every invocation', () => {
    buildSystemPrompt(['set-deck-state']);
    expect(mockLoad).toHaveBeenCalledOnce();
  });

  it('passes tool names through to the library', () => {
    buildSystemPrompt(['set-deck-state', 'lds-geocode']);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        toolNames: ['set-deck-state', 'lds-geocode'],
      })
    );
  });

  it('does not include semantic context when no model is loaded', () => {
    mockLoad.mockReturnValue(null);
    buildSystemPrompt(['set-deck-state']);
    expect(mockRender).not.toHaveBeenCalled();
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ semanticContext: undefined })
    );
  });

  it('renders and passes semantic context when model is loaded', () => {
    const fakeModel = { semantic_model: { name: 'Test', datasets: [] } } as any;
    mockLoad.mockReturnValue(fakeModel);
    mockRender.mockReturnValue('## AVAILABLE DATA: Test');

    buildSystemPrompt(['set-deck-state']);

    expect(mockRender).toHaveBeenCalledWith(fakeModel);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ semanticContext: '## AVAILABLE DATA: Test' })
    );
  });

  it('detects MCP tool names (names containing underscores)', () => {
    buildSystemPrompt(['set-deck-state', 'carto_run_query', 'carto_list_tables']);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpToolNames: ['carto_run_query', 'carto_list_tables'],
      })
    );
  });

  it('sets mcpToolNames to undefined when no MCP tools exist', () => {
    buildSystemPrompt(['set-deck-state']);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ mcpToolNames: undefined })
    );
  });

  it('maps initialState to mapState with correct fields', () => {
    const initialState = {
      viewState: { longitude: -3.7, latitude: 40.4, zoom: 10 },
      initialViewState: { longitude: 0, latitude: 0, zoom: 4 },
      layers: [{ id: 'layer1', type: 'VectorTileLayer', visible: true }],
      activeLayerId: 'layer1',
    };

    buildSystemPrompt(['set-deck-state'], initialState);

    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: {
          viewState: initialState.viewState,
          initialViewState: initialState.initialViewState,
          layers: initialState.layers,
          activeLayerId: 'layer1',
        },
      })
    );
  });

  it('sets initialState to undefined when not provided', () => {
    buildSystemPrompt(['set-deck-state']);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ initialState: undefined })
    );
  });

  it('passes userContext through', () => {
    const userContext = { country: 'Spain', businessType: 'Restaurant' };
    buildSystemPrompt(['set-deck-state'], undefined, userContext);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ userContext })
    );
  });

  it('combines customPrompt with additionalPrompt', () => {
    buildSystemPrompt(['set-deck-state'], undefined, undefined, 'EXTRA_INSTRUCTIONS');
    const callArgs = mockLibBuild.mock.calls[0][0] as Record<string, unknown>;
    const additional = callArgs.additionalPrompt as string;
    expect(additional).toContain('CUSTOM_PROMPT_CONTENT');
    expect(additional).toContain('EXTRA_INSTRUCTIONS');
  });

  it('uses customPrompt alone when no additionalPrompt', () => {
    buildSystemPrompt(['set-deck-state']);
    const callArgs = mockLibBuild.mock.calls[0][0] as Record<string, unknown>;
    const additional = callArgs.additionalPrompt as string;
    expect(additional).toContain('CUSTOM_PROMPT_CONTENT');
  });

  it('returns the result from libBuildSystemPrompt', () => {
    const result = buildSystemPrompt(['set-deck-state']);
    expect(result).toContain('SYSTEM_PROMPT[');
  });

  it('excludes lds-geocode from MCP tools (no underscore)', () => {
    buildSystemPrompt(['set-deck-state', 'lds-geocode']);
    expect(mockLibBuild).toHaveBeenCalledWith(
      expect.objectContaining({ mcpToolNames: undefined })
    );
  });
});
