/**
 * Semantic Model Schema (OSI v1.0 + CARTO custom_extensions)
 *
 * Zod schemas following the Open Semantic Interchange v1.0 specification
 * with CARTO geospatial extensions delivered via OSI's custom_extensions mechanism.
 *
 * Types are derived via z.infer<> — no separate interfaces needed.
 */

import { z } from 'zod';

// ─── OSI Core Schemas ───────────────────────────────────────

export const dialectEnumSchema = z.enum([
  'ANSI_SQL',
  'SNOWFLAKE',
  'MDX',
  'TABLEAU',
  'DATABRICKS',
]);

export const dialectExpressionSchema = z.object({
  dialect: dialectEnumSchema.default('ANSI_SQL'),
  expression: z.string(),
});

export const expressionSchema = z.object({
  dialects: z.array(dialectExpressionSchema).min(1),
});

export const aiContextSchema = z.union([
  z.string(),
  z.object({
    instructions: z.string().optional(),
    synonyms: z.array(z.string()).optional(),
    examples: z.array(z.string()).optional(),
  }),
]);

export const dimensionSchema = z.object({
  is_time: z.boolean().optional(),
});

export const customExtensionSchema = z.object({
  vendor_name: z.string(),
  data: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

// ─── CARTO Extension Schemas ────────────────────────────────
// These validate the `data` payload when vendor_name === 'CARTO'

export const cartoSpatialIndexSchema = z.object({
  type: z.enum(['h3', 'quadbin']),
  resolution: z.number(),
  rollup_resolutions: z.array(z.number()).optional(),
});

export const cartoAggregationGuidanceSchema = z.object({
  note: z.string().optional(),
  examples: z.record(z.string(), z.string()).optional(),
});

export const cartoSpatialDataSchema = z.object({
  spatial_data_column: z.string(),
  spatial_data_type: z.enum(['point', 'polygon', 'line', 'raster', 'spatial_index']),
  srid: z.number().optional(),
  spatial_index: cartoSpatialIndexSchema.optional(),
  geographic_level: z.string().optional(),
  aggregation_guidance: cartoAggregationGuidanceSchema.optional(),
  ai_context: z
    .object({
      instructions: z.string().optional(),
    })
    .optional(),
});

export const cartoVisualizationHintSchema = z.object({
  style: z.enum(['color_bins', 'color_categories', 'color_continuous']),
  palette: z.string().optional(),
  classification: z.string().optional(),
  bins: z.number().optional(),
  domain: z.array(z.union([z.number(), z.string()])).optional(),
  format: z.string().optional(),
  note: z.string().optional(),
});

export const cartoSpatialRelationshipSchema = z.object({
  type: z.enum([
    'spatial_index_match',
    'spatial_contains',
    'spatial_intersects',
    'spatial_proximity',
  ]),
  expression: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  note: z.string().optional(),
});

export const welcomeChipSchema = z.object({
  id: z.string(),
  label: z.string(),
  prompt: z.string(),
});

export const cartoModelExtensionSchema = z.object({
  connection: z.string().optional(),
  welcome_message: z.string().optional(),
  welcome_chips: z.array(welcomeChipSchema).optional(),
  initial_view: z
    .object({
      longitude: z.number(),
      latitude: z.number(),
      zoom: z.number(),
      pitch: z.number().optional(),
      bearing: z.number().optional(),
    })
    .optional(),
  business_types: z.array(z.record(z.string(), z.unknown())).optional(),
  demographic_options: z.array(z.record(z.string(), z.unknown())).optional(),
  proximity_priorities: z.array(z.record(z.string(), z.unknown())).optional(),
});

// ─── OSI Entity Schemas ─────────────────────────────────────

export const fieldSchema = z.object({
  name: z.string(),
  expression: expressionSchema,
  dimension: dimensionSchema.optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  values: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
  ai_context: aiContextSchema.optional(),
  custom_extensions: z.array(customExtensionSchema).optional(),
});

export const datasetSchema = z.object({
  name: z.string(),
  source: z.string(),
  primary_key: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((val) => (typeof val === 'string' ? [val] : val)),
  unique_keys: z.array(z.string()).optional(),
  description: z.string().optional(),
  ai_context: aiContextSchema.optional(),
  fields: z.array(fieldSchema).optional(),
  custom_extensions: z.array(customExtensionSchema).optional(),
});

export const relationshipSchema = z.object({
  name: z.string(),
  from: z.string(),
  to: z.string(),
  from_columns: z.array(z.string()),
  to_columns: z.array(z.string()),
  custom_extensions: z.array(customExtensionSchema).optional(),
});

export const metricSchema = z.object({
  name: z.string(),
  expression: expressionSchema,
  description: z.string().optional(),
  ai_context: aiContextSchema.optional(),
  custom_extensions: z.array(customExtensionSchema).optional(),
});

export const semanticModelSchema = z.object({
  semantic_model: z.object({
    name: z.string(),
    description: z.string().optional(),
    ai_context: aiContextSchema.optional(),
    datasets: z.array(datasetSchema),
    relationships: z.array(relationshipSchema).optional(),
    metrics: z.array(metricSchema).optional(),
    custom_extensions: z.array(customExtensionSchema).optional(),
  }),
});

// ─── Derived Types ──────────────────────────────────────────

export type DialectExpression = z.infer<typeof dialectExpressionSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type AiContext = z.infer<typeof aiContextSchema>;
export type Dimension = z.infer<typeof dimensionSchema>;
export type CustomExtension = z.infer<typeof customExtensionSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type SemanticModel = z.infer<typeof semanticModelSchema>;

// CARTO extension types
export type CartoSpatialData = z.infer<typeof cartoSpatialDataSchema>;
export type CartoSpatialIndex = z.infer<typeof cartoSpatialIndexSchema>;
export type CartoAggregationGuidance = z.infer<typeof cartoAggregationGuidanceSchema>;
export type CartoVisualizationHint = z.infer<typeof cartoVisualizationHintSchema>;
export type CartoSpatialRelationship = z.infer<typeof cartoSpatialRelationshipSchema>;
export type CartoModelExtension = z.infer<typeof cartoModelExtensionSchema>;
export type WelcomeChip = z.infer<typeof welcomeChipSchema>;
