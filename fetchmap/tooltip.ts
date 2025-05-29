import {Layer} from '@deck.gl/core';
import {FetchMapResult} from '@carto/api-client';

// Define the structure for aggregated map data expected by the tooltip function
interface AggregatedMapDataForTooltip {
  popupSettings: FetchMapResult['popupSettings'] | null;
}

export function buildTooltip(
  object: any,
  layer: Layer,
  currentMapData: AggregatedMapDataForTooltip | null
) {
  if (
    !object ||
    !layer ||
    !currentMapData ||
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
  if (layerSettings.hover && layerSettings.hover.fields && layerSettings.hover.fields.length > 0) {
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
              const formatter = new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: precision,
                compactDisplay: 'short'
              });
              formattedNumber = formatter.format(rawValue);
            } else if (
              formatSpec.includes('.') &&
              (formatSpec.endsWith('f') || /^\.\d$/.test(formatSpec) || /^\.\d~$/.test(formatSpec))
            ) {
              const precision = parseInt(formatSpec.match(/\.(\d)/)?.[1] || '2');
              formattedNumber = rawValue.toFixed(precision);
            }
            valueToDisplay = formattedNumber;
          } catch (e) {
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
