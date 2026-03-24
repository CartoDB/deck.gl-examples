/**
 * Semantic Model Loader (OSI v1.0)
 *
 * Loads, validates, merges, and caches semantic model YAML files.
 * Renders semantic models as markdown for prompt injection.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import {
  semanticModelSchema,
  cartoSpatialDataSchema,
  cartoVisualizationHintSchema,
  cartoModelExtensionSchema,
  type SemanticModel,
  type Dataset,
  type Field,
  type Metric,
  type CustomExtension,
  type CartoSpatialData,
  type CartoVisualizationHint,
  type CartoModelExtension,
} from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CARTO Extension Helpers ────────────────────────────────

/**
 * Extract CARTO extension data from a custom_extensions array.
 * Returns the raw `data` object/string for vendor_name === 'CARTO', or undefined.
 */
export function getCartoExtension(
  extensions?: CustomExtension[]
): Record<string, unknown> | undefined {
  if (!extensions) return undefined;
  const ext = extensions.find((e) => e.vendor_name === 'CARTO');
  if (!ext) return undefined;
  if (typeof ext.data === 'string') {
    try {
      return JSON.parse(ext.data);
    } catch {
      return undefined;
    }
  }
  return ext.data as Record<string, unknown>;
}

/**
 * Extract and validate spatial_data from a dataset's CARTO extension.
 */
export function getDatasetSpatialData(
  dataset: Dataset
): CartoSpatialData | undefined {
  const data = getCartoExtension(dataset.custom_extensions);
  if (!data?.spatial_data) return undefined;
  const result = cartoSpatialDataSchema.safeParse(data.spatial_data);
  return result.success ? result.data : undefined;
}

/**
 * Extract and validate visualization_hint from a field's CARTO extension.
 */
export function getFieldVisualizationHint(
  field: Field
): CartoVisualizationHint | undefined {
  const data = getCartoExtension(field.custom_extensions);
  if (!data?.visualization_hint) return undefined;
  const result = cartoVisualizationHintSchema.safeParse(data.visualization_hint);
  return result.success ? result.data : undefined;
}

/**
 * Extract and validate model-level CARTO extension data.
 */
export function getModelCartoConfig(
  model: SemanticModel
): CartoModelExtension | undefined {
  const data = getCartoExtension(model.semantic_model.custom_extensions);
  if (!data) return undefined;
  const result = cartoModelExtensionSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Extract the metric group tag from a metric's CARTO extension.
 */
export function getMetricGroup(metric: Metric): string | undefined {
  const data = getCartoExtension(metric.custom_extensions);
  return typeof data?.group === 'string' ? data.group : undefined;
}

// ─── Caching ────────────────────────────────────────────────

let cachedModel: SemanticModel | null | undefined;

/**
 * Clear the cached semantic model (for testing).
 */
export function clearSemanticModelCache(): void {
  cachedModel = undefined;
}

// ─── Loader ─────────────────────────────────────────────────

/**
 * Load semantic model(s) from YAML files in the semantic/layers directory.
 * Validates each file with Zod, merges datasets/metrics/relationships,
 * and caches the result.
 */
export function loadSemanticModel(): SemanticModel | null {
  if (cachedModel !== undefined) return cachedModel;

  const semanticDir = join(__dirname, 'layers');

  if (!existsSync(semanticDir)) {
    console.warn('[Semantic] Layers directory not found:', semanticDir);
    cachedModel = null;
    return null;
  }

  const files = readdirSync(semanticDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  if (files.length === 0) {
    console.warn('[Semantic] No .yaml files found in layers directory');
    cachedModel = null;
    return null;
  }

  let merged: SemanticModel | null = null;

  for (const file of files) {
    try {
      const content = readFileSync(join(semanticDir, file), 'utf-8');
      const raw = yaml.load(content);
      const result = semanticModelSchema.safeParse(raw);

      if (!result.success) {
        const errors = result.error.issues
          .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
        console.warn(`[Semantic] Validation failed for ${file}:\n${errors}`);
        continue;
      }

      const parsed = result.data;

      if (!merged) {
        // First valid file becomes the base
        merged = parsed;
      } else {
        // Merge: concatenate datasets, metrics, relationships
        if (parsed.semantic_model.datasets) {
          merged.semantic_model.datasets.push(...parsed.semantic_model.datasets);
        }
        if (parsed.semantic_model.metrics) {
          if (!merged.semantic_model.metrics) {
            merged.semantic_model.metrics = [];
          }
          merged.semantic_model.metrics.push(...parsed.semantic_model.metrics);
        }
        if (parsed.semantic_model.relationships) {
          if (!merged.semantic_model.relationships) {
            merged.semantic_model.relationships = [];
          }
          merged.semantic_model.relationships.push(
            ...parsed.semantic_model.relationships
          );
        }
        // Merge custom_extensions: concatenate welcome_chips from CARTO extensions
        if (parsed.semantic_model.custom_extensions) {
          if (!merged.semantic_model.custom_extensions) {
            merged.semantic_model.custom_extensions = parsed.semantic_model.custom_extensions;
          } else {
            const mergedCarto = merged.semantic_model.custom_extensions.find(
              (e) => e.vendor_name === 'CARTO'
            );
            const parsedCarto = parsed.semantic_model.custom_extensions.find(
              (e) => e.vendor_name === 'CARTO'
            );
            if (mergedCarto && parsedCarto && typeof mergedCarto.data === 'object' && typeof parsedCarto.data === 'object') {
              const mergedData = mergedCarto.data as Record<string, unknown>;
              const parsedData = parsedCarto.data as Record<string, unknown>;
              // Concatenate welcome_chips arrays
              if (parsedData.welcome_chips) {
                const existingChips = (mergedData.welcome_chips as unknown[]) ?? [];
                const newChips = parsedData.welcome_chips as unknown[];
                mergedData.welcome_chips = [...existingChips, ...newChips];
              }
            } else if (!mergedCarto && parsedCarto) {
              merged.semantic_model.custom_extensions.push(parsedCarto);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[Semantic] Error loading ${file}:`, error);
    }
  }

  if (merged) {
    const datasetCount = merged.semantic_model.datasets.length;
    const metricCount = merged.semantic_model.metrics?.length ?? 0;
    console.log(
      `[Semantic] Loaded semantic model: ${datasetCount} dataset(s), ${metricCount} metric(s) from ${files.length} file(s)`
    );
  }

  cachedModel = merged;
  return merged;
}

// ─── Markdown Rendering ─────────────────────────────────────

export interface RenderOptions {
  /** Summarize metrics by group instead of listing each one */
  summarizeMetrics?: boolean;
  /** Only include metrics from these groups */
  includeGroups?: string[];
}

/**
 * Get the deck.gl layer type for a spatial data type.
 */
function getLayerTypeForSpatialData(spatialType: string): string {
  switch (spatialType) {
    case 'spatial_index':
      return 'H3TileLayer';
    case 'point':
    case 'polygon':
    case 'line':
      return 'VectorTileLayer';
    default:
      return 'VectorTileLayer';
  }
}

/**
 * Get the CARTO source function for a spatial data type,
 * considering the spatial index type for h3/quadbin.
 */
function getSourceFunction(
  spatialType: string,
  spatialData?: CartoSpatialData
): string {
  if (spatialType === 'spatial_index') {
    const indexType = spatialData?.spatial_index?.type;
    if (indexType === 'quadbin') return 'quadbinTableSource';
    return 'h3TableSource';
  }
  return 'vectorTableSource';
}

/**
 * Render table recommendations to help AI select the correct table for each layer type.
 */
function renderTableRecommendations(datasets: Dataset[]): string {
  let md = `### Quick Reference: Tables by Layer Type\n`;
  md += `**IMPORTANT:** When creating layers, use these tables from the semantic model:\n\n`;

  for (const dataset of datasets) {
    const spatial = getDatasetSpatialData(dataset);
    const spatialType = spatial?.spatial_data_type ?? 'polygon';
    const layerType = getLayerTypeForSpatialData(spatialType);
    const sourceFunc = getSourceFunction(spatialType, spatial);

    md += `- **${layerType}** (${sourceFunc}): Use \`${dataset.source}\`\n`;
    if (dataset.description) {
      md += `  - Contains: ${dataset.description}\n`;
    }
  }
  md += `\n`;
  return md;
}

/**
 * Get ai_context instructions as a string.
 */
function getAiInstructions(
  aiContext: string | { instructions?: string; synonyms?: string[] } | undefined
): string | undefined {
  if (!aiContext) return undefined;
  if (typeof aiContext === 'string') return aiContext;
  return aiContext.instructions;
}

/**
 * Render a single dataset as markdown.
 */
function renderDatasetAsMarkdown(dataset: Dataset): string {
  const spatial = getDatasetSpatialData(dataset);

  let md = `### Data Source: ${dataset.name}\n`;
  md += `- **Table:** \`${dataset.source}\`\n`;
  if (dataset.description) {
    md += `- **Description:** ${dataset.description}\n`;
  }
  if (spatial) {
    md += `- **Spatial:** \`${spatial.spatial_data_column}\` (${spatial.spatial_data_type}`;
    if (spatial.spatial_index) {
      md += `, ${spatial.spatial_index.type} res ${spatial.spatial_index.resolution}`;
    }
    md += `)\n`;
    if (spatial.geographic_level) {
      md += `- **Geographic level:** ${spatial.geographic_level}\n`;
    }
  }

  const instructions = getAiInstructions(dataset.ai_context);
  if (instructions) {
    md += `- **AI context:** ${instructions}\n`;
  }

  md += `\n`;

  // Render fields
  if (dataset.fields && dataset.fields.length > 0) {
    md += `**Fields:**\n`;
    for (const field of dataset.fields) {
      const desc = field.description || '';
      const dimLabel = field.dimension ? ' (dimension)' : '';
      md += `- \`${field.name}\`${dimLabel}${desc ? `: ${desc}` : ''}\n`;

      const vizHint = getFieldVisualizationHint(field);
      if (vizHint) {
        md += `  - *Viz hint:* ${vizHint.style}`;
        if (vizHint.palette) md += ` with ${vizHint.palette} palette`;
        if (vizHint.domain)
          md += `, domain: [${vizHint.domain.join(', ')}]`;
        md += `\n`;
      }

      if (field.values && field.values.length > 0) {
        const formatted = field.values.map((v) => v === null ? 'null' : String(v));
        md += `  - *Values:* ${formatted.join(', ')}\n`;
      }

      const fieldInstructions = getAiInstructions(field.ai_context);
      if (fieldInstructions) {
        md += `  - *AI:* ${fieldInstructions}\n`;
      }
    }
  }

  // Render aggregation guidance
  if (spatial?.aggregation_guidance?.note) {
    md += `\n**Aggregation guidance:** ${spatial.aggregation_guidance.note}\n`;
  }

  md += `\n`;
  return md;
}

/**
 * Render metrics, grouped by CARTO group tag.
 */
function renderMetricsAsMarkdown(
  metrics: Metric[],
  options?: RenderOptions
): string {
  if (metrics.length === 0) return '';

  // Group metrics by their CARTO group tag
  const groups = new Map<string, Metric[]>();
  for (const metric of metrics) {
    const group = getMetricGroup(metric) ?? 'general';
    if (
      options?.includeGroups &&
      !options.includeGroups.includes(group)
    ) {
      continue;
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(metric);
  }

  if (groups.size === 0) return '';

  let md = `### Metrics\n`;

  for (const [group, groupMetrics] of groups) {
    md += `\n**${group}** (${groupMetrics.length} metrics):\n`;

    if (options?.summarizeMetrics && groupMetrics.length > 5) {
      // Summarize: just list names
      md += `- Available: ${groupMetrics.map((m) => `\`${m.name}\``).join(', ')}\n`;
    } else {
      for (const metric of groupMetrics) {
        const desc = metric.description || '';
        md += `- \`${metric.name}\`${desc ? `: ${desc}` : ''}\n`;
        const instructions = getAiInstructions(metric.ai_context);
        if (instructions) {
          md += `  - *AI:* ${instructions}\n`;
        }
      }
    }
  }

  md += `\n`;
  return md;
}

/**
 * Render the full semantic model as markdown for injection into the system prompt.
 */
export function renderSemanticModelAsMarkdown(
  model: SemanticModel,
  options?: RenderOptions
): string {
  const sm = model.semantic_model;
  const cartoConfig = getModelCartoConfig(model);

  let md = `## AVAILABLE DATA: ${sm.name}\n\n`;
  if (sm.description) {
    md += `${sm.description}\n\n`;
  }

  const modelInstructions = getAiInstructions(sm.ai_context);
  if (modelInstructions) {
    md += `**Instructions:** ${modelInstructions}\n\n`;
  }

  // Table recommendations
  md += renderTableRecommendations(sm.datasets);

  // Render datasets
  for (const dataset of sm.datasets) {
    md += renderDatasetAsMarkdown(dataset);
  }

  // Render relationships
  if (sm.relationships && sm.relationships.length > 0) {
    md += `### Relationships\n`;
    for (const rel of sm.relationships) {
      md += `- **${rel.name}:** \`${rel.from}\` → \`${rel.to}\` on [${rel.from_columns.join(', ')}] = [${rel.to_columns.join(', ')}]\n`;
      const relData = getCartoExtension(rel.custom_extensions);
      if (relData?.spatial_relationship) {
        const sr = relData.spatial_relationship as Record<string, unknown>;
        md += `  - *Spatial:* ${sr.type}`;
        if (sr.note) md += ` — ${sr.note}`;
        md += `\n`;
      }
    }
    md += `\n`;
  }

  // Render metrics
  if (sm.metrics && sm.metrics.length > 0) {
    md += renderMetricsAsMarkdown(sm.metrics, options);
  }

  // Render model-level CARTO context (business_types, etc.)
  if (cartoConfig?.business_types && cartoConfig.business_types.length > 0) {
    md += `### Business Types\n`;
    md += `The user can analyze locations for these business types:\n`;
    for (const bt of cartoConfig.business_types) {
      const name = (bt as Record<string, unknown>).name ?? (bt as Record<string, unknown>).id ?? 'Unknown';
      md += `- **${name}**\n`;
    }
    md += `\n`;
  }

  if (cartoConfig?.demographic_options && cartoConfig.demographic_options.length > 0) {
    md += `### Demographic Options\n`;
    md += `Available demographic dimensions for analysis:\n`;
    for (const demo of cartoConfig.demographic_options) {
      const name = (demo as Record<string, unknown>).name ?? (demo as Record<string, unknown>).id ?? 'Unknown';
      md += `- **${name}**\n`;
    }
    md += `\n`;
  }

  return md;
}

// ─── Convenience Functions ──────────────────────────────────

/**
 * Get the initial view state from the model-level CARTO extension.
 */
export function getInitialViewState(model: SemanticModel): {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
} {
  const config = getModelCartoConfig(model);
  const view = config?.initial_view;

  return {
    longitude: view?.longitude ?? -98.5795,
    latitude: view?.latitude ?? 39.8283,
    zoom: view?.zoom ?? 4,
    pitch: view?.pitch ?? 0,
    bearing: view?.bearing ?? 0,
  };
}

/**
 * Get the welcome message from the model-level CARTO extension.
 */
export function getWelcomeMessage(model: SemanticModel): string {
  const config = getModelCartoConfig(model);
  return config?.welcome_message ?? '';
}

/**
 * Get welcome chips from the model-level CARTO extension.
 */
export function getWelcomeChips(
  model: SemanticModel
): Array<{ id: string; label: string; prompt: string }> {
  const config = getModelCartoConfig(model);
  return config?.welcome_chips ?? [];
}
