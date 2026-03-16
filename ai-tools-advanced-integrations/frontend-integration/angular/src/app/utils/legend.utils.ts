/**
 * Legend Utilities for Deck.gl Layers
 *
 * Extracts color and legend information from Deck.gl layer specifications
 * to display accurate legends in the UI.
 */

import { LayerSpec } from '../state/deck-state.service';
import * as cartocolor from 'cartocolor';

// ==================== TYPE DEFINITIONS ====================

export interface DiscreteColorEntry {
  label: string;
  color: string; // hex
  rgba: number[];
}

export interface ColorFunctionLegend {
  type: 'bins' | 'continuous' | 'categories';
  domain: number[] | string[];
  palette: string;
  attribute: string;
  colors?: string[]; // computed palette colors
}

export interface LegendData {
  type: 'discrete' | 'continuous' | 'bins' | 'categories' | 'single';
  entries?: DiscreteColorEntry[];
  functionConfig?: ColorFunctionLegend;
  singleColor?: string; // for simple static colors
  attribute?: string; // property/attribute name used for coloring
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert RGBA array to hex color string
 */
export const rgbaToHex = (rgba: number[]): string => {
  if (!Array.isArray(rgba) || rgba.length < 3) {
    return '#000000';
  }

  const r = Math.round(rgba[0]);
  const g = Math.round(rgba[1]);
  const b = Math.round(rgba[2]);

  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
};

/**
 * Get palette from cartocolor package
 * Returns array of hex color strings
 */
const getCartoPalette = (paletteName: string, count: number): string[] => {
  // Normalize palette name (cartocolor uses exact case)
  const palette = (cartocolor as any)[paletteName];

  if (!palette) {
    console.warn(`[LegendUtils] Palette "${paletteName}" not found in cartocolor`);
    return [];
  }

  // Get available sizes (excluding 'tags' property)
  const availableSizes = Object.keys(palette)
    .filter(key => key !== 'tags' && !isNaN(Number(key)))
    .map(Number)
    .sort((a, b) => a - b);

  if (availableSizes.length === 0) {
    console.warn(`[LegendUtils] No color sizes available for palette "${paletteName}"`);
    return [];
  }

  // Find the closest size (prefer larger if exact match not available)
  let selectedSize = availableSizes[0];
  for (const size of availableSizes) {
    if (size >= count) {
      selectedSize = size;
      break;
    }
    selectedSize = size; // Keep the largest available
  }

  // Get colors for selected size
  const colors = palette[selectedSize.toString()] as string[] | undefined;

  if (!colors || !Array.isArray(colors)) {
    console.warn(`[LegendUtils] No colors found for palette "${paletteName}" size ${selectedSize}`);
    return [];
  }

  // If we need fewer colors than available, take evenly spaced colors
  if (count < colors.length) {
    const step = (colors.length - 1) / (count - 1);
    const selectedColors: string[] = [];
    for (let i = 0; i < count; i++) {
      const index = Math.round(i * step);
      const clampedIndex = Math.min(index, colors.length - 1);
      selectedColors.push(colors[clampedIndex]);
    }
    return selectedColors;
  }

  // Return all colors if count matches or exceeds available
  return colors.slice(0, count);
};

/**
 * Get colors from a CARTO palette using official cartocolor package
 */
export const getPaletteColors = (paletteName: string, count: number): string[] => {
  if (count <= 0) {
    return [];
  }

  // Use official cartocolor package
  const colors = getCartoPalette(paletteName, count);

  if (colors.length === 0) {
    // Fallback to hardcoded palettes if cartocolor doesn't have the palette
    console.warn(`[LegendUtils] Falling back to hardcoded palette for "${paletteName}"`);
    return getPaletteColorsFallback(paletteName, count);
  }

  return colors;
};

/**
 * Fallback function using hardcoded palettes (for palettes not in cartocolor)
 */
const getPaletteColorsFallback = (paletteName: string, count: number): string[] => {
  const palette = (cartocolor as any)[paletteName];
  if (!palette) {
    console.warn(`[LegendUtils] Unknown palette: ${paletteName}`);
    return [];
  }

  if (count === 1) {
    const colorArray = palette[Math.floor(palette.length / 2)] as number[];
    return [rgbaToHex(colorArray)];
  }

  // Interpolate colors from palette
  const step = (palette.length - 1) / (count - 1);
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const index = Math.round(i * step);
    const clampedIndex = Math.min(index, palette.length - 1);
    const colorArray = palette[clampedIndex] as number[];
    colors.push(rgbaToHex(colorArray));
  }

  return colors;
};

/**
 * Result type for extractDiscreteColors
 */
interface DiscreteColorsResult {
  entries: DiscreteColorEntry[];
  attribute?: string;
}

/**
 * Parse @@= expression to extract discrete color mappings
 * Example: "@@=properties.group_name === 'Financial' ? [0, 0, 255, 200] : properties.group_name === 'Others' ? [255, 0, 0, 200] : [128, 128, 128, 180]"
 */
export const extractDiscreteColors = (expression: string): DiscreteColorsResult => {
  if (!expression || typeof expression !== 'string' || !expression.startsWith('@@=')) {
    return { entries: [] };
  }

  const expr = expression.slice(3).trim();
  const entries: DiscreteColorEntry[] = [];
  let attribute: string | undefined;

  // Pattern to match: property === 'value' ? [r, g, b, a] : ...
  // This regex captures the category value and color array
  const ternaryPattern = /properties\.(\w+)\s*===\s*['"]([^'"]+)['"]\s*\?\s*\[(\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\]/g;

  let match;
  const seenCategories = new Set<string>();

  while ((match = ternaryPattern.exec(expr)) !== null) {
    const propertyName = match[1];
    const categoryValue = match[2];
    const r = parseInt(match[3], 10);
    const g = parseInt(match[4], 10);
    const b = parseInt(match[5], 10);
    const a = match[6] ? parseInt(match[6], 10) : 255;
    const rgba = [r, g, b, a];

    // Extract attribute from first match (all should use the same property)
    if (!attribute) {
      attribute = propertyName;
    }

    // Use category value as label (e.g., "Financial", "Others")
    const label = categoryValue;
    const key = `${propertyName}:${categoryValue}`;

    if (!seenCategories.has(key)) {
      entries.push({
        label,
        color: rgbaToHex(rgba),
        rgba
      });
      seenCategories.add(key);
    }
  }

  // Also try to extract the default/fallback color (the last color in the chain)
  // Pattern: : [r, g, b, a] (at the end of the expression)
  const defaultPattern = /:\s*\[(\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\]\s*$/;
  const defaultMatch = expr.match(defaultPattern);
  if (defaultMatch && entries.length > 0) {
    const r = parseInt(defaultMatch[1], 10);
    const g = parseInt(defaultMatch[2], 10);
    const b = parseInt(defaultMatch[3], 10);
    const a = defaultMatch[4] ? parseInt(defaultMatch[4], 10) : 255;
    const rgba = [r, g, b, a];

    // Check if this default color is already in entries
    const defaultHex = rgbaToHex(rgba);
    const isDuplicate = entries.some(e => e.color === defaultHex);

    if (!isDuplicate) {
      entries.push({
        label: 'Other',
        color: defaultHex,
        rgba
      });
    }
  }

  return { entries, attribute };
};

/**
 * Extract color function configuration (colorBins, colorContinuous, colorCategories)
 */
export const extractColorFunctionConfig = (config: Record<string, unknown>): ColorFunctionLegend | null => {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const funcType = config['@@function'] as string;
  if (!funcType) {
    return null;
  }

  if (funcType === 'colorBins') {
    const domain = config.domain as number[] | undefined;
    const palette = (config.colors as string) || 'Sunset';
    const attr = (config.attr as string) || 'value';

    if (!domain || !Array.isArray(domain) || domain.length === 0) {
      return null;
    }

    // For bins, we need one more color than domain thresholds
    const colorCount = domain.length + 1;
    const colors = getPaletteColors(palette, colorCount);

    return {
      type: 'bins',
      domain,
      palette,
      attribute: attr,
      colors
    };
  }

  if (funcType === 'colorContinuous') {
    const domain = config.domain as number[] | undefined;
    const palette = (config.colors as string) || 'Sunset';
    const attr = (config.attr as string) || 'value';

    if (!domain || !Array.isArray(domain) || domain.length < 2) {
      return null;
    }

    // For continuous, use a gradient with multiple steps
    const colorCount = 10; // Smooth gradient
    const colors = getPaletteColors(palette, colorCount);

    return {
      type: 'continuous',
      domain,
      palette,
      attribute: attr,
      colors
    };
  }

  if (funcType === 'colorCategories') {
    const domain = config.domain as (string[] | number[]) | undefined;
    const palette = (config.colors as string) || 'Bold';
    const attr = (config.attr as string) || 'category';

    if (!domain || !Array.isArray(domain) || domain.length === 0) {
      return null;
    }

    const colorCount = domain.length;
    const colors = getPaletteColors(palette, colorCount);

    return {
      type: 'categories',
      domain,
      palette,
      attribute: attr,
      colors
    };
  }

  return null;
};

/**
 * Main function to extract legend data from a layer spec
 */
export const extractLegendFromLayer = (layer: LayerSpec): LegendData | null => {
  if (!layer || typeof layer !== 'object') {
    return null;
  }

  const getFillColor = layer['getFillColor'];

  // Case 1: Color function (colorBins, colorContinuous, colorCategories)
  if (getFillColor && typeof getFillColor === 'object' && getFillColor['@@function']) {
    const functionConfig = extractColorFunctionConfig(getFillColor as Record<string, unknown>);
    if (functionConfig) {
      return {
        type: functionConfig.type === 'bins' ? 'bins' : functionConfig.type === 'continuous' ? 'continuous' : 'categories',
        functionConfig,
        attribute: functionConfig.attribute
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
        attribute: result.attribute
      };
    }
  }

  // Case 3: Static color array
  if (getFillColor && Array.isArray(getFillColor)) {
    const rgba = getFillColor as number[];
    if (rgba.length >= 3 && rgba.every(n => typeof n === 'number')) {
      return {
        type: 'single',
        singleColor: rgbaToHex(rgba)
      };
    }
  }

  // No color styling found
  return null;
};
