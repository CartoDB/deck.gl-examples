/**
 * Widgets Hook
 *
 * Manages widget state, data fetching via @carto/api-client widget models,
 * and spatial filtering integration with the mask layer.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
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

export function getSpatialFilterFromMask(
  maskGeometry: GeoJSON.FeatureCollection | null
): ReturnType<typeof createPolygonSpatialFilter> | undefined {
  if (!maskGeometry || maskGeometry.features.length === 0) return undefined;

  if (maskGeometry.features.length === 1) {
    const geom = maskGeometry.features[0].geometry;
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      return createPolygonSpatialFilter(geom as GeoJSON.Polygon | GeoJSON.MultiPolygon);
    }
  }

  // Multiple polygons → merge into MultiPolygon
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

async function fetchWidgetData(
  widget: WidgetSpec,
  spatialFilter?: ReturnType<typeof createPolygonSpatialFilter>
): Promise<unknown> {
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
    default: {
      const _exhaustive: never = widget.type;
      throw new Error(`Unsupported widget type: ${_exhaustive}`);
    }
  }
}

// --- Hook ---

export function useWidgets(maskGeometry: GeoJSON.FeatureCollection | null) {
  const [widgets, setWidgets] = useState<WidgetSpec[]>([]);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const fetchAndUpdate = useCallback(async (widget: WidgetSpec, spatialFilter?: any) => {
    setWidgets(prev => prev.map(w => w.id === widget.id ? { ...w, loading: true } : w));

    try {
      const data = await fetchWidgetData(widget, spatialFilter);
      setWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, data, loading: false, error: undefined } : w
      ));
    } catch (err) {
      setWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, loading: false, error: String(err) } : w
      ));
    }
  }, []);

  const addWidget = useCallback((spec: WidgetSpec) => {
    const spatialFilter = getSpatialFilterFromMask(maskGeometry);
    setWidgets(prev => {
      const existing = prev.findIndex(w => w.id === spec.id);
      const newWidget = { ...spec, loading: true, data: undefined, error: undefined };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newWidget;
        return updated;
      }
      return [...prev, newWidget];
    });
    fetchAndUpdate(spec, spatialFilter);
  }, [maskGeometry, fetchAndUpdate]);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  const clearWidgets = useCallback(() => {
    setWidgets([]);
  }, []);

  // Re-fetch ALL widget data when mask geometry changes
  useEffect(() => {
    const currentWidgets = widgetsRef.current;
    if (currentWidgets.length === 0) return;

    const spatialFilter = getSpatialFilterFromMask(maskGeometry);
    for (const widget of currentWidgets) {
      fetchAndUpdate(widget, spatialFilter);
    }
  }, [maskGeometry, fetchAndUpdate]);

  return {
    widgets,
    addWidget,
    removeWidget,
    clearWidgets,
  };
}
