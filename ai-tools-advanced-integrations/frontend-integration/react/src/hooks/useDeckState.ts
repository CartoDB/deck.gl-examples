import { useContext } from 'react';
import { DeckStateContext, type DeckStateContextValue } from '../contexts/DeckStateContext';

export function useDeckState(): DeckStateContextValue {
  const context = useContext(DeckStateContext);
  if (!context) {
    throw new Error('useDeckState must be used within a DeckStateProvider');
  }
  return context;
}
