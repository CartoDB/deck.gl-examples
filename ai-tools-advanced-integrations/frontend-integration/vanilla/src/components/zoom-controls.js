/**
 * Zoom Controls Component
 *
 * +/- buttons with current zoom level display.
 */

export class ZoomControls {
  constructor(container, { onZoomIn, onZoomOut }) {
    this._container = container;
    this._onZoomIn = onZoomIn;
    this._onZoomOut = onZoomOut;
    this._zoomLevel = 3;
    this._disabled = true;
    this._render();
  }

  setZoomLevel(level) {
    this._zoomLevel = level;
    const el = this._container.querySelector('.zoom-level');
    if (el) {
      el.textContent = level.toFixed(1);
    }
  }

  setDisabled(disabled) {
    this._disabled = disabled;
    const buttons = this._container.querySelectorAll('.zoom-btn');
    buttons.forEach((btn) => (btn.disabled = disabled));
  }

  _render() {
    this._container.innerHTML = `
      <div class="zoom-controls">
        <button class="zoom-btn zoom-in" aria-label="Zoom in" ${this._disabled ? 'disabled' : ''}>+</button>
        <div class="zoom-level">${this._zoomLevel.toFixed(1)}</div>
        <button class="zoom-btn zoom-out" aria-label="Zoom out" ${this._disabled ? 'disabled' : ''}>&#x2212;</button>
      </div>
    `;

    this._container.querySelector('.zoom-in').addEventListener('click', () => {
      if (!this._disabled) this._onZoomIn();
    });

    this._container.querySelector('.zoom-out').addEventListener('click', () => {
      if (!this._disabled) this._onZoomOut();
    });
  }
}
