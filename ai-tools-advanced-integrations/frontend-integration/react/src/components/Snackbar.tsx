import { useEffect, useRef } from 'react';
import type { SnackbarConfig } from '../types/models';
import './Snackbar.css';

interface SnackbarProps {
  config: SnackbarConfig;
  onDismiss: () => void;
}

export function Snackbar({ config, onDismiss }: SnackbarProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config.message) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onDismiss();
      }, 5000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [config.message, onDismiss]);

  if (!config.message) return null;

  const icon = config.type === 'error' ? '\u26A0' : '\u2139';

  return (
    <div className={`snackbar snackbar-${config.type}`}>
      <div className="snackbar-content">
        <span className="snackbar-icon">{icon}</span>
        <span className="snackbar-message">{config.message}</span>
        <button className="snackbar-close" onClick={onDismiss} title="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
