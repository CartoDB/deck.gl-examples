/**
 * Widget Container Component
 *
 * Displays a list of widgets (formula or Vega-Lite chart) managed by WidgetService.
 * Lazily imports vega-embed for chart rendering.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChildren,
  QueryList,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { WidgetSpec } from '../../services/widget.service';

// CARTO widget API returns pre-aggregated data with fixed field names.
// The AI may generate Vega-Lite specs with wrong field names or aggregations
// that break rendering. We force-correct the encoding.
function normalizeSpec(spec: Record<string, any>, widgetType: string): Record<string, any> {
  const encoding = spec.encoding;
  if (!encoding) return spec;

  if (widgetType === 'category') {
    // Data: [{name, value}] -- already aggregated
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

@Component({
  selector: 'app-widget-container',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './widget-container.html',
  styleUrl: './widget-container.css',
})
export class WidgetContainer implements AfterViewChecked {
  @Input() widgets: WidgetSpec[] = [];
  @Output() removeWidget = new EventEmitter<string>();

  @ViewChildren('vegaContainer') vegaContainers!: QueryList<ElementRef<HTMLDivElement>>;

  /** Track which widget IDs + data combos have already been rendered */
  private renderedMap = new Map<string, unknown>();

  formatValue(data: unknown): string {
    if (data == null) return '';
    const value = (data as any)?.value;
    if (value === undefined || value === null) return '';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
  }

  ngAfterViewChecked(): void {
    if (!this.vegaContainers) return;

    this.vegaContainers.forEach((containerRef) => {
      const el = containerRef.nativeElement;
      const widgetId = el.getAttribute('data-widget-id');
      if (!widgetId) return;

      const widget = this.widgets.find((w) => w.id === widgetId);
      if (!widget || !widget.data || widget.loading || widget.error) return;

      // Skip if already rendered with same data reference
      if (this.renderedMap.get(widgetId) === widget.data) return;
      this.renderedMap.set(widgetId, widget.data);

      this.renderVega(el, widget);
    });

    // Clean up rendered map for removed widgets
    const currentIds = new Set(this.widgets.map((w) => w.id));
    for (const key of this.renderedMap.keys()) {
      if (!currentIds.has(key)) {
        this.renderedMap.delete(key);
      }
    }
  }

  private async renderVega(container: HTMLElement, widget: WidgetSpec): Promise<void> {
    try {
      const { default: embed } = await import('vega-embed');

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

      await embed(container, fullSpec as any, {
        actions: false,
        renderer: 'svg',
      });
    } catch (err) {
      console.error('[WidgetContainer] Vega render error:', err);
    }
  }
}
