import { useContext } from 'react';
import { WebSocketContext, type WebSocketContextValue } from '../contexts/WebSocketContext';

export function useWebSocket(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
