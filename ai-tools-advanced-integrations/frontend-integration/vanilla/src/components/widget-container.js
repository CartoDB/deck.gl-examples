function normalizeSpec(spec, widgetType) {
  const encoding = spec.encoding;
  if (!encoding) return spec;
  if (widgetType === 'category') {
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

export class WidgetContainer {
  constructor(container, { onRemove }) {
    this._container = container;
    this._onRemove = onRemove;
    this._widgets = [];
    this._container.addEventListener('click', (e) => {
      const btn = e.target.closest('.widget-remove-btn');
      if (btn) {
        const id = btn.dataset.widgetId;
        if (id) this._onRemove(id);
      }
    });
  }

  setWidgets(widgets) {
    this._widgets = widgets;
    this._render();
  }

  _render() {
    if (this._widgets.length === 0) {
      this._container.innerHTML = '';
      this._container.style.display = 'none';
      return;
    }

    this._container.style.display = '';

    this._container.innerHTML = `
      <div class="widget-container">
        <div class="widget-container-header"><h3>Widgets</h3></div>
        ${this._widgets.map(w => `
          <div class="widget-card" data-widget-id="${w.id}">
            <div class="widget-card-header">
              <span class="widget-card-title">${w.name}</span>
              <button class="widget-remove-btn" data-widget-id="${w.id}" title="Remove widget">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="widget-card-body">
              ${w.loading ? '<div class="widget-loading">Loading...</div>' : ''}
              ${w.error ? `<div class="widget-error">${w.error}</div>` : ''}
              ${!w.loading && !w.error && w.data != null ? (
                w.type === 'formula'
                  ? `<div class="widget-formula-value">${this._formatFormulaValue(w.data)}</div>`
                  : `<div class="widget-vega-container" id="vega-${w.id}"></div>`
              ) : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Render Vega charts
    for (const widget of this._widgets) {
      if (widget.type !== 'formula' && !widget.loading && !widget.error && widget.data != null) {
        this._renderVega(widget);
      }
    }
  }

  _formatFormulaValue(data) {
    const value = data?.value;
    if (value === undefined || value === null) return '';
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }

  async _renderVega(widget) {
    const container = document.getElementById(`vega-${widget.id}`);
    if (!container) return;

    try {
      const { default: embed } = await import('vega-embed');

      let values;
      const data = widget.data;
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

      await embed(container, fullSpec, { actions: false, renderer: 'svg' });
    } catch (err) {
      console.error('Vega embed error:', err);
    }
  }
}
