import { useCallback, useEffect, useRef } from 'react';
import { DeckGL } from '@deck.gl/react';
import { Map } from 'react-map-gl/maplibre';
import { BASEMAP } from '@deck.gl/carto';
import { useDeckProps } from '../hooks/useDeckProps';
import { useDeckState } from '../hooks/useDeckState';
import { getTooltipContent } from '../utils/tooltip';
import type { PickingInfo } from '@deck.gl/core';
import type { Basemap } from '../contexts/DeckStateContext';
import './MapView.css';

const BASEMAP_URLS: Record<Basemap, string> = {
  'dark-matter': BASEMAP.DARK_MATTER,
  'positron': BASEMAP.POSITRON,
  'voyager': BASEMAP.VOYAGER,
};

interface MaskLayerProps {
  isMaskActive: boolean;
  isDrawing: boolean;
  getMaskLayers: () => any[];
  injectMaskExtension: (layers: any[]) => any[];
}

interface MapViewProps {
  onViewStateChange?: (viewState: { zoom: number }) => void;
  maskLayer?: MaskLayerProps;
}

export function MapView({ onViewStateChange, maskLayer }: MapViewProps) {
  const deckState = useDeckState();
  const deckProps = useDeckProps(maskLayer);
  const redrawTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const { basemap } = deckState.state;

  // Only update the ref (no context dispatch) on user drag — matches Angular/Vanilla behavior
  const handleViewStateChange = useCallback(
    ({ viewState: newViewState }: { viewState: Record<string, unknown> }) => {
      deckState.updateCurrentViewState(newViewState as { longitude: number; latitude: number; zoom: number; pitch?: number; bearing?: number });
      onViewStateChange?.({ zoom: newViewState.zoom as number });
    },
    [deckState, onViewStateChange]
  );

  const getTooltip = useCallback((info: PickingInfo) => {
    return getTooltipContent(info);
  }, []);

  // Schedule redraws after spec updates
  const deckLayers = deckProps.layers as unknown[] | undefined;
  useEffect(() => {
    redrawTimersRef.current.forEach(clearTimeout);
    redrawTimersRef.current = [];

    if (deckLayers && deckLayers.length > 0) {
      const timers = [
        setTimeout(() => {
          requestAnimationFrame(() => { /* Force redraw */ });
        }, 50),
        setTimeout(() => {
          requestAnimationFrame(() => { /* Force redraw after transition */ });
        }, 1100),
      ];
      redrawTimersRef.current = timers;
    }

    return () => {
      redrawTimersRef.current.forEach(clearTimeout);
    };
  }, [deckLayers]);

  return (
    <div className="map-view-container">
      <DeckGL
        {...deckProps}
        onViewStateChange={handleViewStateChange}
        controller={{ dragPan: !(maskLayer?.isDrawing ?? false), doubleClickZoom: !(maskLayer?.isDrawing ?? false) }}
        getTooltip={getTooltip}
      >
        <Map mapStyle={BASEMAP_URLS[basemap]} />
      </DeckGL>
    </div>
  );
}
