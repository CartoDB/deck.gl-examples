/**
 * Widget Service
 *
 * Manages widget state, data fetching via @carto/api-client widget models,
 * and spatial filtering integration with the mask layer.
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { vectorTableSource, h3TableSource, quadbinTableSource } from '@deck.gl/carto';
import { createPolygonSpatialFilter } from '@carto/api-client';
import { MaskLayerService } from './mask-layer.service';
import { environment } from '../../environments/environment';

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
    default:
      throw new Error(`Unsupported widget type: ${(widget as any).type}`);
  }
}

// --- Service ---

@Injectable({
  providedIn: 'root',
})
export class WidgetService implements OnDestroy {
  private widgetsSubject = new BehaviorSubject<WidgetSpec[]>([]);
  public widgets$ = this.widgetsSubject.asObservable();

  private maskSubscription: Subscription;
  private currentMaskGeometry: GeoJSON.FeatureCollection | null = null;

  constructor(private maskLayerService: MaskLayerService) {
    // Re-fetch ALL widget data when committed mask geometry changes (not during in-progress edits)
    this.maskSubscription = this.maskLayerService.committedMaskGeometry$.subscribe((maskGeometry) => {
      this.currentMaskGeometry = maskGeometry;
      const currentWidgets = this.widgetsSubject.getValue();
      if (currentWidgets.length === 0) return;

      const spatialFilter = getSpatialFilterFromMask(maskGeometry);
      for (const widget of currentWidgets) {
        this.fetchAndUpdate(widget, spatialFilter);
      }
    });
  }

  ngOnDestroy(): void {
    this.maskSubscription.unsubscribe();
  }

  addWidget(spec: WidgetSpec): void {
    const currentWidgets = this.widgetsSubject.getValue();
    const newWidget: WidgetSpec = { ...spec, loading: true, data: undefined, error: undefined };

    const existingIndex = currentWidgets.findIndex((w) => w.id === spec.id);
    if (existingIndex >= 0) {
      const updated = [...currentWidgets];
      updated[existingIndex] = newWidget;
      this.widgetsSubject.next(updated);
    } else {
      this.widgetsSubject.next([...currentWidgets, newWidget]);
    }

    const spatialFilter = getSpatialFilterFromMask(this.currentMaskGeometry);
    this.fetchAndUpdate(spec, spatialFilter);
  }

  removeWidget(id: string): void {
    const current = this.widgetsSubject.getValue();
    this.widgetsSubject.next(current.filter((w) => w.id !== id));
  }

  clearWidgets(): void {
    this.widgetsSubject.next([]);
  }

  private async fetchAndUpdate(
    widget: WidgetSpec,
    spatialFilter?: ReturnType<typeof createPolygonSpatialFilter>
  ): Promise<void> {
    // Mark loading
    this.updateWidget(widget.id, { loading: true });

    try {
      const data = await fetchWidgetData(widget, spatialFilter);
      this.updateWidget(widget.id, { data, loading: false, error: undefined });
    } catch (err) {
      this.updateWidget(widget.id, { loading: false, error: String(err) });
    }
  }

  private updateWidget(id: string, patch: Partial<WidgetSpec>): void {
    const current = this.widgetsSubject.getValue();
    this.widgetsSubject.next(
      current.map((w) => (w.id === id ? { ...w, ...patch } : w))
    );
  }
}
