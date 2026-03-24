/**
 * Draw Tool Component
 *
 * UI for activating mask drawing mode, switching between draw/edit modes,
 * and clearing the mask.
 */

export class DrawTool {
  constructor(container, maskLayerManager) {
    this._container = container;
    this._maskLayer = maskLayerManager;
    this._render();

    // Re-render on mask state changes
    this._maskLayer.on('change', () => this._render());
  }

  _render() {
    const state = this._maskLayer.getState();
    const hasMask = this._maskLayer.isMaskActive();

    let html = '<div class="draw-tool-container">';

    // Main draw toggle button
    html += `
      <button class="draw-tool-btn ${state.isDrawing ? 'active' : ''}" title="Draw mask polygon" data-action="toggle-draw">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
        </svg>
      </button>
    `;

    // Mode buttons (visible when drawing)
    if (state.isDrawing) {
      html += '<div class="draw-tool-modes">';
      html += `
        <button class="mode-btn ${state.currentMode === 'draw' ? 'active' : ''}" title="Draw polygon" data-action="mode-draw">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          </svg>
        </button>
        <button class="mode-btn ${state.currentMode === 'edit' ? 'active' : ''}" title="Edit polygon" data-action="mode-edit" ${!hasMask ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
      `;
      html += '</div>';
    }

    // Clear button (visible when mask is active)
    if (hasMask) {
      html += `
        <button class="draw-tool-btn clear-btn" title="Clear mask" data-action="clear">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      `;
    }

    html += '</div>';
    this._container.innerHTML = html;

    // Bind events
    this._container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.getAttribute('data-action');
        switch (action) {
          case 'toggle-draw':
            if (this._maskLayer.getState().isDrawing) {
              this._maskLayer.disableDrawMode();
            } else {
              this._maskLayer.enableDrawMode();
            }
            break;
          case 'mode-draw':
            this._maskLayer.setDrawMode('draw');
            break;
          case 'mode-edit':
            this._maskLayer.setDrawMode('edit');
            break;
          case 'clear':
            this._maskLayer.clearMask();
            break;
        }
      });
    });
  }
}
