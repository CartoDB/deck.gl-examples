/**
 * System prompt builder for the backend
 *
 * Delegates to @carto/agentic-deckgl for core prompt generation,
 * while handling app-specific semantic model loading.
 */

import type { InitialState } from '../types/messages.js';
import type { UserContext } from '../types/user-context.js';
import {
  buildSystemPrompt as libBuildSystemPrompt,
  type BuildSystemPromptOptions,
  type MapState,
} from '@carto/agentic-deckgl';
import { loadSemanticModel, renderSemanticModelAsMarkdown } from '../semantic/index.js';
import { customPrompt } from './custom-prompt.js';

/**
 * Build the system prompt for the map control agent
 *
 * This is a thin wrapper around the library's buildSystemPrompt function,
 * adding app-specific semantic model context.
 *
 * @param toolNames - List of available tool names
 * @param initialState - Current map state (viewState, layers, etc.)
 * @param userContext - User analysis context (business type, location, etc.)
 * @param additionalPrompt - Custom prompt sections to append (app-specific instructions)
 */
export function buildSystemPrompt(
  toolNames: string[],
  initialState?: InitialState,
  userContext?: UserContext,
  additionalPrompt?: string
): string {
  // Load semantic model context (app-specific)
  const semanticModel = loadSemanticModel();
  const semanticContext = semanticModel
    ? renderSemanticModelAsMarkdown(semanticModel)
    : undefined;

  // Check for MCP tools (tools with underscores in their names)
  const mcpToolNames = toolNames.filter((name) => name.includes('_'));

  // Map InitialState to MapState (compatible types)
  const mapState: MapState | undefined = initialState
    ? {
        viewState: initialState.viewState,
        initialViewState: initialState.initialViewState,
        layers: initialState.layers,
        activeLayerId: initialState.activeLayerId,
      }
    : undefined;

  // Combine custom prompt with any additional prompt passed in
  const finalAdditionalPrompt = [customPrompt, additionalPrompt]
    .filter(Boolean)
    .join('\n\n') || undefined;

  // Build options for the library function
  const options: BuildSystemPromptOptions = {
    toolNames,
    initialState: mapState,
    userContext,
    semanticContext,
    mcpToolNames: mcpToolNames.length > 0 ? mcpToolNames : undefined,
    additionalPrompt: finalAdditionalPrompt,
  };

  return libBuildSystemPrompt(options);
}
