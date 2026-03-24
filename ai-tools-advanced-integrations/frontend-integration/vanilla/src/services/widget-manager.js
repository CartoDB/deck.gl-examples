import { vectorTableSource, h3TableSource, quadbinTableSource } from '@deck.gl/carto';
import { createPolygonSpatialFilter } from '@carto/api-client';
import { EventEmitter } from '../state/event-emitter.js';
import { environment } from '../config/environment.js';

const SOURCE_CREATORS = {
  vectorTableSource,
  h3TableSource,
  quadbinTableSource,
};

const credentials = {
  apiBaseUrl: environment.apiBaseUrl,
  accessToken: environment.accessToken,
  connectionName: environment.connectionName,
};

function getSpatialFilterFromMask(maskGeometry) {
  if (!maskGeometry || maskGeometry.features.length === 0) return undefined;
  if (maskGeometry.features.length === 1) {
    const geom = maskGeometry.features[0].geometry;
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      return createPolygonSpatialFilter(geom);
    }
  }
  const coordinates = [];
  for (const feature of maskGeometry.features) {
    if (feature.geometry.type === 'Polygon') {
      coordinates.push(feature.geometry.coordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
      coordinates.push(...feature.geometry.coordinates);
    }
  }
  if (coordinates.length === 0) return undefined;
  return createPolygonSpatialFilter({ type: 'MultiPolygon', coordinates });
}

async function fetchWidgetData(widget, spatialFilter) {
  const createSource = SOURCE_CREATORS[widget.source.sourceFunction] || vectorTableSource;
  const sourceConfig = {
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
      return ws.getFormula({ column: widget.params.column, operation: widget.params.operation || 'sum', spatialFilter });
    case 'category':
      return ws.getCategories({ column: widget.params.column, operation: widget.params.operation || 'count', spatialFilter });
    default:
      throw new Error(`Unsupported widget type: ${widget.type}`);
  }
}

export class WidgetManager extends EventEmitter {
  constructor(maskLayerManager) {
    super();
    this._widgets = [];
    this._maskLayerManager = maskLayerManager;

    // Re-fetch all widgets when committed mask geometry changes (not during in-progress edits)
    if (maskLayerManager) {
      maskLayerManager.on('geometry-committed', () => {
        if (this._widgets.length === 0) return;
        const spatialFilter = getSpatialFilterFromMask(
          maskLayerManager.getState().committedGeometry
        );
        for (const widget of this._widgets) {
          this._fetchAndUpdate(widget, spatialFilter);
        }
      });
    }
  }

  getWidgets() {
    return this._widgets;
  }

  addWidget(spec) {
    const spatialFilter = this._maskLayerManager
      ? getSpatialFilterFromMask(this._maskLayerManager.getState().committedGeometry)
      : undefined;
    const newWidget = { ...spec, loading: true, data: undefined, error: undefined };
    const existing = this._widgets.findIndex(w => w.id === spec.id);
    if (existing >= 0) {
      this._widgets[existing] = newWidget;
    } else {
      this._widgets.push(newWidget);
    }
    this.emit('change', this._widgets);
    this._fetchAndUpdate(spec, spatialFilter);
  }

  removeWidget(id) {
    this._widgets = this._widgets.filter(w => w.id !== id);
    this.emit('change', this._widgets);
  }

  clearWidgets() {
    this._widgets = [];
    this.emit('change', this._widgets);
  }

  async _fetchAndUpdate(widget, spatialFilter) {
    this._widgets = this._widgets.map(w =>
      w.id === widget.id ? { ...w, loading: true } : w
    );
    this.emit('change', this._widgets);
    try {
      const data = await fetchWidgetData(widget, spatialFilter);
      this._widgets = this._widgets.map(w =>
        w.id === widget.id ? { ...w, data, loading: false, error: undefined } : w
      );
    } catch (err) {
      this._widgets = this._widgets.map(w =>
        w.id === widget.id ? { ...w, loading: false, error: String(err) } : w
      );
    }
    this.emit('change', this._widgets);
  }
}
