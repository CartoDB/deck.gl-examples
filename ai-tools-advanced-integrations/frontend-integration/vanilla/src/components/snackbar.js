/**
 * Snackbar Component
 *
 * Toast notification at bottom center with auto-dismiss.
 */

export class Snackbar {
  constructor(container) {
    this._container = container;
    this._timeout = null;
    this._duration = 5000;
  }

  show(message, type = 'error') {
    this.hide();

    const el = document.createElement('div');
    el.className = `snackbar snackbar-${type}`;
    el.innerHTML = `
      <div class="snackbar-content">
        <span class="snackbar-icon">${type === 'error' ? '\u26A0' : '\u2139'}</span>
        <span class="snackbar-message">${this._escapeHtml(message)}</span>
        <button class="snackbar-close" aria-label="Close">\u2715</button>
      </div>
    `;

    el.querySelector('.snackbar-close').addEventListener('click', () => this.hide());

    this._container.innerHTML = '';
    this._container.appendChild(el);
    this._el = el;

    this._timeout = setTimeout(() => this.hide(), this._duration);
  }

  hide() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
    this._container.innerHTML = '';
    this._el = null;
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
