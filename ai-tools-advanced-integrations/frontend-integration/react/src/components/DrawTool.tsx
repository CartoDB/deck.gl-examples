import './DrawTool.css';

interface DrawToolProps {
  hasMask: boolean;
  isDrawing: boolean;
  currentMode: string;
  onToggleDraw: () => void;
  onSetMode: (mode: string) => void;
  onClear: () => void;
}

export function DrawTool({
  hasMask,
  isDrawing,
  currentMode,
  onToggleDraw,
  onSetMode,
  onClear,
}: DrawToolProps) {
  return (
    <div className="draw-tool-container">
      <button
        className={`draw-tool-btn${isDrawing ? ' active' : ''}`}
        onClick={onToggleDraw}
        title="Draw mask polygon"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
        </svg>
      </button>

      {isDrawing && (
        <div className="draw-tool-modes">
          <button
            className={`mode-btn${currentMode === 'draw' ? ' active' : ''}`}
            onClick={() => onSetMode('draw')}
            title="Draw polygon"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            </svg>
          </button>
          <button
            className={`mode-btn${currentMode === 'edit' ? ' active' : ''}`}
            onClick={() => onSetMode('edit')}
            title="Edit polygon"
            disabled={!hasMask}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </div>
      )}

      {hasMask && (
        <button
          className="draw-tool-btn clear-btn"
          onClick={onClear}
          title="Clear mask"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
