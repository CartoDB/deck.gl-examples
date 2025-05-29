import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck, Layer} from '@deck.gl/core';
import {fetchMap, FetchMapResult, LayerDescriptor} from '@carto/api-client';
import {BASEMAP} from '@deck.gl/carto';
import {LayerFactory} from './utils';
import {createLegend} from './legend';
import './legend.css';
import {buildTooltip} from './tooltip';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

// Define configurations for multiple maps
const MAP_CONFIGS = [
  {id: '26bce5fe-29d4-48dc-914f-14355971f143', name: 'US Weather'},
  {id: '6ac6f3bb-9c90-4e7e-9ecd-3c7343704c24', name: 'US Wind Map'}
];

// Define the structure for aggregated map data
interface AggregatedMapData {
  title: string;
  layers: LayerDescriptor[];
  popupSettings: FetchMapResult['popupSettings'] | null;
  initialViewState?: Deck['props']['initialViewState'];
}

let currentMapData: AggregatedMapData | null = null; // Stores aggregated data from selected maps

// Base options for fetchMap, cartoMapId will be added per call
const baseFetchMapOptions = {
  apiBaseUrl
  // accessToken: import.meta.env.VITE_CARTO_ACCESS_TOKEN // if you want to use a private (non-public) map
};

// HTML Elements
const mapNameEl = document.querySelector<HTMLDListElement>('#mapName');
const layerCountEl = document.querySelector<HTMLDListElement>('#layerCount');
const mapSelectorContainer = document.getElementById('map-selector-container');
const loadMapsButton = document.getElementById('load-maps-button');

// Initial Deck.gl view state - this will be updated by fetchMap data
const INITIAL_VIEW_STATE = {
  latitude: 0,
  longitude: 0,
  zoom: 1,
  bearing: 0,
  pitch: 0
};

const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true,
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  },
  getTooltip: ({object, layer}) => {
    if (!layer) return null;
    return buildTooltip(object, layer, currentMapData);
  }
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.VOYAGER, // Using Voyager as a default
  interactive: false
});

async function initialize(selectedMapIds: string[]) {
  try {
    // Clear previous map state
    const existingLegend = document.querySelector('.legend-wrapper');
    if (existingLegend) {
      existingLegend.remove();
    }
    deck.setProps({layers: []});
    currentMapData = null;

    if (selectedMapIds.length === 0) {
      if (mapNameEl) mapNameEl.innerHTML = 'No Map Selected';
      if (layerCountEl) layerCountEl.innerHTML = '0';
      map.jumpTo({
        center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
        zoom: INITIAL_VIEW_STATE.zoom,
        bearing: INITIAL_VIEW_STATE.bearing,
        pitch: INITIAL_VIEW_STATE.pitch
      });
      deck.setProps({initialViewState: INITIAL_VIEW_STATE});
      return;
    }

    // Fetch map data for each selected map
    const allFetchedMapData: FetchMapResult[] = [];
    for (const mapId of selectedMapIds) {
      try {
        const fetchOptions = {...baseFetchMapOptions, cartoMapId: mapId};
        const mapData = await fetchMap(fetchOptions);
        allFetchedMapData.push(mapData);
      } catch (error) {
        // Optionally, show a partial error or skip this map
      }
    }

    // If no maps were fetched, show an error
    if (allFetchedMapData.length === 0) {
      if (mapNameEl) mapNameEl.innerHTML = 'Error loading maps';
      if (layerCountEl) layerCountEl.innerHTML = 'Error';
      return;
    }

    // Aggregate data from all fetched maps
    const aggregatedLayers: LayerDescriptor[] = [];
    const mergedPopupSettingsLayers: NonNullable<
      NonNullable<FetchMapResult['popupSettings']>['layers']
    > = {};
    let finalInitialViewState = {...INITIAL_VIEW_STATE};
    const mapTitles: string[] = [];

    allFetchedMapData.forEach((mapData, index) => {
      mapTitles.push(mapData.title || `Map ${index + 1}`);
      if (mapData.layers) {
        aggregatedLayers.push(...mapData.layers);
      }
      if (mapData.popupSettings && mapData.popupSettings.layers) {
        for (const layerId in mapData.popupSettings.layers) {
          // Simple merge: last one wins if layer IDs conflict across maps.
          mergedPopupSettingsLayers[layerId] = mapData.popupSettings.layers[layerId];
        }
      }

      // Use initial view state from the first successfully fetched map
      if (index === 0) {
        // Prioritize the first map's view state
        if (mapData.initialViewState) {
          finalInitialViewState = {...INITIAL_VIEW_STATE, ...mapData.initialViewState};
        } else if ((mapData as any).mapOptions && (mapData as any).mapOptions.viewState) {
          finalInitialViewState = {
            longitude: (mapData as any).mapOptions.viewState.longitude,
            latitude: (mapData as any).mapOptions.viewState.latitude,
            zoom: (mapData as any).mapOptions.viewState.zoom,
            pitch: (mapData as any).mapOptions.viewState.pitch || 0,
            bearing: (mapData as any).mapOptions.viewState.bearing || 0
          };
        }
      }
    });

    currentMapData = {
      title: mapTitles.length > 1 ? mapTitles.join(' & ') : mapTitles[0] || 'Untitled Map',
      layers: aggregatedLayers,
      popupSettings:
        Object.keys(mergedPopupSettingsLayers).length > 0
          ? {layers: mergedPopupSettingsLayers}
          : null,
      initialViewState: finalInitialViewState
    };

    // Update widgets
    if (mapNameEl) {
      mapNameEl.innerHTML = currentMapData.title;
    }
    if (layerCountEl) {
      layerCountEl.innerHTML = currentMapData.layers.length.toString();
    }

    // Create and append the new legend for combined layers
    if (currentMapData.layers && currentMapData.layers.length > 0) {
      const legendElement = createLegend(currentMapData.layers);
      document.body.appendChild(legendElement);

      // Add event listener to toggle layer visibility
      legendElement.addEventListener('togglelayervisibility', (event: Event) => {
        const customEvent = event as CustomEvent<{layerId: string; visible: boolean}>;
        const {layerId, visible} = customEvent.detail;
        const currentDeckLayers = (deck.props.layers || []) as Layer[];
        const newLayers = currentDeckLayers.map((layer: Layer) => {
          if (layer && layer.id === layerId) {
            return layer.clone({visible});
          }
          return layer;
        });
        deck.setProps({layers: newLayers});
      });
    }

    // Finally, update the deck.gl view state and layers
    deck.setProps({
      initialViewState: finalInitialViewState,
      layers: LayerFactory(currentMapData.layers)
    });

    map.jumpTo({
      center: [finalInitialViewState.longitude, finalInitialViewState.latitude],
      zoom: finalInitialViewState.zoom,
      bearing: finalInitialViewState.bearing,
      pitch: finalInitialViewState.pitch
    });
  } catch (error) {
    if (mapNameEl) mapNameEl.innerHTML = 'Error loading map(s)';
    if (layerCountEl) layerCountEl.innerHTML = 'Error';
    currentMapData = null; // Clear data on error
    deck.setProps({layers: []}); // Clear layers on error
  }
}

// Initialize map selector and load default map(s)
function setupMapSelector() {
  if (!mapSelectorContainer || !loadMapsButton) {
    // Fallback: Load the first map by default if UI elements are missing but configs exist
    if (MAP_CONFIGS.length > 0) {
      initialize([MAP_CONFIGS[0].id]);
    } else {
      initialize([]); // Show "No Map Selected" or similar
    }
    return;
  }

  MAP_CONFIGS.forEach((mapConfig, index) => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    // Ensure unique ID for each checkbox, useful for labels
    checkbox.id = `map-checkbox-${mapConfig.id}-${index}`;
    checkbox.value = mapConfig.id;
    checkbox.name = 'mapSelection';

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = mapConfig.name;

    const div = document.createElement('div');
    div.className = 'map-selector-option';
    div.appendChild(checkbox);
    div.appendChild(label);
    mapSelectorContainer.appendChild(div);
  });

  mapSelectorContainer.appendChild(loadMapsButton);

  loadMapsButton.addEventListener('click', () => {
    const selectedCheckboxes = document.querySelectorAll<HTMLInputElement>(
      'input[name="mapSelection"]:checked'
    );
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    initialize(selectedIds);
  });

  // Load the first map by default on initial page load
  const firstCheckbox =
    mapSelectorContainer.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (firstCheckbox) {
    firstCheckbox.checked = true;
    initialize([firstCheckbox.value]);
  } else if (MAP_CONFIGS.length > 0) {
    // Fallback if somehow checkboxes weren't created but configs exist
    initialize([MAP_CONFIGS[0].id]);
  } else {
    initialize([]); // No maps to load if no configs
  }
}

// Initialize map selector and load default map(s)
setupMapSelector();
