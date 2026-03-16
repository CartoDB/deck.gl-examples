import { describe, it, expect } from 'vitest';
import {
  semanticModelSchema,
  cartoSpatialDataSchema,
  cartoVisualizationHintSchema,
  cartoModelExtensionSchema,
} from '../../../src/semantic/schema.js';

// ─── semanticModelSchema ────────────────────────────────────

describe('semanticModelSchema', () => {
  it('accepts a minimal valid model', () => {
    const input = {
      semantic_model: {
        name: 'Test',
        datasets: [
          {
            name: 'ds1',
            source: 'project.schema.table',
          },
        ],
      },
    };
    const result = semanticModelSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts a full dataset with fields', () => {
    const input = {
      semantic_model: {
        name: 'Full Model',
        description: 'A full test model',
        datasets: [
          {
            name: 'stores',
            source: 'project.schema.stores',
            description: 'Retail stores',
            primary_key: 'store_id',
            fields: [
              {
                name: 'revenue',
                expression: {
                  dialects: [{ dialect: 'ANSI_SQL', expression: 'revenue' }],
                },
                description: 'Store revenue',
              },
            ],
          },
        ],
        metrics: [
          {
            name: 'total_revenue',
            expression: {
              dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(revenue)' }],
            },
          },
        ],
      },
    };
    const result = semanticModelSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.semantic_model.datasets[0].primary_key).toEqual(['store_id']);
    }
  });

  it('rejects when name is missing', () => {
    const input = {
      semantic_model: {
        datasets: [{ name: 'ds1', source: 'table' }],
      },
    };
    const result = semanticModelSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects when datasets is missing', () => {
    const input = {
      semantic_model: {
        name: 'NoDatasets',
      },
    };
    const result = semanticModelSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts datasets with custom_extensions', () => {
    const input = {
      semantic_model: {
        name: 'WithExt',
        datasets: [
          {
            name: 'ds1',
            source: 'table',
            custom_extensions: [
              {
                vendor_name: 'CARTO',
                data: { spatial_data: { column: 'geom' } },
              },
            ],
          },
        ],
      },
    };
    const result = semanticModelSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

// ─── cartoSpatialDataSchema ─────────────────────────────────

describe('cartoSpatialDataSchema', () => {
  it('accepts point type', () => {
    const result = cartoSpatialDataSchema.safeParse({
      spatial_data_column: 'geom',
      spatial_data_type: 'point',
    });
    expect(result.success).toBe(true);
  });

  it('accepts polygon type', () => {
    const result = cartoSpatialDataSchema.safeParse({
      spatial_data_column: 'geom',
      spatial_data_type: 'polygon',
    });
    expect(result.success).toBe(true);
  });

  it('accepts spatial_index with h3', () => {
    const result = cartoSpatialDataSchema.safeParse({
      spatial_data_column: 'h3',
      spatial_data_type: 'spatial_index',
      spatial_index: { type: 'h3', resolution: 8 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid spatial_data_type', () => {
    const result = cartoSpatialDataSchema.safeParse({
      spatial_data_column: 'geom',
      spatial_data_type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional geographic_level', () => {
    const result = cartoSpatialDataSchema.safeParse({
      spatial_data_column: 'geom',
      spatial_data_type: 'polygon',
      geographic_level: 'county',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geographic_level).toBe('county');
    }
  });
});

// ─── cartoVisualizationHintSchema ───────────────────────────

describe('cartoVisualizationHintSchema', () => {
  it('accepts color_bins style', () => {
    const result = cartoVisualizationHintSchema.safeParse({
      style: 'color_bins',
      palette: 'Burg',
      bins: 5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts color_categories style', () => {
    const result = cartoVisualizationHintSchema.safeParse({
      style: 'color_categories',
      domain: ['A', 'B'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts color_continuous style', () => {
    const result = cartoVisualizationHintSchema.safeParse({
      style: 'color_continuous',
      palette: 'Temps',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid style', () => {
    const result = cartoVisualizationHintSchema.safeParse({
      style: 'gradient',
    });
    expect(result.success).toBe(false);
  });

  it('accepts domain with mixed number and string values', () => {
    const result = cartoVisualizationHintSchema.safeParse({
      style: 'color_bins',
      domain: [0, 100, 'high'],
    });
    expect(result.success).toBe(true);
  });
});

// ─── cartoModelExtensionSchema ──────────────────────────────

describe('cartoModelExtensionSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = cartoModelExtensionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts welcome_chips', () => {
    const result = cartoModelExtensionSchema.safeParse({
      welcome_chips: [{ id: 'c1', label: 'L', prompt: 'P' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts initial_view', () => {
    const result = cartoModelExtensionSchema.safeParse({
      initial_view: { longitude: -3.7, latitude: 40.4, zoom: 10 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts business_types', () => {
    const result = cartoModelExtensionSchema.safeParse({
      business_types: [{ name: 'Restaurant', id: 'restaurant' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts full config', () => {
    const result = cartoModelExtensionSchema.safeParse({
      connection: 'carto_dw',
      welcome_message: 'Hello!',
      welcome_chips: [{ id: 'c1', label: 'L', prompt: 'P' }],
      initial_view: { longitude: 0, latitude: 0, zoom: 4 },
      business_types: [],
      demographic_options: [],
    });
    expect(result.success).toBe(true);
  });
});
