import { describe, it, expect, vi } from 'vitest';
import {
  rgbaToHex,
  getPaletteColors,
  extractDiscreteColors,
  extractColorFunctionConfig,
  extractLegendFromLayer,
} from '../../../src/app/utils/legend.utils';

describe('rgbaToHex', () => {
  it('should convert pure red', () => {
    expect(rgbaToHex([255, 0, 0])).toBe('#ff0000');
  });

  it('should convert mixed color', () => {
    expect(rgbaToHex([0, 128, 255])).toBe('#0080ff');
  });

  it('should ignore alpha channel when 4 values provided', () => {
    expect(rgbaToHex([255, 0, 0, 128])).toBe('#ff0000');
  });

  it('should round fractional values', () => {
    const result = rgbaToHex([127.6, 0.4, 255]);
    expect(result).toBe('#8000ff');
  });

  it('should return #000000 for empty array', () => {
    expect(rgbaToHex([])).toBe('#000000');
  });

  it('should return #000000 for non-array input', () => {
    expect(rgbaToHex(null as unknown as number[])).toBe('#000000');
  });

  it('should convert black', () => {
    expect(rgbaToHex([0, 0, 0])).toBe('#000000');
  });

  it('should pad single-digit hex values', () => {
    expect(rgbaToHex([1, 2, 3])).toBe('#010203');
  });
});

describe('getPaletteColors', () => {
  it('should return correct number of colors for valid palette', () => {
    const colors = getPaletteColors('Sunset', 5);
    expect(colors).toHaveLength(5);
  });

  it('should return empty array for count <= 0', () => {
    expect(getPaletteColors('Sunset', 0)).toEqual([]);
    expect(getPaletteColors('Sunset', -1)).toEqual([]);
  });

  it('should warn and return empty for unknown palette', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const colors = getPaletteColors('NonExistentPalette', 5);
    expect(colors).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should return hex strings starting with #', () => {
    const colors = getPaletteColors('Sunset', 3);
    for (const color of colors) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('should return colors for count of 1', () => {
    const colors = getPaletteColors('Sunset', 1);
    expect(colors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('extractDiscreteColors', () => {
  it('should return empty entries for non-@@= expression', () => {
    const result = extractDiscreteColors('some plain string');
    expect(result.entries).toHaveLength(0);
  });

  it('should return empty entries for empty string', () => {
    const result = extractDiscreteColors('');
    expect(result.entries).toHaveLength(0);
  });

  it('should return empty entries for null/undefined', () => {
    expect(extractDiscreteColors(null as unknown as string).entries).toHaveLength(0);
    expect(extractDiscreteColors(undefined as unknown as string).entries).toHaveLength(0);
  });

  it('should parse single ternary with default color', () => {
    const expr = "@@=properties.group_name === 'Financial' ? [0, 0, 255, 200] : [128, 128, 128, 180]";
    const result = extractDiscreteColors(expr);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].label).toBe('Financial');
    expect(result.entries[0].color).toBe('#0000ff');
    expect(result.entries[1].label).toBe('Other');
  });

  it('should parse multiple ternary conditions', () => {
    const expr = "@@=properties.group_name === 'Financial' ? [0, 0, 255, 200] : properties.group_name === 'Tech' ? [255, 0, 0, 200] : [128, 128, 128, 180]";
    const result = extractDiscreteColors(expr);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].label).toBe('Financial');
    expect(result.entries[1].label).toBe('Tech');
    expect(result.entries[2].label).toBe('Other');
  });

  it('should extract attribute name', () => {
    const expr = "@@=properties.category === 'A' ? [255, 0, 0] : [0, 0, 0]";
    const result = extractDiscreteColors(expr);
    expect(result.attribute).toBe('category');
  });

  it('should default alpha to 255 when not provided', () => {
    const expr = "@@=properties.type === 'X' ? [255, 0, 0] : [0, 0, 0]";
    const result = extractDiscreteColors(expr);
    expect(result.entries[0].rgba).toEqual([255, 0, 0, 255]);
  });

  it('should deduplicate same category values', () => {
    const expr = "@@=properties.type === 'A' ? [255, 0, 0] : properties.type === 'A' ? [255, 0, 0] : [0, 0, 0]";
    const result = extractDiscreteColors(expr);
    const aEntries = result.entries.filter(e => e.label === 'A');
    expect(aEntries).toHaveLength(1);
  });
});

describe('extractColorFunctionConfig', () => {
  it('should return null for null input', () => {
    expect(extractColorFunctionConfig(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it('should return null for object without @@function', () => {
    expect(extractColorFunctionConfig({ domain: [1, 2] })).toBeNull();
  });

  it('should parse colorBins with valid domain', () => {
    const config = { '@@function': 'colorBins', domain: [100, 500, 1000], colors: 'Sunset', attr: 'population' };
    const result = extractColorFunctionConfig(config);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('bins');
    expect(result!.domain).toEqual([100, 500, 1000]);
    expect(result!.palette).toBe('Sunset');
    expect(result!.attribute).toBe('population');
    expect(result!.colors).toHaveLength(4); // domain.length + 1
  });

  it('should default palette to Sunset for colorBins', () => {
    const config = { '@@function': 'colorBins', domain: [10], attr: 'val' };
    const result = extractColorFunctionConfig(config);
    expect(result!.palette).toBe('Sunset');
  });

  it('should return null for colorBins with empty domain', () => {
    const config = { '@@function': 'colorBins', domain: [], attr: 'val' };
    expect(extractColorFunctionConfig(config)).toBeNull();
  });

  it('should parse colorContinuous with valid domain', () => {
    const config = { '@@function': 'colorContinuous', domain: [0, 100], colors: 'Emrld', attr: 'density' };
    const result = extractColorFunctionConfig(config);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('continuous');
    expect(result!.colors!.length).toBeGreaterThan(0);
  });

  it('should return null for colorContinuous with domain < 2', () => {
    const config = { '@@function': 'colorContinuous', domain: [100], attr: 'val' };
    expect(extractColorFunctionConfig(config)).toBeNull();
  });

  it('should parse colorCategories with valid domain', () => {
    const config = { '@@function': 'colorCategories', domain: ['A', 'B', 'C'], colors: 'Bold', attr: 'category' };
    const result = extractColorFunctionConfig(config);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('categories');
    expect(result!.colors).toHaveLength(3);
  });
});

describe('extractLegendFromLayer', () => {
  it('should return null for null layer', () => {
    expect(extractLegendFromLayer(null as unknown as Record<string, unknown>)).toBeNull();
  });

  it('should return null for layer without getFillColor', () => {
    expect(extractLegendFromLayer({ id: 'test' })).toBeNull();
  });

  it('should extract legend from colorBins layer', () => {
    const layer = {
      id: 'test',
      getFillColor: { '@@function': 'colorBins', domain: [10, 50], colors: 'Sunset', attr: 'value' },
    };
    const result = extractLegendFromLayer(layer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('bins');
    expect(result!.functionConfig).toBeDefined();
    expect(result!.attribute).toBe('value');
  });

  it('should extract legend from colorContinuous layer', () => {
    const layer = {
      id: 'test',
      getFillColor: { '@@function': 'colorContinuous', domain: [0, 100], colors: 'Emrld', attr: 'density' },
    };
    const result = extractLegendFromLayer(layer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('continuous');
  });

  it('should extract legend from colorCategories layer', () => {
    const layer = {
      id: 'test',
      getFillColor: { '@@function': 'colorCategories', domain: ['A', 'B'], colors: 'Bold', attr: 'cat' },
    };
    const result = extractLegendFromLayer(layer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('categories');
  });

  it('should extract legend from @@= discrete expression', () => {
    const layer = {
      id: 'test',
      getFillColor: "@@=properties.type === 'X' ? [255, 0, 0, 200] : [0, 0, 255, 200]",
    };
    const result = extractLegendFromLayer(layer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('discrete');
    expect(result!.entries).toBeDefined();
    expect(result!.attribute).toBe('type');
  });

  it('should extract legend from static color array', () => {
    const layer = { id: 'test', getFillColor: [255, 128, 0] };
    const result = extractLegendFromLayer(layer);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('single');
    expect(result!.singleColor).toBe('#ff8000');
  });

  it('should return null for non-@@= string getFillColor', () => {
    const layer = { id: 'test', getFillColor: 'someFunction' };
    expect(extractLegendFromLayer(layer)).toBeNull();
  });
});
