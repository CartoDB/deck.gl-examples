/**
 * Legend Utilities for Deck.gl Layers
 *
 * Extracts color and legend information from Deck.gl layer specifications
 * to display accurate legends in the UI.
 */

import * as cartocolor from 'cartocolor';

/**
 * Convert RGBA array to hex color string
 */
export const rgbaToHex = (rgba) => {
  if (!Array.isArray(rgba) || rgba.length < 3) {
    return '#000000';
  }

  const r = Math.round(rgba[0]);
  const g = Math.round(rgba[1]);
  const b = Math.round(rgba[2]);

  return `#${[r, g, b]
    .map((x) => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('')}`;
};

/**
 * Get palette from cartocolor package
 * Returns array of hex color strings
 */
const getCartoPalette = (paletteName, count) => {
  const palette = cartocolor[paletteName];

  if (!palette) {
    console.warn(`[LegendUtils] Palette "${paletteName}" not found in cartocolor`);
    return [];
  }

  const availableSizes = Object.keys(palette)
    .filter((key) => key !== 'tags' && !isNaN(Number(key)))
    .map(Number)
    .sort((a, b) => a - b);

  if (availableSizes.length === 0) {
    console.warn(`[LegendUtils] No color sizes available for palette "${paletteName}"`);
    return [];
  }

  let selectedSize = availableSizes[0];
  for (const size of availableSizes) {
    if (size >= count) {
      selectedSize = size;
      break;
    }
    selectedSize = size;
  }

  const colors = palette[selectedSize.toString()];

  if (!colors || !Array.isArray(colors)) {
    console.warn(
      `[LegendUtils] No colors found for palette "${paletteName}" size ${selectedSize}`
    );
    return [];
  }

  if (count < colors.length) {
    const step = (colors.length - 1) / (count - 1);
    const selectedColors = [];
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      const clampedIndex = Math.min(index, colors.length - 1);
      selectedColors.push(colors[clampedIndex]);
    }
    return selectedColors;
  }

  return colors.slice(0, count);
};

/**
 * Get colors from a CARTO palette using official cartocolor package
 */
export const getPaletteColors = (paletteName, count) => {
  if (count <= 0) {
    return [];
  }

  const colors = getCartoPalette(paletteName, count);

  if (colors.length === 0) {
    console.warn(`[LegendUtils] Falling back to hardcoded palette for "${paletteName}"`);
    return getPaletteColorsFallback(paletteName, count);
  }

  return colors;
};

/**
 * Fallback function using hardcoded palettes
 */
const getPaletteColorsFallback = (paletteName, count) => {
  const palette = cartocolor[paletteName];
  if (!palette) {
    console.warn(`[LegendUtils] Unknown palette: ${paletteName}`);
    return [];
  }

  if (count === 1) {
    const colorArray = palette[Math.floor(palette.length / 2)];
    return [rgbaToHex(colorArray)];
  }

  const step = (palette.length - 1) / (count - 1);
  const colors = [];

  for (let i = 0; i < count; i++) {
    const index = Math.round(i * step);
    const clampedIndex = Math.min(index, palette.length - 1);
    const colorArray = palette[clampedIndex];
    colors.push(rgbaToHex(colorArray));
  }

  return colors;
};

/**
 * Parse @@= expression to extract discrete color mappings
 */
export const extractDiscreteColors = (expression) => {
  if (!expression || typeof expression !== 'string' || !expression.startsWith('@@=')) {
    return { entries: [] };
  }

  const expr = expression.slice(3).trim();
  const entries = [];
  let attribute;

  const ternaryPattern =
    /properties\.(\w+)\s*===\s*['"]([^'"]+)['"]\s*\?\s*\[(\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\]/g;

  let match;
  const seenCategories = new Set();

  while ((match = ternaryPattern.exec(expr)) !== null) {
    const propertyName = match[1];
    const categoryValue = match[2];
    const r = parseInt(match[3], 10);
    const g = parseInt(match[4], 10);
    const b = parseInt(match[5], 10);
    const a = match[6] ? parseInt(match[6], 10) : 255;
    const rgba = [r, g, b, a];

    if (!attribute) {
      attribute = propertyName;
    }

    const label = categoryValue;
    const key = `${propertyName}:${categoryValue}`;

    if (!seenCategories.has(key)) {
      entries.push({
        label,
        color: rgbaToHex(rgba),
        rgba,
      });
      seenCategories.add(key);
    }
  }

  const defaultPattern = /:\s*\[(\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\]\s*$/;
  const defaultMatch = expr.match(defaultPattern);
  if (defaultMatch && entries.length > 0) {
    const r = parseInt(defaultMatch[1], 10);
    const g = parseInt(defaultMatch[2], 10);
    const b = parseInt(defaultMatch[3], 10);
    const a = defaultMatch[4] ? parseInt(defaultMatch[4], 10) : 255;
    const rgba = [r, g, b, a];

    const defaultHex = rgbaToHex(rgba);
    const isDuplicate = entries.some((e) => e.color === defaultHex);

    if (!isDuplicate) {
      entries.push({
        label: 'Other',
        color: defaultHex,
        rgba,
      });
    }
  }

  return { entries, attribute };
};

/**
 * Extract color function configuration (colorBins, colorContinuous, colorCategories)
 */
export const extractColorFunctionConfig = (config) => {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const funcType = config['@@function'];
  if (!funcType) {
    return null;
  }

  if (funcType === 'colorBins') {
    const domain = config.domain;
    const palette = config.colors || 'Sunset';
    const attr = config.attr || 'value';

    if (!domain || !Array.isArray(domain) || domain.length === 0) {
      return null;
    }

    const colorCount = domain.length + 1;
    const colors = getPaletteColors(palette, colorCount);

    return { type: 'bins', domain, palette, attribute: attr, colors };
  }

  if (funcType === 'colorContinuous') {
    const domain = config.domain;
    const palette = config.colors || 'Sunset';
    const attr = config.attr || 'value';

    if (!domain || !Array.isArray(domain) || domain.length < 2) {
      return null;
    }

    const colorCount = 10;
    const colors = getPaletteColors(palette, colorCount);

    return { type: 'continuous', domain, palette, attribute: attr, colors };
  }

  if (funcType === 'colorCategories') {
    const domain = config.domain;
    const palette = config.colors || 'Bold';
    const attr = config.attr || 'category';

    if (!domain || !Array.isArray(domain) || domain.length === 0) {
      return null;
    }

    const colorCount = domain.length;
    const colors = getPaletteColors(palette, colorCount);

    return { type: 'categories', domain, palette, attribute: attr, colors };
  }

  return null;
};

/**
 * Main function to extract legend data from a layer spec
 */
export const extractLegendFromLayer = (layer) => {
  if (!layer || typeof layer !== 'object') {
    return null;
  }

  const getFillColor = layer['getFillColor'];

  // Case 1: Color function (colorBins, colorContinuous, colorCategories)
  if (getFillColor && typeof getFillColor === 'object' && getFillColor['@@function']) {
    const functionConfig = extractColorFunctionConfig(getFillColor);
    if (functionConfig) {
      return {
        type:
          functionConfig.type === 'bins'
            ? 'bins'
            : functionConfig.type === 'continuous'
              ? 'continuous'
              : 'categories',
        functionConfig,
        attribute: functionConfig.attribute,
      };
    }
  }

  // Case 2: @@= expression with discrete colors
  if (getFillColor && typeof getFillColor === 'string' && getFillColor.startsWith('@@=')) {
    const result = extractDiscreteColors(getFillColor);
    if (result.entries.length > 0) {
      return {
        type: 'discrete',
        entries: result.entries,
        attribute: result.attribute,
      };
    }
  }

  // Case 3: Static color array
  if (getFillColor && Array.isArray(getFillColor)) {
    const rgba = getFillColor;
    if (rgba.length >= 3 && rgba.every((n) => typeof n === 'number')) {
      return {
        type: 'single',
        singleColor: rgbaToHex(rgba),
      };
    }
  }

  return null;
};
