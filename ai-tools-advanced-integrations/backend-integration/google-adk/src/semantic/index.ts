/**
 * Semantic Model Module (OSI v1.0)
 *
 * Exports semantic model types, loader functions, CARTO extension helpers,
 * and utilities for integrating data context into AI prompts.
 */

// Type exports
export type {
  SemanticModel,
  Dataset,
  Field,
  Metric,
  Relationship,
  CustomExtension,
  AiContext,
  CartoSpatialData,
  CartoVisualizationHint,
  CartoSpatialRelationship,
  CartoModelExtension,
  WelcomeChip,
} from './schema.js';

// Schema exports (for external validation)
export { semanticModelSchema } from './schema.js';

// Loader and renderer exports
export {
  loadSemanticModel,
  renderSemanticModelAsMarkdown,
  clearSemanticModelCache,
  getInitialViewState,
  getWelcomeMessage,
  getWelcomeChips,
} from './loader.js';

// CARTO extension helper exports
export {
  getCartoExtension,
  getDatasetSpatialData,
  getFieldVisualizationHint,
  getModelCartoConfig,
  getMetricGroup,
} from './loader.js';
