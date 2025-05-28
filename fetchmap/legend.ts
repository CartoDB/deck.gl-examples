import {LayerDescriptor, Scale, ScaleKey} from '@carto/api-client';
import './legend.css';

// Helper function to format numbers nicely (e.g., for legend ranges)
function formatLegendNumber(num: number): string {
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(num)) return num.toString();
  return num.toFixed(2);
}

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
          // console.warn(
          //   `[Legend] Layer ${layerLabel}: Quantitative scale type '${scale.type}' with equal domain/range length. Displaying domain values directly.`
          // );
        } else {
          // console.warn(
          //   `[Legend] Layer ${layerLabel}: fillColor scale type '${scale.type}' with unhandled domain/range length combination. Domain: ${scale.domain.length}, Range: ${scale.range.length}. Skipping scale-based legend items for this scale.`
          // );
        }
      } else {
        // console.warn(
        //   `[Legend] Layer ${layerLabel}: fillColor scale domain or range is undefined. Domain: ${scale.domain?.length}, Range: ${scale.range?.length}`
        // );
      }
    }
    // --- END LEGEND ITEMS FROM SCALES ---

    // Fallback to existing logic if scales didn't produce legend items
    if (!legendItemsGeneratedFromScales) {
      // console.log(
      //   `[Legend] Layer ${layerLabel}: No legend items from scales, falling back to props/tilestats.`
      // );
      const getFillColorProp = (layer.props as any)?.getFillColor;
      const isConstantColor = typeof getFillColorProp !== 'function';
      // console.log(
      //   `[Legend] Layer ${index} isConstantColor: ${isConstantColor} (type of getFillColor: ${typeof getFillColorProp})`
      // );

      if (isConstantColor) {
        // console.log(`[Legend] Layer ${index} (fallback) rendering as CONSTANT color.`);
        const rangeDiv = document.createElement('div');
        rangeDiv.className = 'legend-range';

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'legend-color-swatch';
        const color = getFillColorProp;
        if (Array.isArray(color) && color.length >= 3) {
          colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        } else {
          // console.error(`[Legend] Layer ${index} constant color is not a valid array:`, color);
          colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
        }

        const rangeLabel = document.createElement('div');
        rangeLabel.className = 'legend-range-label';
        rangeLabel.textContent = 'All values';

        rangeDiv.appendChild(colorSwatch);
        rangeDiv.appendChild(rangeLabel);
        legendDetailsContainer.appendChild(rangeDiv);
      } else {
        // Data-driven legend (numeric, categorical)
        // console.log(`[Legend] Layer ${index} (fallback) attempting data-driven legend.`);
        const widgetSource = (layer.props as any)?.data?.widgetSource?.props;
        if (!widgetSource) {
          // console.log(
          //   `[Legend] Layer ${index} (fallback) no widgetSource for data-driven legend. Skipping specific items.`
          // );
        } else {
          let columnsInWidgetSource = widgetSource.columns;
          if (typeof columnsInWidgetSource === 'string') {
            columnsInWidgetSource = [columnsInWidgetSource];
          }

          if (!Array.isArray(columnsInWidgetSource)) {
            // console.log(
            //   `[Legend] Layer ${index} (fallback) widgetSource.columns is not an array or string (actual type: ${typeof widgetSource.columns}). Skipping data-driven legend items.`
            // );
          } else {
            const dataColumn = columnsInWidgetSource.find(
              (col: string) => col !== widgetSource.spatialDataColumn
            );
            // console.log(
            //   `[Legend] Layer ${index} (fallback) dataColumn: ${dataColumn} (available columns: ${columnsInWidgetSource?.join(
            //     ', '
            //   )}, spatialDataColumn: ${widgetSource.spatialDataColumn})`
            // );

            if (!dataColumn) {
              // console.log(
              //   `[Legend] Layer ${index} (fallback) no dataColumn found. Skipping specific items.`
              // );
            } else {
              const columnHeaderDiv = document.createElement('div');
              columnHeaderDiv.className = 'legend-header';
              columnHeaderDiv.textContent = 'COLOR BASED ON (Fallback)';
              legendDetailsContainer.appendChild(columnHeaderDiv);

              const dataColumnDisplayDiv = document.createElement('div');
              dataColumnDisplayDiv.className = 'legend-column';
              dataColumnDisplayDiv.textContent = dataColumn;
              legendDetailsContainer.appendChild(dataColumnDisplayDiv);

              const tilestats = (layer.props as any)?.data?.tilestats?.layers[0]?.attributes?.find(
                (a: any) => a.attribute === dataColumn
              );
              // console.log(
              //   `[Legend] Layer ${index} (fallback) tilestats for column ${dataColumn}:`,
              //   tilestats ? JSON.parse(JSON.stringify(tilestats)) : 'undefined'
              // );

              if (
                tilestats &&
                tilestats.type === 'Number' &&
                tilestats.min !== undefined &&
                tilestats.max !== undefined
              ) {
                // console.log(`[Legend] Layer ${index} (fallback) rendering as NUMERIC ramp.`);
                const numRanges = 6;
                const min = tilestats.min;
                const max = tilestats.max;
                if (min === max) {
                  const rangeDiv = document.createElement('div');
                  rangeDiv.className = 'legend-range';
                  const colorSwatch = document.createElement('div');
                  colorSwatch.className = 'legend-color-swatch';
                  try {
                    const color = getFillColorProp({properties: {[dataColumn]: min}});
                    if (Array.isArray(color) && color.length >= 3) {
                      colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                    } else {
                      // console.error(
                      //   `[Legend] Layer ${index} getFillColor returned invalid color for single value ${min}:`,
                      //   color
                      // );
                      colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
                    }
                  } catch (e) {
                    // console.error(
                    //   `[Legend] Layer ${index} error calling getFillColor for single value ${min}:`,
                    //   e
                    // );
                    colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
                  }
                  const rangeLabel = document.createElement('div');
                  rangeLabel.className = 'legend-range-label';
                  rangeLabel.textContent = `${min.toFixed(2)}`;
                  rangeDiv.appendChild(colorSwatch);
                  rangeDiv.appendChild(rangeLabel);
                  legendDetailsContainer.appendChild(rangeDiv);
                } else {
                  const step = (max - min) / numRanges;
                  for (let i = 0; i < numRanges; i++) {
                    const rangeStart = min + step * i;
                    const rangeEnd = i === numRanges - 1 ? max : min + step * (i + 1);

                    const rangeDiv = document.createElement('div');
                    rangeDiv.className = 'legend-range';

                    const colorSwatch = document.createElement('div');
                    colorSwatch.className = 'legend-color-swatch';
                    const value = (rangeStart + rangeEnd) / 2;
                    try {
                      const color = getFillColorProp({
                        properties: {[dataColumn]: value}
                      });
                      if (Array.isArray(color) && color.length >= 3) {
                        colorSwatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                      } else {
                        // console.error(
                        //   `[Legend] Layer ${index} getFillColor function returned invalid color for value ${value}:`,
                        //   color
                        // );
                        colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
                      }
                    } catch (e) {
                      // console.error(
                      //   `[Legend] Layer ${index} error calling getFillColor for value ${value}:`,
                      //   e
                      // );
                      colorSwatch.style.backgroundColor = 'rgb(128, 128, 128)';
                    }

                    const rangeLabel = document.createElement('div');
                    rangeLabel.className = 'legend-range-label';
                    rangeLabel.textContent = `${rangeStart.toFixed(2)} – ${rangeEnd.toFixed(2)}`;

                    rangeDiv.appendChild(colorSwatch);
                    rangeDiv.appendChild(rangeLabel);
                    legendDetailsContainer.appendChild(rangeDiv);
                  }
                }
              } else if (tilestats?.type === 'String' && tilestats.categories) {
                // console.log(`[Legend] Layer ${index} (fallback) rendering as CATEGORIES.`);
                const categoriesDiv = document.createElement('div');
                categoriesDiv.className = 'legend-categories';
                // console.log(
                //   `[Legend] Layer ${index} (fallback) categories:`,
                //   tilestats.categories.map((c: any) => c.category)
                // );
                categoriesDiv.textContent = `Categories: ${tilestats.categories.length}`;
                legendDetailsContainer.appendChild(categoriesDiv);
              } else {
                // console.log(
                //   `[Legend] Layer ${index} (fallback) data-driven legend conditions not met (e.g., missing/invalid tilestats).`
                // );
                // if (tilestats) {
                //   console.log(
                //     `  tilestats.type: ${tilestats.type}, tilestats.min: ${
                //       tilestats.min
                //     }, tilestats.max: ${tilestats.max}, tilestats.categories: ${
                //       tilestats.categories ? tilestats.categories.length : 'N/A'
                //     }`
                //   );
                // }
              }
            }
          }
        }
      }
    }
    layerDiv.appendChild(legendDetailsContainer);

    container.appendChild(layerDiv);
  });

  wrapper.appendChild(container);
  return wrapper;
}
