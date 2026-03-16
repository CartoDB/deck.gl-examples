/**
 * Layer Merge Utilities
 *
 * Helper functions for deep merging objects and layer specifications.
 * Used by ToolExecutor for intelligent layer updates.
 */

/**
 * Deep merge two objects
 * Recursively merges source into target, preserving nested object structure
 */
const deepMerge = (target, source) => {
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
      if (Object.keys(sourceValue).length === 0) {
        result[key] = sourceValue;
      } else {
        result[key] = deepMerge(targetValue, sourceValue);
      }
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
};

/**
 * Merge layer specs: update existing by ID, add new ones, preserve others
 * When a layer with the same ID exists, deep merges the properties
 */
export const mergeLayerSpecs = (existing, incoming) => {
  const layerMap = new Map();

  for (const layer of existing) {
    const id = layer['id'];
    if (id) {
      layerMap.set(id, layer);
    }
  }

  for (const layer of incoming) {
    const id = layer['id'];
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

/**
 * Validate that styling columns are included in data.columns
 * Logs warnings if referenced columns are missing from the data configuration
 */
export const validateLayerColumns = (layer) => {
  const fillColor = layer['getFillColor'];
  const lineColor = layer['getLineColor'];
  const pointRadius = layer['getPointRadius'];
  const lineWidth = layer['getLineWidth'];

  const accessorPattern = /properties\.(\w+)/g;
  const requiredColumns = new Set();

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
    const data = layer['data'];
    const columns = (data?.['columns']) || [];
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
