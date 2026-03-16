/**
 * Widgets Composable
 *
 * Manages widget state, data fetching via @carto/api-client widget models,
 * and spatial filtering integration with the mask layer.
 */

import { ref, watch } from 'vue';
import { vectorTableSource, h3TableSource, quadbinTableSource } from '@deck.gl/carto';
import { createPolygonSpatialFilter } from '@carto/api-client';
import { environment } from '../config/environment';

// --- Types ---

export interface WidgetSpec {
  id: string;
  name: string;
  type: 'formula' | 'category';
  source: {
    tableName: string;
    sourceFunction: string;
    columns?: string[];
    aggregationExp?: string;
  };
  params: {
    column: string;
    operation?: string;
    ticks?: number[];
    limit?: number;
  };
  vegaLiteSpec: Record<string, unknown>;
  data?: unknown;
  loading?: boolean;
  error?: string;
}

export interface WidgetActions {
  addWidget: (spec: WidgetSpec) => void;
  removeWidget: (id: string) => void;
  clearWidgets: () => void;
}

// --- Spatial Filter Utility ---

function getSpatialFilterFromMask(
  maskGeometry: GeoJSON.FeatureCollection | null
): ReturnType<typeof createPolygonSpatialFilter> | undefined {
  if (!maskGeometry || maskGeometry.features.length === 0) return undefined;

  if (maskGeometry.features.length === 1) {
    const geom = maskGeometry.features[0].geometry;
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      return createPolygonSpatialFilter(geom as GeoJSON.Polygon | GeoJSON.MultiPolygon);
    }
  }

  // Multiple polygons -> merge into MultiPolygon
  const coordinates: GeoJSON.Position[][][] = [];
  for (const feature of maskGeometry.features) {
    if (feature.geometry.type === 'Polygon') {
      coordinates.push((feature.geometry as GeoJSON.Polygon).coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
      coordinates.push(...(feature.geometry as GeoJSON.MultiPolygon).coordinates);
    }
  }

  if (coordinates.length === 0) return undefined;
  return createPolygonSpatialFilter({ type: 'MultiPolygon', coordinates });
}

// --- Data Fetching ---

const SOURCE_CREATORS: Record<string, typeof vectorTableSource> = {
  vectorTableSource,
  h3TableSource: h3TableSource as any,
  quadbinTableSource: quadbinTableSource as any,
};

const credentials = {
  apiBaseUrl: environment.apiBaseUrl,
  accessToken: environment.accessToken,
  connectionName: environment.connectionName,
};

async function fetchWidgetData(widget: WidgetSpec, spatialFilter?: any): Promise<unknown> {
  const createSource = SOURCE_CREATORS[widget.source.sourceFunction] || vectorTableSource;

  const sourceConfig: any = {
    ...credentials,
    tableName: widget.source.tableName,
    columns: widget.source.columns,
  };
  if (widget.source.aggregationExp) {
    sourceConfig.aggregationExp = widget.source.aggregationExp;
  }
  const source = await createSource(sourceConfig);

  const ws = source.widgetSource;

  switch (widget.type) {
    case 'formula':
      return ws.getFormula({
        column: widget.params.column,
        operation: (widget.params.operation || 'sum') as any,
        spatialFilter,
      });
    case 'category':
      return ws.getCategories({
        column: widget.params.column,
        operation: (widget.params.operation || 'count') as any,
        spatialFilter,
      });
    default:
      throw new Error(`Unsupported widget type: ${widget.type}`);
  }
}

// --- Composable ---

export function useWidgets(getMaskGeometry: () => GeoJSON.FeatureCollection | null) {
  const widgets = ref<WidgetSpec[]>([]);

  async function fetchAndUpdate(widget: WidgetSpec, spatialFilter?: any) {
    widgets.value = widgets.value.map(w => w.id === widget.id ? { ...w, loading: true } : w);
    try {
      const data = await fetchWidgetData(widget, spatialFilter);
      widgets.value = widgets.value.map(w =>
        w.id === widget.id ? { ...w, data, loading: false, error: undefined } : w
      );
    } catch (err) {
      widgets.value = widgets.value.map(w =>
        w.id === widget.id ? { ...w, loading: false, error: String(err) } : w
      );
    }
  }

  function addWidget(spec: WidgetSpec) {
    const spatialFilter = getSpatialFilterFromMask(getMaskGeometry());
    const newWidget = { ...spec, loading: true, data: undefined, error: undefined };
    const existing = widgets.value.findIndex(w => w.id === spec.id);
    if (existing >= 0) {
      const updated = [...widgets.value];
      updated[existing] = newWidget;
      widgets.value = updated;
    } else {
      widgets.value = [...widgets.value, newWidget];
    }
    fetchAndUpdate(spec, spatialFilter);
  }

  function removeWidget(id: string) {
    widgets.value = widgets.value.filter(w => w.id !== id);
  }

  function clearWidgets() {
    widgets.value = [];
  }

  // Watch mask geometry changes to re-fetch all widgets
  watch(getMaskGeometry, () => {
    if (widgets.value.length === 0) return;
    const spatialFilter = getSpatialFilterFromMask(getMaskGeometry());
    for (const widget of widgets.value) {
      fetchAndUpdate(widget, spatialFilter);
    }
  });

  return { widgets, addWidget, removeWidget, clearWidgets };
}
