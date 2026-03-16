/**
 * useDeckProps Hook
 *
 * Converts the unified DeckSpec from state into actual deck.gl props
 * using JSONConverter.convert(fullSpec) — the official deck.gl pattern.
 *
 * This replaces the previous per-layer conversion approach (useDeckLayers)
 * with a single full-spec conversion that mirrors the deck.gl playground.
 */

import { useMemo, useRef } from 'react';
import { getJsonConverter } from '../config/deck-json-config';
import { environment } from '../config/environment';
import { useDeckState } from './useDeckState';

interface MaskLayerHook {
  isMaskActive: boolean;
  isDrawing: boolean;
  getMaskLayers: () => any[];
  injectMaskExtension: (layers: any[]) => any[];
}

export function useDeckProps(maskLayer?: MaskLayerHook): Record<string, unknown> {
  const { state } = useDeckState();
  const deckSpec = state.deckSpec;
  const cachedRef = useRef<{ converted: Record<string, unknown>; layers: any[] }>({
    converted: {},
    layers: [],
  });

  // Step 1: Convert deck spec via JSONConverter — only re-runs when deckSpec changes
  const baseProps = useMemo(() => {
    const jsonConverter = getJsonConverter();

    // Inject credentials into layers (deep clone to avoid mutating state)
    const layers = (deckSpec.layers || []).map((layerJson, index) => {
      const layer = JSON.parse(JSON.stringify(layerJson));
      layer.id = layer.id || `layer-${index}`;
      return injectCartoCredentials(layer);
    });

    // Build the full spec (initialViewState is plain data — no class instances)
    const spec = {
      initialViewState: deckSpec.initialViewState,
      layers,
      widgets: deckSpec.widgets || [],
      effects: deckSpec.effects || [],
    };

    const converted = jsonConverter.convert(spec);
    if (converted) {
      const convertedLayers = (converted as any).layers || [];
      console.log('[useDeckProps] Converted full spec:', {
        layers: layers.length,
        widgets: (deckSpec.widgets || []).length,
        effects: (deckSpec.effects || []).length,
      });
      cachedRef.current = { converted, layers: convertedLayers };
      return { converted, layers: convertedLayers };
    }

    console.error('[useDeckProps] Failed to convert spec');
    return null;
  }, [deckSpec]);

  // Step 2: Compose with mask layers — cheap operation, re-runs on mask state changes
  return useMemo(() => {
    if (!baseProps) return {};

    let finalLayers = baseProps.layers;

    if (maskLayer) {
      // Inject MaskExtension when mask has completed features (cheap clone, no API calls)
      finalLayers = maskLayer.injectMaskExtension(finalLayers);
      // Always append mask layers for visual feedback
      const maskLayers = maskLayer.getMaskLayers();
      finalLayers = [...finalLayers, ...maskLayers];
    }

    return { ...baseProps.converted, layers: finalLayers } as Record<string, unknown>;
  }, [baseProps, maskLayer]);
}

function injectCartoCredentials(
  layerJson: Record<string, unknown>
): Record<string, unknown> {
  if (layerJson['data'] && typeof layerJson['data'] === 'object') {
    const data = layerJson['data'] as Record<string, unknown>;
    const funcName = data['@@function'] as string | undefined;

    if (funcName && funcName.toLowerCase().includes('source')) {
      data['accessToken'] = environment.accessToken;
      data['apiBaseUrl'] = environment.apiBaseUrl;
      data['connectionName'] = environment.connectionName;
    }
  }

  return layerJson;
}
