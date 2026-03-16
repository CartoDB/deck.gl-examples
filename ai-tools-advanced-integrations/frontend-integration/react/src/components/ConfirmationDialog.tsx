import { useEffect, useCallback } from 'react';
import './ConfirmationDialog.css';

interface ConfirmationDialogProps {
  visible: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  showCheckbox?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  visible,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  showCheckbox = false,
  checkboxLabel = '',
  checkboxChecked = false,
  onCheckboxChange,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!visible) return;

      if (event.key === 'Escape') {
        onCancel();
      } else if (event.key === 'Enter') {
        const target = event.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          onConfirm();
        }
      }
    },
    [visible, onConfirm, onCancel]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
      onCancel();
    }
  };

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick}>
      <div
        className="dialog-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
      >
        <div className="dialog-header">
          <h3 id="dialog-title" className="dialog-title">
            {title}
          </h3>
        </div>

        <div className="dialog-body">
          <p id="dialog-message" className="dialog-message">
            {message}
          </p>
        </div>

        {showCheckbox && (
          <div className="dialog-checkbox">
            <label>
              <input
                type="checkbox"
                checked={checkboxChecked}
                onChange={(e) => onCheckboxChange?.(e.target.checked)}
              />
              {checkboxLabel}
            </label>
          </div>
        )}

        <div className="dialog-actions">
          <button
            type="button"
            className="dialog-button dialog-button-cancel"
            onClick={onCancel}
            aria-label={cancelText}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="dialog-button dialog-button-confirm"
            onClick={onConfirm}
            aria-label={confirmText}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
