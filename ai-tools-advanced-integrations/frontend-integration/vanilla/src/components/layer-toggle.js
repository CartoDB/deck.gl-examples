/**
 * Layer Toggle Component
 *
 * Collapsible panel showing layer list with visibility toggles,
 * fly-to buttons, expand/collapse details, and legend rendering.
 */

export class LayerToggle {
  constructor(container, { onToggle, onFlyTo }) {
    this._container = container;
    this._onToggle = onToggle;
    this._onFlyTo = onFlyTo;
    this._layers = [];
    this._disabled = true;
    this._isPanelCollapsed = false;
    this._expandedLayers = new Set();
    this._render();
  }

  setLayers(layers) {
    const isFirstLoad = this._layers.length === 0 && layers.length > 0;
    this._layers = layers;
    if (isFirstLoad) {
      layers.forEach((layer) => this._expandedLayers.add(layer.id));
    }
    this._render();
  }

  setDisabled(disabled) {
    this._disabled = disabled;
    this._render();
  }

  _togglePanel() {
    this._isPanelCollapsed = !this._isPanelCollapsed;
    this._render();
  }

  _toggleLayerExpansion(layerId) {
    if (this._expandedLayers.has(layerId)) {
      this._expandedLayers.delete(layerId);
    } else {
      this._expandedLayers.add(layerId);
    }
    this._render();
  }

  _getGradientStyle(functionConfig) {
    if (!functionConfig?.colors || functionConfig.colors.length === 0) return '';
    const stops = functionConfig.colors
      .map((color, i) => {
        const pct = (i / (functionConfig.colors.length - 1)) * 100;
        return `${color} ${pct}%`;
      })
      .join(', ');
    return `linear-gradient(to right, ${stops})`;
  }

  _getMinDomainValue(domain) {
    if (!domain || domain.length === 0) return '';
    return typeof domain[0] === 'number' ? `< ${domain[0]}` : String(domain[0]);
  }

  _getMaxDomainValue(domain) {
    if (!domain || domain.length === 0) return '';
    return typeof domain[0] === 'number'
      ? `≥ ${domain[domain.length - 1]}`
      : String(domain[domain.length - 1]);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _renderLegend(layer) {
    const legend = layer.legend;
    if (!legend) {
      return `
        <div class="legend-container">
          <div class="legend-entry">
            <span class="legend-dot" style="background-color:${layer.color || '#888'}"></span>
            <span class="legend-label">${this._escapeHtml(layer.name)}</span>
          </div>
        </div>`;
    }

    const attrNote = legend.attribute
      ? `<div class="legend-attribute-note">color by ${this._escapeHtml(legend.attribute)}</div>`
      : '';

    if (legend.type === 'discrete' && legend.entries) {
      const entries = legend.entries
        .map(
          (e) => `
        <div class="legend-entry">
          <span class="legend-dot" style="background-color:${e.color}"></span>
          <span class="legend-label">${this._escapeHtml(e.label)}</span>
        </div>`
        )
        .join('');
      return `<div class="legend-container">${attrNote}<div class="legend-entries">${entries}</div></div>`;
    }

    if ((legend.type === 'continuous' || legend.type === 'bins') && legend.functionConfig) {
      const gradient = this._getGradientStyle(legend.functionConfig);
      const min = this._getMinDomainValue(legend.functionConfig.domain);
      const max = this._getMaxDomainValue(legend.functionConfig.domain);
      return `
        <div class="legend-container">
          ${attrNote}
          <div class="legend-gradient-container">
            <div class="legend-gradient" style="background:${gradient}"></div>
            <div class="legend-domain-labels">
              <span class="domain-label-min">${this._escapeHtml(min)}</span>
              <span class="domain-label-max">${this._escapeHtml(max)}</span>
            </div>
          </div>
        </div>`;
    }

    if (legend.type === 'categories' && legend.functionConfig) {
      const entries = (legend.functionConfig.domain || [])
        .map((cat, i) => {
          const color = legend.functionConfig.colors?.[i];
          if (!color) return '';
          return `
          <div class="legend-entry">
            <span class="legend-dot" style="background-color:${color}"></span>
            <span class="legend-label">${this._escapeHtml(String(cat))}</span>
          </div>`;
        })
        .join('');
      return `<div class="legend-container">${attrNote}<div class="legend-entries">${entries}</div></div>`;
    }

    if (legend.type === 'single' && legend.singleColor) {
      return `
        <div class="legend-container">
          <div class="legend-entry">
            <span class="legend-dot" style="background-color:${legend.singleColor}"></span>
            <span class="legend-label">${this._escapeHtml(layer.name)}</span>
          </div>
        </div>`;
    }

    // Fallback
    return `
      <div class="legend-container">
        <div class="legend-entry">
          <span class="legend-dot" style="background-color:${layer.color || '#888'}"></span>
          <span class="legend-label">${this._escapeHtml(layer.name)}</span>
        </div>
      </div>`;
  }

  _render() {
    this._container.innerHTML = '';

    // Collapsed state: icon button
    if (this._isPanelCollapsed) {
      const btn = document.createElement('button');
      btn.className = 'layer-toggle-icon-btn';
      btn.disabled = this._disabled;
      btn.title = 'Show layers';
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
      </svg>`;
      btn.addEventListener('click', () => this._togglePanel());
      this._container.appendChild(btn);
      return;
    }

    // Expanded panel
    const panel = document.createElement('div');
    panel.className = 'layer-toggle';

    // Header
    const header = document.createElement('div');
    header.className = 'layer-toggle-header';
    header.innerHTML = `
      <div class="header-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        <span>Layers</span>
      </div>
      <button class="close-btn" title="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>`;
    header.querySelector('.close-btn').addEventListener('click', () => this._togglePanel());
    panel.appendChild(header);

    // Layer list
    const list = document.createElement('div');
    list.className = 'layer-list';

    this._layers.forEach((layer) => {
      const item = document.createElement('div');
      item.className = `layer-item${this._disabled ? ' disabled' : ''}`;

      const isExpanded = this._expandedLayers.has(layer.id);

      // Eye icons
      const eyeOpen = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>`;
      const eyeClosed = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>`;

      const row = document.createElement('div');
      row.className = 'layer-row';
      row.innerHTML = `
        <button class="expand-btn${isExpanded ? ' expanded' : ''}" ${this._disabled ? 'disabled' : ''} title="Toggle details">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <span class="layer-name">${this._escapeHtml(layer.name)}</span>
        <button class="fly-to-btn" ${this._disabled ? 'disabled' : ''} title="Fly to layer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13"></path>
            <path d="M22 2L15 22L11 13L2 9L22 2Z"></path>
          </svg>
        </button>
        <button class="visibility-btn${!layer.visible ? ' hidden' : ''}" ${this._disabled ? 'disabled' : ''} title="${layer.visible ? 'Hide layer' : 'Show layer'}">
          ${layer.visible ? eyeOpen : eyeClosed}
        </button>`;

      row.querySelector('.expand-btn').addEventListener('click', () =>
        this._toggleLayerExpansion(layer.id)
      );
      row.querySelector('.fly-to-btn').addEventListener('click', () => {
        if (!this._disabled) this._onFlyTo({ layerId: layer.id });
      });
      row.querySelector('.visibility-btn').addEventListener('click', () => {
        if (!this._disabled) this._onToggle({ layerId: layer.id, visible: !layer.visible });
      });

      item.appendChild(row);

      // Expanded details (legend)
      if (isExpanded) {
        const details = document.createElement('div');
        details.className = 'layer-details';
        details.innerHTML = this._renderLegend(layer);
        item.appendChild(details);
      }

      list.appendChild(item);
    });

    panel.appendChild(list);
    this._container.appendChild(panel);
  }
}
