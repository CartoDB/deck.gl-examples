import { useState, useEffect } from 'react';
import type { LayerConfig } from '../types/models';
import type { LegendData, ColorFunctionLegend } from '../utils/legend';
import './LayerToggle.css';

interface LayerToggleProps {
  disabled?: boolean;
  layers: LayerConfig[];
  onToggle: (event: { layerId: string; visible: boolean }) => void;
  onFlyTo: (event: { layerId: string }) => void;
}

// Legend helper functions
function getGradientStyle(legend: ColorFunctionLegend): string {
  if (!legend.colors || legend.colors.length === 0) return '';
  const gradientStops = legend.colors
    .map((color, index) => {
      const percent = (index / (legend.colors!.length - 1)) * 100;
      return `${color} ${percent}%`;
    })
    .join(', ');
  return `linear-gradient(to right, ${gradientStops})`;
}

function getMinDomainValue(domain: number[] | string[]): string {
  if (!domain || domain.length === 0) return '';
  if (typeof domain[0] === 'number') {
    return `< ${domain[0]}`;
  }
  return String(domain[0]);
}

function getMaxDomainValue(domain: number[] | string[]): string {
  if (!domain || domain.length === 0) return '';
  if (typeof domain[0] === 'number') {
    const numDomain = domain as number[];
    return `\u2265 ${numDomain[numDomain.length - 1]}`;
  }
  return String(domain[domain.length - 1]);
}

export function LayerToggle({
  disabled = false,
  layers,
  onToggle,
  onFlyTo,
}: LayerToggleProps) {
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  // Auto-expand all layers when data loads
  useEffect(() => {
    if (layers.length > 0) {
      setExpandedLayers(new Set(layers.map((l) => l.id)));
    }
  }, [layers]);

  const togglePanel = () => setIsPanelCollapsed(!isPanelCollapsed);

  const toggleLayerExpansion = (layerId: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const renderLegend = (layer: LayerConfig) => {
    const legend: LegendData | undefined = layer.legend;
    if (!legend) {
      // Fallback: show default color
      return (
        <div className="legend-container">
          <div className="legend-entry">
            <span className="legend-dot" style={{ backgroundColor: layer.color }} />
            <span className="legend-label">{layer.name}</span>
          </div>
        </div>
      );
    }

    const attributeNote = legend.attribute ? `color by ${legend.attribute}` : null;

    // Discrete legend
    if (legend.type === 'discrete' && legend.entries) {
      return (
        <div className="legend-container">
          {attributeNote && <div className="legend-attribute-note">{attributeNote}</div>}
          <div className="legend-entries">
            {legend.entries.map((entry) => (
              <div key={entry.label} className="legend-entry">
                <span className="legend-dot" style={{ backgroundColor: entry.color }} />
                <span className="legend-label">{entry.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Continuous/Bins legend
    if ((legend.type === 'continuous' || legend.type === 'bins') && legend.functionConfig) {
      return (
        <div className="legend-container">
          {attributeNote && <div className="legend-attribute-note">{attributeNote}</div>}
          <div className="legend-gradient-container">
            <div
              className="legend-gradient"
              style={{ background: getGradientStyle(legend.functionConfig) }}
            />
            <div className="legend-domain-labels">
              <span className="domain-label-min">
                {getMinDomainValue(legend.functionConfig.domain)}
              </span>
              <span className="domain-label-max">
                {getMaxDomainValue(legend.functionConfig.domain)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Categories legend
    if (legend.type === 'categories' && legend.functionConfig) {
      const { domain, colors } = legend.functionConfig;
      return (
        <div className="legend-container">
          {attributeNote && <div className="legend-attribute-note">{attributeNote}</div>}
          <div className="legend-entries">
            {domain.map((category, i) =>
              colors && colors[i] ? (
                <div key={`${category}-${i}`} className="legend-entry">
                  <span className="legend-dot" style={{ backgroundColor: colors[i] }} />
                  <span className="legend-label">{String(category)}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      );
    }

    // Single color legend
    if (legend.type === 'single' && legend.singleColor) {
      return (
        <div className="legend-container">
          <div className="legend-entry">
            <span className="legend-dot" style={{ backgroundColor: legend.singleColor }} />
            <span className="legend-label">{layer.name}</span>
          </div>
        </div>
      );
    }

    // Fallback
    return (
      <div className="legend-container">
        <div className="legend-entry">
          <span className="legend-dot" style={{ backgroundColor: layer.color }} />
          <span className="legend-label">{layer.name}</span>
        </div>
      </div>
    );
  };

  // Collapsed state: icon button
  if (isPanelCollapsed) {
    return (
      <button
        className="layer-toggle-icon-btn"
        onClick={togglePanel}
        disabled={disabled}
        title="Show layers"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>
    );
  }

  // Expanded state: full panel
  return (
    <div className="layer-toggle">
      <div className="layer-toggle-header">
        <div className="header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span>Layers</span>
        </div>
        <button className="close-btn" onClick={togglePanel} title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="layer-list">
        {layers.map((layer) => (
          <div key={layer.id} className={`layer-item${disabled ? ' disabled' : ''}`}>
            <div className="layer-row">
              <button
                className={`expand-btn${expandedLayers.has(layer.id) ? ' expanded' : ''}`}
                onClick={() => toggleLayerExpansion(layer.id)}
                disabled={disabled}
                title="Toggle details"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <span className="layer-name">{layer.name}</span>
              <button
                className="fly-to-btn"
                onClick={() => onFlyTo({ layerId: layer.id })}
                disabled={disabled}
                title="Fly to layer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
              <button
                className={`visibility-btn${!layer.visible ? ' hidden' : ''}`}
                onClick={() => onToggle({ layerId: layer.id, visible: !layer.visible })}
                disabled={disabled}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>

            {expandedLayers.has(layer.id) && (
              <div className="layer-details">{renderLegend(layer)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
