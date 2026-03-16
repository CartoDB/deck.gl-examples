import './ZoomControls.css';

interface ZoomControlsProps {
  disabled?: boolean;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({
  disabled = false,
  zoomLevel,
  onZoomIn,
  onZoomOut,
}: ZoomControlsProps) {
  return (
    <div className="zoom-controls">
      <button
        onClick={onZoomIn}
        disabled={disabled}
        className="zoom-btn"
        title="Zoom In"
      >
        +
      </button>
      <div className="zoom-level">{zoomLevel.toFixed(1)}</div>
      <button
        onClick={onZoomOut}
        disabled={disabled}
        className="zoom-btn"
        title="Zoom Out"
      >
        −
      </button>
    </div>
  );
}
