/**
 * Confirmation Dialog Component
 *
 * Modal with backdrop, optional checkbox, keyboard support.
 */

export class ConfirmationDialog {
  constructor(container) {
    this._container = container;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  show({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', checkboxLabel, onConfirm, onCancel }) {
    this._container.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    let checkboxHtml = '';
    if (checkboxLabel) {
      checkboxHtml = `
        <div class="dialog-checkbox">
          <label>
            <input type="checkbox" id="dialog-check" />
            ${this._escapeHtml(checkboxLabel)}
          </label>
        </div>
      `;
    }

    backdrop.innerHTML = `
      <div class="dialog-container">
        <div class="dialog-header">
          <h2 class="dialog-title">${this._escapeHtml(title)}</h2>
        </div>
        <div class="dialog-body">
          <p class="dialog-message">${this._escapeHtml(message)}</p>
        </div>
        ${checkboxHtml}
        <div class="dialog-actions">
          <button class="dialog-button dialog-button-cancel">${this._escapeHtml(cancelLabel)}</button>
          <button class="dialog-button dialog-button-confirm">${this._escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    backdrop.querySelector('.dialog-button-cancel').addEventListener('click', () => {
      this.hide();
      onCancel?.();
    });

    backdrop.querySelector('.dialog-button-confirm').addEventListener('click', () => {
      const checked = checkboxLabel ? backdrop.querySelector('#dialog-check')?.checked : false;
      this.hide();
      onConfirm?.(checked);
    });

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.hide();
        onCancel?.();
      }
    });

    this._onConfirm = onConfirm;
    this._onCancel = onCancel;
    this._hasCheckbox = !!checkboxLabel;
    this._backdrop = backdrop;

    this._container.appendChild(backdrop);

    // Keyboard support
    document.addEventListener('keydown', this._onKeyDown);

    // Focus confirm button
    backdrop.querySelector('.dialog-button-confirm').focus();
  }

  hide() {
    document.removeEventListener('keydown', this._onKeyDown);
    this._container.innerHTML = '';
    this._backdrop = null;
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      this.hide();
      this._onCancel?.();
    } else if (e.key === 'Enter' && e.target.tagName !== 'INPUT') {
      const checked = this._hasCheckbox
        ? this._backdrop?.querySelector('#dialog-check')?.checked
        : false;
      this.hide();
      this._onConfirm?.(checked);
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
