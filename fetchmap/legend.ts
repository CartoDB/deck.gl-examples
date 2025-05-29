import {LayerDescriptor, Scale, ScaleKey} from '@carto/api-client';
import './legend.css';

// Helper function to format numbers nicely (e.g., for legend ranges)
function formatLegendNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
    compactDisplay: 'short'
  }).format(num);
}

// Create a legend for the given layers
export function createLegend(layers: LayerDescriptor[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'legend-wrapper';

  const container = document.createElement('div');
  container.className = 'legend-container';

  layers.forEach((layer, index) => {
    const layerId = ((layer.props as any)?.id || `layer-${index}`) as string;
    const layerLabel = ((layer.props as any)?.cartoLabel || `Layer ${index + 1}`) as string;
    const initialVisibility = (layer.props as any)?.visible !== false;

    const layerDiv = document.createElement('div');
    layerDiv.className = 'legend-layer';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'legend-title-container';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `layer-toggle-${layerId}`;
    checkbox.name = layerLabel;
    checkbox.checked = initialVisibility;
    checkbox.className = 'layer-visibility-toggle';

    const legendDetailsContainer = document.createElement('div');
    legendDetailsContainer.className = 'legend-layer-details';
    if (!initialVisibility) {
      legendDetailsContainer.style.display = 'none'; // Hide if layer is initially not visible
    }

    checkbox.addEventListener('change', () => {
      const event = new CustomEvent('togglelayervisibility', {
        detail: {
          layerId: layerId,
          visible: checkbox.checked
        }
      });
      wrapper.dispatchEvent(event);

      if (checkbox.checked) {
        legendDetailsContainer.style.display = '';
      } else {
        legendDetailsContainer.style.display = 'none';
      }
    });

    const nameDiv = document.createElement('label');
    nameDiv.className = 'legend-title';
    nameDiv.htmlFor = checkbox.id;
    nameDiv.textContent = layerLabel;

    titleContainer.appendChild(checkbox);
    titleContainer.appendChild(nameDiv);
    layerDiv.appendChild(titleContainer);

    // --- START LEGEND ITEMS FROM SCALES ---
    let legendItemsGeneratedFromScales = false;
    if (layer.scales && layer.scales.fillColor) {
      const scale: Scale = layer.scales.fillColor;

      const scaleHeaderDiv = document.createElement('div');
      scaleHeaderDiv.className = 'legend-header';
      scaleHeaderDiv.textContent = (scale.field?.name || 'Color').toUpperCase();
      legendDetailsContainer.appendChild(scaleHeaderDiv);

      if (scale.domain && scale.range) {
        if (
          (scale.type === 'ordinal' || scale.type === 'custom' || scale.type === 'point') &&
          scale.domain.length === scale.range.length
        ) {
          legendItemsGeneratedFromScales = true;
          scale.domain.forEach((domainItem, i) => {
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'legend-range';

            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'legend-color-swatch';
            const colorValue = scale.range[i];
            if (typeof colorValue === 'string') {
              colorSwatch.style.backgroundColor = colorValue;
            } else if (Array.isArray(colorValue) && colorValue.length >= 3) {
              colorSwatch.style.backgroundColor = `rgba(${colorValue[0]}, ${colorValue[1]}, ${
                colorValue[2]
              }, ${colorValue.length > 3 ? colorValue[3] / 255 : 1})`;
            }

            const rangeLabel = document.createElement('div');
            rangeLabel.className = 'legend-range-label';
            rangeLabel.textContent = String(domainItem);

            rangeDiv.appendChild(colorSwatch);
            rangeDiv.appendChild(rangeLabel);
            legendDetailsContainer.appendChild(rangeDiv);
          });
        } else if (
          ['quantize', 'quantile', 'linear', 'sqrt', 'log'].includes(scale.type) &&
          scale.domain.length === scale.range.length + 1
        ) {
          legendItemsGeneratedFromScales = true;
          for (let i = 0; i < scale.range.length; i++) {
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'legend-range';

            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'legend-color-swatch';
            const colorValue = scale.range[i];
            if (typeof colorValue === 'string') {
              colorSwatch.style.backgroundColor = colorValue;
            } else if (Array.isArray(colorValue) && colorValue.length >= 3) {
              colorSwatch.style.backgroundColor = `rgba(${colorValue[0]}, ${colorValue[1]}, ${
                colorValue[2]
              }, ${colorValue.length > 3 ? colorValue[3] / 255 : 1})`;
            }

            const rangeLabel = document.createElement('div');
            rangeLabel.className = 'legend-range-label';
            const start = formatLegendNumber(scale.domain[i] as number);
            const end = formatLegendNumber(scale.domain[i + 1] as number);
            rangeLabel.textContent = `${start} – ${end}`;

            rangeDiv.appendChild(colorSwatch);
            rangeDiv.appendChild(rangeLabel);
            legendDetailsContainer.appendChild(rangeDiv);
          }
        } else if (
          ['quantize', 'quantile', 'linear', 'sqrt', 'log'].includes(scale.type) &&
          scale.domain.length === scale.range.length
        ) {
          legendItemsGeneratedFromScales = true;
          scale.domain.forEach((domainItem, i) => {
            const rangeDiv = document.createElement('div');
            rangeDiv.className = 'legend-range';

            const colorSwatch = document.createElement('div');
            colorSwatch.className = 'legend-color-swatch';
            const colorValue = scale.range[i];
            if (typeof colorValue === 'string') {
              colorSwatch.style.backgroundColor = colorValue;
            } else if (Array.isArray(colorValue) && colorValue.length >= 3) {
              colorSwatch.style.backgroundColor = `rgba(${colorValue[0]}, ${colorValue[1]}, ${
                colorValue[2]
              }, ${colorValue.length > 3 ? colorValue[3] / 255 : 1})`;
            }

            const rangeLabel = document.createElement('div');
            rangeLabel.className = 'legend-range-label';
            rangeLabel.textContent = formatLegendNumber(domainItem as number);

            rangeDiv.appendChild(colorSwatch);
            rangeDiv.appendChild(rangeLabel);
            legendDetailsContainer.appendChild(rangeDiv);
          });
        }
      }
    }
    // --- END LEGEND ITEMS FROM SCALES ---

    // Fallback to existing logic if scales didn't produce legend items
    if (!legendItemsGeneratedFromScales) {
      const getFillColorProp = (layer.props as any)?.getFillColor;
      const isConstantColor = typeof getFillColorProp !== 'function';

      if (isConstantColor) {
        const rangeDiv = document.createElement('div');
        rangeDiv.className = 'legend-range';

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'legend-color-swatch';
        const color = getFillColorProp;
        if (Array.isArray(color) && color.length >= 3) {
          colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        } else {
          colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
        }

        const rangeLabel = document.createElement('div');
        rangeLabel.className = 'legend-range-label';
        rangeLabel.textContent = 'All values';

        rangeDiv.appendChild(colorSwatch);
        rangeDiv.appendChild(rangeLabel);
        legendDetailsContainer.appendChild(rangeDiv);
      }
    }

    layerDiv.appendChild(legendDetailsContainer);

    container.appendChild(layerDiv);
  });

  wrapper.appendChild(container);
  return wrapper;
}
