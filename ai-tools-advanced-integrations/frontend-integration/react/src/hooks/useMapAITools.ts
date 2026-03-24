import { useContext } from 'react';
import { MapAIToolsContext, type MapAIToolsContextValue } from '../contexts/MapAIToolsContext';

export function useMapAITools(): MapAIToolsContextValue {
  const context = useContext(MapAIToolsContext);
  if (!context) {
    throw new Error('useMapAITools must be used within a MapAIToolsProvider');
  }
  return context;
}
