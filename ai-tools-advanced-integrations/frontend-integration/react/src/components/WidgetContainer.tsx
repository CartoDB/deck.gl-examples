import { useEffect, useRef } from 'react';
import type { WidgetSpec } from '../hooks/useWidgets';
import './WidgetContainer.css';

interface WidgetContainerProps {
  widgets: WidgetSpec[];
  onRemove: (id: string) => void;
}

function FormulaWidget({ widget }: { widget: WidgetSpec }) {
  const value = (widget.data as any)?.value;
  if (value === undefined || value === null) return null;
  return (
    <div className="widget-formula-value">
      {typeof value === 'number' ? value.toLocaleString() : String(value)}
    </div>
  );
}

// CARTO widget API returns pre-aggregated data with fixed field names.
// The AI may generate Vega-Lite specs with wrong field names or aggregations
// that break rendering. We force-correct the encoding.
function normalizeSpec(spec: Record<string, any>, widgetType: string): Record<string, any> {
  const encoding = spec.encoding;
  if (!encoding) return spec;

  if (widgetType === 'category') {
    // Data: [{name, value}] — already aggregated
    return {
      ...spec,
      encoding: {
        x: { field: 'name', type: 'nominal', title: encoding.x?.title },
        y: { field: 'value', type: 'quantitative', title: encoding.y?.title },
      },
    };
  }

  return spec;
}

function VegaWidget({ widget }: { widget: WidgetSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !widget.data) return;

    let cancelled = false;

    import('vega-embed').then(({ default: embed }) => {
      if (cancelled || !containerRef.current) return;

      let values: unknown[];
      const data = widget.data as any;
      if (Array.isArray(data)) {
        values = data;
      } else if (data?.rows && Array.isArray(data.rows)) {
        values = data.rows;
      } else {
        values = [data];
      }

      const normalizedSpec = normalizeSpec(widget.vegaLiteSpec, widget.type);

      const fullSpec = {
        ...normalizedSpec,
        data: { values },
        width: 'container',
        height: 150,
        background: 'transparent',
        config: {
          axis: { labelColor: '#64748b', titleColor: '#475569', gridColor: '#e2e8f0' },
          legend: { labelColor: '#475569', titleColor: '#475569' },
          title: { color: '#1e293b' },
          view: { stroke: 'transparent' },
        },
      };

      embed(containerRef.current!, fullSpec as any, {
        actions: false,
        renderer: 'svg',
      }).catch(console.error);
    });

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [widget.vegaLiteSpec, widget.data]);

  return <div ref={containerRef} className="widget-vega-container" />;
}

export function WidgetContainer({ widgets, onRemove }: WidgetContainerProps) {
  if (widgets.length === 0) return null;

  return (
    <div className="widget-container">
      <div className="widget-container-header">
        <h3>Widgets</h3>
      </div>
      {widgets.map((widget) => (
        <div key={widget.id} className="widget-card">
          <div className="widget-card-header">
            <span className="widget-card-title">{widget.name}</span>
            <button
              className="widget-remove-btn"
              onClick={() => onRemove(widget.id)}
              title="Remove widget"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="widget-card-body">
            {widget.loading && <div className="widget-loading">Loading...</div>}
            {widget.error && <div className="widget-error">{String(widget.error)}</div>}
            {!widget.loading && !widget.error && widget.data != null && (
              widget.type === 'formula'
                ? <FormulaWidget widget={widget} />
                : <VegaWidget widget={widget} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
