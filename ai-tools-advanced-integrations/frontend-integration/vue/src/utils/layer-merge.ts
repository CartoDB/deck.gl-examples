/**
 * Layer Merge Utilities
 *
 * Helper functions for deep merging objects and layer specifications.
 * Used by tool-executor for intelligent layer updates.
 */

export type LayerSpec = Record<string, unknown>;

const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Empty object means explicit replacement (e.g., filters: {} to clear filters)
      if (Object.keys(sourceValue as Record<string, unknown>).length === 0) {
        result[key] = sourceValue;
      } else {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      }
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
};

export const mergeLayerSpecs = (existing: LayerSpec[], incoming: LayerSpec[]): LayerSpec[] => {
  const layerMap = new Map<string, LayerSpec>();

  for (const layer of existing) {
    const id = layer['id'] as string;
    if (id) {
      layerMap.set(id, layer);
    }
  }

  for (const layer of incoming) {
    const id = layer['id'] as string;
    if (id) {
      const existingLayer = layerMap.get(id);
      if (existingLayer) {
        layerMap.set(id, deepMerge(existingLayer, layer));
      } else {
        layerMap.set(id, layer);
      }
    }
  }

  return Array.from(layerMap.values());
};

export const validateLayerColumns = (layer: LayerSpec): void => {
  const fillColor = layer['getFillColor'] as string | undefined;
  const lineColor = layer['getLineColor'] as string | undefined;
  const pointRadius = layer['getPointRadius'] as string | undefined;
  const lineWidth = layer['getLineWidth'] as string | undefined;

  const accessorPattern = /properties\.(\w+)/g;
  const requiredColumns = new Set<string>();

  for (const accessor of [fillColor, lineColor, pointRadius, lineWidth]) {
    if (typeof accessor === 'string' && accessor.includes('@@=')) {
      let match;
      accessorPattern.lastIndex = 0;
      while ((match = accessorPattern.exec(accessor)) !== null) {
        requiredColumns.add(match[1]);
      }
    }
  }

  if (requiredColumns.size > 0) {
    const data = layer['data'] as Record<string, unknown> | undefined;
    const columns = (data?.['columns'] as string[]) || [];
    const missing = [...requiredColumns].filter(
      (col) => !columns.some((c) => c.toLowerCase() === col.toLowerCase())
    );

    if (missing.length > 0) {
      console.warn(
        `[LayerMergeUtils] Layer "${layer['id']}" uses columns [${missing.join(', ')}] in accessors but they are not in data.columns.`
      );
    }
  }
};
