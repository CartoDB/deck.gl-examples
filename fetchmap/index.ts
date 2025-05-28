import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck, Layer} from '@deck.gl/core';
import {fetchMap, FetchMapResult, LayerDescriptor} from '@carto/api-client';
import {BASEMAP} from '@deck.gl/carto';
// import {debounce} from './utils'; // Commenting out for now, to keep it simple
import {LayerFactory} from './utils';
// LayerDescriptor is now imported from @carto/api-client directly
import {createLegend} from './legend';
import './legend.css';

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
// Ensure these elements exist in your HTML for the map selector
const mapSelectorContainer = document.getElementById('map-selector-container');
const loadMapsButton = document.getElementById('load-maps-button');

// Initial Deck.gl view state - this might be updated by fetchMap data
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
    // Synchronize MapLibreGL view with DeckGL
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  },
  getTooltip: ({object, layer}) => {
    if (
      !object ||
      !layer ||
      !currentMapData || // Check against the aggregated currentMapData
      !currentMapData.popupSettings ||
      !currentMapData.popupSettings.layers
    ) {
      return null;
    }

    const layerId = layer.id;
    const popupLayersSettings = currentMapData.popupSettings.layers;

    // Check if settings exist for this layer and if the layer's popups are enabled overall
    if (!popupLayersSettings[layerId] || !popupLayersSettings[layerId].enabled) {
      return null;
    }

    const layerSettings = popupLayersSettings[layerId];
    let eventConfig = null; // This will hold either hover or click config

    // Prioritize hover for getTooltip, then click
    if (
      layerSettings.hover &&
      layerSettings.hover.fields &&
      layerSettings.hover.fields.length > 0
    ) {
      eventConfig = layerSettings.hover;
    } else if (
      layerSettings.click &&
      layerSettings.click.fields &&
      layerSettings.click.fields.length > 0
    ) {
      eventConfig = layerSettings.click;
    }

    if (!eventConfig) {
      return null;
    }

    const fieldsToDisplay = eventConfig.fields;
    let htmlContent = '';

    // Use layer's friendly name if available
    const layerDisplayName = (layer.props as any)?.cartoLabel || layer.props.id || layerId;
    htmlContent += `<div style="margin-bottom: 5px; font-weight: bold; border-bottom: 1px solid #555; padding-bottom: 3px;">${layerDisplayName}</div>`;

    htmlContent += '<table style="border-collapse: collapse;">';
    for (const field of fieldsToDisplay) {
      const originalFieldName = field.name;
      let actualFieldName = originalFieldName;

      // Construct the actual field name if spatialIndexAggregation is present
      if (
        field.spatialIndexAggregation &&
        typeof field.spatialIndexAggregation === 'string' &&
        field.spatialIndexAggregation.length > 0
      ) {
        actualFieldName = `${originalFieldName}_${field.spatialIndexAggregation}`;
      }

      const displayName = field.customName || originalFieldName;
      let valueToDisplay: string | number = 'N/A';

      if (object.properties && object.properties.hasOwnProperty(actualFieldName)) {
        const rawValue = object.properties[actualFieldName];

        if (rawValue !== null && rawValue !== undefined) {
          if (typeof rawValue === 'number' && field.format) {
            try {
              const formatSpec = field.format;
              let formattedNumber: string | number = rawValue;
              if (formatSpec.endsWith('s')) {
                const precision = formatSpec.includes('.')
                  ? parseInt(formatSpec.match(/\.(\d)/)?.[1] || '2')
                  : 0;
                if (Math.abs(rawValue) >= 1e9)
                  formattedNumber = (rawValue / 1e9).toFixed(precision) + 'B';
                else if (Math.abs(rawValue) >= 1e6)
                  formattedNumber = (rawValue / 1e6).toFixed(precision) + 'M';
                else if (Math.abs(rawValue) >= 1e3)
                  formattedNumber = (rawValue / 1e3).toFixed(precision) + 'k';
                else formattedNumber = rawValue.toFixed(precision);
              } else if (
                formatSpec.includes('.') &&
                (formatSpec.endsWith('f') ||
                  /^\.\d$/.test(formatSpec) ||
                  /^\.\d~$/.test(formatSpec))
              ) {
                const precision = parseInt(formatSpec.match(/\.(\d)/)?.[1] || '2');
                formattedNumber = rawValue.toFixed(precision);
              }
              valueToDisplay = formattedNumber;
            } catch (e) {
              // console.warn('Error formatting numeric value:', rawValue, 'with format:', field.format, e);
              valueToDisplay = String(rawValue);
            }
          } else {
            valueToDisplay = String(rawValue);
          }
        }
        // If rawValue is null or undefined, valueToDisplay remains 'N/A' as initialized
      }
      // If fieldName is not in object.properties, valueToDisplay remains 'N/A' as initialized

      htmlContent += `<tr><td style="padding-right: 10px; opacity: 0.8;"><em>${displayName}</em>:</td><td>${valueToDisplay}</td></tr>`;
    }
    htmlContent += '</table>';

    return {
      html: `<div style="font-family: Arial, sans-serif; font-size: 12px;">${htmlContent}</div>`,
      style: {
        backgroundColor: 'rgba(20, 20, 20, 0.9)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        maxWidth: '300px'
      }
    };
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
      console.log('No maps selected. Clearing map.');
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

    console.log(`Fetching maps with IDs: ${selectedMapIds.join(', ')}`);

    const allFetchedMapData: FetchMapResult[] = [];
    for (const mapId of selectedMapIds) {
      const mapConfig = MAP_CONFIGS.find(mc => mc.id === mapId);
      console.log(`Fetching map: ${mapConfig ? mapConfig.name : mapId}`);
      try {
        const fetchOptions = {...baseFetchMapOptions, cartoMapId: mapId};
        const mapData = await fetchMap(fetchOptions);
        allFetchedMapData.push(mapData);
      } catch (error) {
        console.error(`Failed to fetch map data for ID ${mapId}:`, error);
        // Optionally, show a partial error or skip this map
      }
    }

    console.log('allFetchedMapData:', allFetchedMapData);

    if (allFetchedMapData.length === 0) {
      console.error('No map data could be fetched for selected IDs.');
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

    console.log('Aggregated map data:', currentMapData);

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
      document.body.appendChild(legendElement); // Consider appending to a specific legend container

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

      // Add event listener for layer reordering from the legend
      legendElement.addEventListener('reorderlayers', (event: Event) => {
        const customEvent = event as CustomEvent<{layerIds: string[]}>;
        const visuallyOrderedIds = customEvent.detail.layerIds; // Topmost in legend is first

        // console.log('[Index] Received reorderlayers. Visual order (top to bottom):', visuallyOrderedIds);

        if (!currentMapData || !currentMapData.layers) {
          console.error('[Index] Cannot reorder layers: currentMapData or its layers are missing.');
          return;
        }

        // Deck.gl renders layers such that later layers in the array are on top.
        // So, the visually topmost layer in the legend should be the last in Deck.gl's layer array.
        const deckOrderIds = [...visuallyOrderedIds].reverse(); // Now bottommost for Deck is first
        // console.log('[Index] Deck.gl order (bottom to top):', deckOrderIds);

        const originalLayerDescriptors = [...currentMapData.layers]; // Preserve original for lookup
        const reorderedLayerDescriptors: LayerDescriptor[] = [];

        deckOrderIds.forEach(idFromLegendEvent => {
          // Find the original LayerDescriptor by its ID
          // The ID in legend.ts is: ((layer.props as any)?.id || `layer-${index}`)
          // We try to match primarily against (l.props as any)?.id
          const foundLayer = originalLayerDescriptors.find(l => {
            const propsId = (l.props as any)?.id;
            if (propsId) {
              return propsId === idFromLegendEvent;
            }
            // If props.id was not available, the legend would have used `layer-${originalIndex}`.
            // Matching this back is complex if the originalLayerDescriptors array has been sorted before,
            // as the original index is lost. For this reordering to work robustly when props.id is missing,
            // a stable unique ID would need to be ensured on each LayerDescriptor beforehand.
            // For now, we prioritize matching on props.id. If it's missing, this layer might not be found
            // unless the idFromLegendEvent (e.g. "layer-0") coincidentally matches another layer's props.id.
            // This is a known limitation if props.id is not universally present and used by the legend.
            return false; // Cannot reliably match `layer-${index}` style IDs here without original indices.
          });

          if (foundLayer) {
            reorderedLayerDescriptors.push(foundLayer);
          } else {
            // If not found by props.id, attempt to find by the `layer-${index}` pattern IF the idFromLegendEvent looks like one.
            // This is a less robust fallback.
            if (idFromLegendEvent.startsWith('layer-')) {
              const originalIndex = parseInt(idFromLegendEvent.split('-')[1], 10);
              if (!isNaN(originalIndex) && originalIndex < originalLayerDescriptors.length) {
                // Check if the layer at this original index in the *current* (potentially sorted)
                // originalLayerDescriptors actually LACKS a props.id. If it had one, it should have matched above.
                const potentialMatch = originalLayerDescriptors[originalIndex];
                if (potentialMatch && !(potentialMatch.props as any)?.id) {
                  // This is a heuristic: assumes originalLayerDescriptors hasn't been re-sorted in a way that invalidates this index.
                  // And that this layer indeed was one that got a generated ID.
                  console.warn(
                    `[Index] Attempting fallback match for ID '${idFromLegendEvent}' using original index ${originalIndex}. This is less reliable.`
                  );
                  reorderedLayerDescriptors.push(potentialMatch);
                  return; // continue to next idFromLegendEvent
                }
              }
            }
            console.warn(
              `[Index] Layer with ID '${idFromLegendEvent}' not reliably found in currentMapData.layers during reorder.`
            );
          }
        });

        if (reorderedLayerDescriptors.length !== originalLayerDescriptors.length) {
          console.error(
            '[Index] Mismatch in layer count after reordering. Aborting Deck.gl update to prevent errors.'
          );
          // Restore currentMapData.layers to its state before attempting reorder to avoid partial updates.
          // currentMapData.layers = originalLayerDescriptors; // Or re-fetch / be careful here.
          return;
        }

        currentMapData.layers = reorderedLayerDescriptors; // Update the source of truth for descriptors
        const newDeckLayers = LayerFactory(currentMapData.layers);
        deck.setProps({layers: newDeckLayers});
        // console.log('[Index] Deck layers updated with new Z-order.');
      });
    }

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
    console.error('Failed to initialize maps:', error);
    if (mapNameEl) mapNameEl.innerHTML = 'Error loading map(s)';
    if (layerCountEl) layerCountEl.innerHTML = 'Error';
    currentMapData = null; // Clear data on error
    deck.setProps({layers: []}); // Clear layers on error
  }
}

function setupMapSelector() {
  if (!mapSelectorContainer || !loadMapsButton) {
    console.warn(
      'Map selector HTML elements (#map-selector-container, #load-maps-button) not found. UI for map selection will not be available.'
    );
    // Fallback: Load the first map by default if UI elements are missing but configs exist
    if (MAP_CONFIGS.length > 0) {
      console.log('Loading the first configured map by default.');
      initialize([MAP_CONFIGS[0].id]);
    } else {
      console.error('No maps configured and no selector UI found. Cannot load any map.');
      initialize([]); // Show "No Map Selected" or similar
    }
    return;
  }

  // Clear any existing checkboxes (e.g., if this function is called multiple times)
  mapSelectorContainer.innerHTML = '<h3 style="margin-top:0;">Select available maps</h3>';

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
    label.style.marginLeft = '5px'; // This will be overridden by CSS if more specific styles are added

    const div = document.createElement('div');
    div.className = 'map-selector-option'; // Added class for styling
    div.appendChild(checkbox);
    div.appendChild(label);
    mapSelectorContainer.appendChild(div);
  });

  // Append the button back if it was cleared by innerHTML
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
