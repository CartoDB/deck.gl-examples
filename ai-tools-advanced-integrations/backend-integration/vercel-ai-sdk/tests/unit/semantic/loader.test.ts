import { describe, it, expect } from 'vitest';
import {
  getCartoExtension,
  getDatasetSpatialData,
  getFieldVisualizationHint,
  getModelCartoConfig,
  getMetricGroup,
  getInitialViewState,
  getWelcomeMessage,
  getWelcomeChips,
  renderSemanticModelAsMarkdown,
} from '../../../src/semantic/loader.js';
import type {
  CustomExtension,
  Dataset,
  Field,
  Metric,
  SemanticModel,
} from '../../../src/semantic/schema.js';

// ─── Helpers ────────────────────────────────────────────────

function cartoExt(data: Record<string, unknown>): CustomExtension {
  return { vendor_name: 'CARTO', data };
}

function minimalDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    name: 'test_dataset',
    source: 'project.schema.table',
    fields: [],
    ...overrides,
  } as Dataset;
}

function minimalField(overrides: Partial<Field> = {}): Field {
  return {
    name: 'test_field',
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'col' }] },
    ...overrides,
  } as Field;
}

function minimalMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    name: 'test_metric',
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(col)' }] },
    ...overrides,
  } as Metric;
}

function minimalModel(overrides: Partial<SemanticModel['semantic_model']> = {}): SemanticModel {
  return {
    semantic_model: {
      name: 'Test Model',
      datasets: [minimalDataset()],
      ...overrides,
    },
  } as SemanticModel;
}

// ─── getCartoExtension ──────────────────────────────────────

describe('getCartoExtension', () => {
  it('returns undefined for undefined extensions', () => {
    expect(getCartoExtension(undefined)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(getCartoExtension([])).toBeUndefined();
  });

  it('returns undefined when no CARTO vendor exists', () => {
    expect(getCartoExtension([{ vendor_name: 'Other', data: {} }])).toBeUndefined();
  });

  it('returns data object from CARTO extension', () => {
    const data = { spatial_data: { spatial_data_column: 'geom' } };
    const result = getCartoExtension([cartoExt(data)]);
    expect(result).toEqual(data);
  });

  it('parses JSON string data', () => {
    const data = { key: 'value' };
    const ext: CustomExtension = { vendor_name: 'CARTO', data: JSON.stringify(data) };
    expect(getCartoExtension([ext])).toEqual(data);
  });

  it('returns undefined for invalid JSON string', () => {
    const ext: CustomExtension = { vendor_name: 'CARTO', data: 'not-json{' };
    expect(getCartoExtension([ext])).toBeUndefined();
  });
});

// ─── getDatasetSpatialData ──────────────────────────────────

describe('getDatasetSpatialData', () => {
  it('returns undefined when no extensions', () => {
    const ds = minimalDataset();
    expect(getDatasetSpatialData(ds)).toBeUndefined();
  });

  it('returns undefined when spatial_data is missing', () => {
    const ds = minimalDataset({ custom_extensions: [cartoExt({})] });
    expect(getDatasetSpatialData(ds)).toBeUndefined();
  });

  it('extracts polygon spatial data', () => {
    const ds = minimalDataset({
      custom_extensions: [
        cartoExt({
          spatial_data: {
            spatial_data_column: 'geom',
            spatial_data_type: 'polygon',
          },
        }),
      ],
    });
    const result = getDatasetSpatialData(ds);
    expect(result).toBeDefined();
    expect(result!.spatial_data_type).toBe('polygon');
    expect(result!.spatial_data_column).toBe('geom');
  });

  it('extracts spatial_index data', () => {
    const ds = minimalDataset({
      custom_extensions: [
        cartoExt({
          spatial_data: {
            spatial_data_column: 'h3',
            spatial_data_type: 'spatial_index',
            spatial_index: { type: 'h3', resolution: 8 },
          },
        }),
      ],
    });
    const result = getDatasetSpatialData(ds);
    expect(result).toBeDefined();
    expect(result!.spatial_data_type).toBe('spatial_index');
    expect(result!.spatial_index?.type).toBe('h3');
  });

  it('returns undefined for invalid spatial_data', () => {
    const ds = minimalDataset({
      custom_extensions: [
        cartoExt({
          spatial_data: { spatial_data_column: 'geom', spatial_data_type: 'invalid_type' },
        }),
      ],
    });
    expect(getDatasetSpatialData(ds)).toBeUndefined();
  });
});

// ─── getFieldVisualizationHint ──────────────────────────────

describe('getFieldVisualizationHint', () => {
  it('returns undefined when no extensions', () => {
    const field = minimalField();
    expect(getFieldVisualizationHint(field)).toBeUndefined();
  });

  it('extracts color_bins visualization hint', () => {
    const field = minimalField({
      custom_extensions: [
        cartoExt({
          visualization_hint: {
            style: 'color_bins',
            palette: 'Burg',
            bins: 5,
          },
        }),
      ],
    });
    const result = getFieldVisualizationHint(field);
    expect(result).toBeDefined();
    expect(result!.style).toBe('color_bins');
    expect(result!.palette).toBe('Burg');
  });

  it('extracts color_categories visualization hint', () => {
    const field = minimalField({
      custom_extensions: [
        cartoExt({
          visualization_hint: {
            style: 'color_categories',
            domain: ['A', 'B', 'C'],
          },
        }),
      ],
    });
    const result = getFieldVisualizationHint(field);
    expect(result!.style).toBe('color_categories');
    expect(result!.domain).toEqual(['A', 'B', 'C']);
  });

  it('returns undefined for invalid hint', () => {
    const field = minimalField({
      custom_extensions: [
        cartoExt({
          visualization_hint: { style: 'invalid_style' },
        }),
      ],
    });
    expect(getFieldVisualizationHint(field)).toBeUndefined();
  });
});

// ─── getModelCartoConfig ────────────────────────────────────

describe('getModelCartoConfig', () => {
  it('returns undefined when no extensions', () => {
    const model = minimalModel();
    expect(getModelCartoConfig(model)).toBeUndefined();
  });

  it('extracts model config with welcome message and chips', () => {
    const model = minimalModel({
      custom_extensions: [
        cartoExt({
          welcome_message: 'Hello!',
          welcome_chips: [{ id: 'c1', label: 'Chip', prompt: 'Do something' }],
          initial_view: { longitude: -3.7, latitude: 40.4, zoom: 10 },
        }),
      ],
    });
    const config = getModelCartoConfig(model);
    expect(config).toBeDefined();
    expect(config!.welcome_message).toBe('Hello!');
    expect(config!.welcome_chips).toHaveLength(1);
    expect(config!.initial_view?.longitude).toBe(-3.7);
  });

  it('returns undefined for invalid data', () => {
    // cartoModelExtensionSchema accepts empty objects since all fields are optional
    // But a non-object should fail
    const model: SemanticModel = {
      semantic_model: {
        name: 'Test',
        datasets: [minimalDataset()],
        custom_extensions: [{ vendor_name: 'CARTO', data: 'not json{' }],
      },
    };
    expect(getModelCartoConfig(model)).toBeUndefined();
  });
});

// ─── getMetricGroup ─────────────────────────────────────────

describe('getMetricGroup', () => {
  it('returns undefined when no extensions', () => {
    expect(getMetricGroup(minimalMetric())).toBeUndefined();
  });

  it('returns group string from extension', () => {
    const metric = minimalMetric({
      custom_extensions: [cartoExt({ group: 'demographics' })],
    });
    expect(getMetricGroup(metric)).toBe('demographics');
  });

  it('returns undefined for non-string group', () => {
    const metric = minimalMetric({
      custom_extensions: [cartoExt({ group: 123 })],
    });
    expect(getMetricGroup(metric)).toBeUndefined();
  });
});

// ─── getInitialViewState ────────────────────────────────────

describe('getInitialViewState', () => {
  it('returns defaults when no CARTO config', () => {
    const model = minimalModel();
    const view = getInitialViewState(model);
    expect(view.longitude).toBe(-98.5795);
    expect(view.latitude).toBe(39.8283);
    expect(view.zoom).toBe(4);
    expect(view.pitch).toBe(0);
    expect(view.bearing).toBe(0);
  });

  it('uses configured values', () => {
    const model = minimalModel({
      custom_extensions: [
        cartoExt({
          initial_view: { longitude: -3.7, latitude: 40.4, zoom: 12, pitch: 45, bearing: 90 },
        }),
      ],
    });
    const view = getInitialViewState(model);
    expect(view.longitude).toBe(-3.7);
    expect(view.latitude).toBe(40.4);
    expect(view.zoom).toBe(12);
    expect(view.pitch).toBe(45);
    expect(view.bearing).toBe(90);
  });

  it('fills missing pitch/bearing with defaults', () => {
    const model = minimalModel({
      custom_extensions: [
        cartoExt({
          initial_view: { longitude: 0, latitude: 0, zoom: 5 },
        }),
      ],
    });
    const view = getInitialViewState(model);
    expect(view.longitude).toBe(0);
    expect(view.pitch).toBe(0);
    expect(view.bearing).toBe(0);
  });
});

// ─── getWelcomeMessage ──────────────────────────────────────

describe('getWelcomeMessage', () => {
  it('returns empty string when no config', () => {
    expect(getWelcomeMessage(minimalModel())).toBe('');
  });

  it('returns configured welcome message', () => {
    const model = minimalModel({
      custom_extensions: [cartoExt({ welcome_message: 'Welcome!' })],
    });
    expect(getWelcomeMessage(model)).toBe('Welcome!');
  });
});

// ─── getWelcomeChips ────────────────────────────────────────

describe('getWelcomeChips', () => {
  it('returns empty array when no config', () => {
    expect(getWelcomeChips(minimalModel())).toEqual([]);
  });

  it('returns configured chips', () => {
    const chips = [
      { id: 'c1', label: 'Chip 1', prompt: 'Show map' },
      { id: 'c2', label: 'Chip 2', prompt: 'Add layer' },
    ];
    const model = minimalModel({
      custom_extensions: [cartoExt({ welcome_chips: chips })],
    });
    expect(getWelcomeChips(model)).toEqual(chips);
  });
});

// ─── renderSemanticModelAsMarkdown ──────────────────────────

describe('renderSemanticModelAsMarkdown', () => {
  it('renders H2 heading with model name', () => {
    const md = renderSemanticModelAsMarkdown(minimalModel({ name: 'My Model' }));
    expect(md).toContain('## AVAILABLE DATA: My Model');
  });

  it('includes model description', () => {
    const md = renderSemanticModelAsMarkdown(
      minimalModel({ name: 'M', description: 'A test model' })
    );
    expect(md).toContain('A test model');
  });

  it('renders dataset name and table source', () => {
    const ds = minimalDataset({ name: 'stores', source: 'project.schema.stores' });
    const md = renderSemanticModelAsMarkdown(minimalModel({ name: 'M', datasets: [ds] }));
    expect(md).toContain('### Data Source: stores');
    expect(md).toContain('`project.schema.stores`');
  });

  it('renders spatial info for a dataset', () => {
    const ds = minimalDataset({
      custom_extensions: [
        cartoExt({
          spatial_data: {
            spatial_data_column: 'geom',
            spatial_data_type: 'point',
          },
        }),
      ],
    });
    const md = renderSemanticModelAsMarkdown(minimalModel({ name: 'M', datasets: [ds] }));
    expect(md).toContain('`geom`');
    expect(md).toContain('point');
  });

  it('renders fields with viz hints', () => {
    const field = minimalField({
      name: 'population',
      description: 'Total pop',
      custom_extensions: [
        cartoExt({
          visualization_hint: { style: 'color_bins', palette: 'Burg' },
        }),
      ],
    });
    const ds = minimalDataset({ fields: [field] });
    const md = renderSemanticModelAsMarkdown(minimalModel({ name: 'M', datasets: [ds] }));
    expect(md).toContain('`population`');
    expect(md).toContain('Total pop');
    expect(md).toContain('color_bins');
    expect(md).toContain('Burg');
  });

  it('renders metrics grouped by CARTO group tag', () => {
    const metrics = [
      minimalMetric({
        name: 'total_sales',
        description: 'Total sales',
        custom_extensions: [cartoExt({ group: 'sales' })],
      }),
      minimalMetric({
        name: 'avg_income',
        description: 'Average income',
        custom_extensions: [cartoExt({ group: 'demographics' })],
      }),
    ];
    const md = renderSemanticModelAsMarkdown(
      minimalModel({ name: 'M', metrics })
    );
    expect(md).toContain('**sales**');
    expect(md).toContain('**demographics**');
    expect(md).toContain('`total_sales`');
    expect(md).toContain('`avg_income`');
  });

  it('summarizes metrics when summarizeMetrics is true and group has > 5 metrics', () => {
    const metrics = Array.from({ length: 7 }, (_, i) =>
      minimalMetric({
        name: `metric_${i}`,
        custom_extensions: [cartoExt({ group: 'big_group' })],
      })
    );
    const md = renderSemanticModelAsMarkdown(
      minimalModel({ name: 'M', metrics }),
      { summarizeMetrics: true }
    );
    expect(md).toContain('Available:');
    expect(md).toContain('`metric_0`');
  });

  it('filters metrics by includeGroups', () => {
    const metrics = [
      minimalMetric({
        name: 'included',
        custom_extensions: [cartoExt({ group: 'keep' })],
      }),
      minimalMetric({
        name: 'excluded',
        custom_extensions: [cartoExt({ group: 'drop' })],
      }),
    ];
    const md = renderSemanticModelAsMarkdown(
      minimalModel({ name: 'M', metrics }),
      { includeGroups: ['keep'] }
    );
    expect(md).toContain('`included`');
    expect(md).not.toContain('`excluded`');
  });

  it('renders relationships', () => {
    const model = minimalModel({
      name: 'M',
      relationships: [
        {
          name: 'stores_to_sales',
          from: 'stores',
          to: 'sales',
          from_columns: ['store_id'],
          to_columns: ['store_id'],
        },
      ],
    });
    const md = renderSemanticModelAsMarkdown(model);
    expect(md).toContain('### Relationships');
    expect(md).toContain('stores_to_sales');
    expect(md).toContain('`stores`');
    expect(md).toContain('`sales`');
  });

  it('renders table recommendations section', () => {
    const ds = minimalDataset({ name: 'my_table', source: 'project.schema.my_table' });
    const md = renderSemanticModelAsMarkdown(minimalModel({ name: 'M', datasets: [ds] }));
    expect(md).toContain('### Quick Reference: Tables by Layer Type');
    expect(md).toContain('`project.schema.my_table`');
  });
});
