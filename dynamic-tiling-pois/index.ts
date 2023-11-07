import './style.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Deck} from '@deck.gl/core';
import {BASEMAP, vectorTableSource, VectorTileLayer, colorCategories} from '@deck.gl/carto';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const accessToken = import.meta.env.VITE_API_ACCESS_TOKEN;
const connectionName = 'carto_dw';
const cartoConfig = {apiBaseUrl, accessToken, connectionName};

const INITIAL_VIEW_STATE = {
  latitude: 41.8097343,
  longitude: -110.5556199,
  zoom: 3,
  bearing: 0,
  pitch: 0,
};


const deck = new Deck({
  canvas: 'deck-canvas',
  initialViewState: INITIAL_VIEW_STATE,
  controller: true
});

// Add basemap
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP.DARK_MATTER,
  interactive: false
});

deck.setProps({
  onViewStateChange: ({viewState}) => {
    const {longitude, latitude, ...rest} = viewState;
    map.jumpTo({center: [longitude, latitude], ...rest});
  }
});

let selectedOsmCategory = 'Financial';
const osmCategorySelector = document.querySelector<HTMLSelectElement>('#osmCategorySelector');
osmCategorySelector?.addEventListener('change', () => {
  selectedOsmCategory = osmCategorySelector.value;
  render();
});

function render() {
  const dataSource = vectorTableSource({
    ...cartoConfig,
    tableName: 'carto-demo-data.demo_tables.osm_pois_usa'
  });

  const layers = [
    new VectorTileLayer({
      id: 'places',
      pickable: true,
      data: dataSource,
      opacity: 1,
      getFillColor: colorCategories({
        attr: 'group_name',
        domain: [selectedOsmCategory],
        colors: [[3, 111, 226]],
        othersColor: [3, 111, 226, 100]
      }),
      getLineColor: colorCategories({
        attr: 'group_name',
        domain: [selectedOsmCategory],
        colors: [[255, 255, 255]],
        othersColor: [3, 111, 226, 0]
      }),
      getPointRadius: 50,
      getLineWidth: 10,
      pointRadiusMinPixels: 1,
      lineWidthMinPixels: 0.3,
      updateTriggers: {
        getFillColor: selectedOsmCategory,
        getLineColor: selectedOsmCategory
      }
    })
  ];

  deck.setProps({
    layers: layers
  });
}

render();