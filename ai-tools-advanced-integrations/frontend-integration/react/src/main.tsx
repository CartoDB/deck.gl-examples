import { createRoot } from 'react-dom/client';
import { DeckStateProvider } from './contexts/DeckStateContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { MapAIToolsProvider } from './contexts/MapAIToolsContext';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';

createRoot(document.getElementById('root')!).render(
  <DeckStateProvider>
    <WebSocketProvider>
      <MapAIToolsProvider>
        <App />
      </MapAIToolsProvider>
    </WebSocketProvider>
  </DeckStateProvider>
);
