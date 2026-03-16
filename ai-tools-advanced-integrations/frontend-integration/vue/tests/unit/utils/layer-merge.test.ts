import { describe, it, expect, vi } from 'vitest';
import { mergeLayerSpecs, validateLayerColumns } from '../../../src/utils/layer-merge';

describe('mergeLayerSpecs', () => {
  it('adds new layers', () => {
    const existing = [{ id: 'a', color: 'red' }];
    const incoming = [{ id: 'b', color: 'blue' }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ id: 'b', color: 'blue' });
  });

  it('deep merges existing layers by ID', () => {
    const existing = [{ id: 'a', data: { columns: ['x'], type: 'vector' } }];
    const incoming = [{ id: 'a', data: { columns: ['x', 'y'] } }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'a',
      data: { columns: ['x', 'y'], type: 'vector' },
    });
  });

  it('preserves layers not in incoming', () => {
    const existing = [{ id: 'a', color: 'red' }, { id: 'b', color: 'blue' }];
    const incoming = [{ id: 'a', color: 'green' }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].color).toBe('green');
    expect(result[1].color).toBe('blue');
  });

  it('returns empty array when both inputs are empty', () => {
    const result = mergeLayerSpecs([], []);
    expect(result).toHaveLength(0);
  });

  it('returns existing layers when incoming is empty', () => {
    const existing = [{ id: 'a', color: 'red' }];
    const result = mergeLayerSpecs(existing, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'a', color: 'red' });
  });

  it('returns incoming layers when existing is empty', () => {
    const incoming = [{ id: 'b', color: 'blue' }];
    const result = mergeLayerSpecs([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'b', color: 'blue' });
  });

  it('skips layers without an id property', () => {
    const existing = [{ id: 'a', color: 'red' }];
    const incoming = [{ color: 'blue' }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'a', color: 'red' });
  });

  it('deep merges 3+ levels of nesting', () => {
    const existing = [{ id: 'a', data: { config: { style: { opacity: 0.5 }, format: 'json' } } }];
    const incoming = [{ id: 'a', data: { config: { style: { color: 'red' } } } }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result[0]).toEqual({
      id: 'a',
      data: { config: { style: { opacity: 0.5, color: 'red' }, format: 'json' } },
    });
  });

  it('overwrites arrays instead of concatenating', () => {
    const existing = [{ id: 'a', data: { columns: ['x'] } }];
    const incoming = [{ id: 'a', data: { columns: ['x', 'y'] } }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result[0].data).toEqual({ columns: ['x', 'y'] });
  });

  it('overwrites target value with null from source', () => {
    const existing = [{ id: 'a', color: 'red', opacity: 0.8 }];
    const incoming = [{ id: 'a', color: null }];
    const result = mergeLayerSpecs(existing, incoming);
    expect(result[0].color).toBeNull();
    expect(result[0].opacity).toBe(0.8);
  });
});

describe('validateLayerColumns', () => {
  it('does not warn when all referenced columns are present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.population > 1000 ? [255,0,0] : [0,0,255]',
      data: { columns: ['population'] },
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns when a referenced column is missing from data.columns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.revenue > 1000 ? [255,0,0] : [0,0,255]',
      data: { columns: ['name', 'city'] },
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('revenue'));
    warnSpy.mockRestore();
  });

  it('does not warn when accessor lacks @@= prefix', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: 'properties.revenue > 1000 ? [255,0,0] : [0,0,255]',
      data: { columns: ['name'] },
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('extracts columns from all 4 accessor properties', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.colA',
      getLineColor: '@@=properties.colB',
      getPointRadius: '@@=properties.colC',
      getLineWidth: '@@=properties.colD',
      data: { columns: [] },
    });
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain('colA');
    expect(warnMsg).toContain('colB');
    expect(warnMsg).toContain('colC');
    expect(warnMsg).toContain('colD');
    warnSpy.mockRestore();
  });

  it('matches columns case-insensitively', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.Population',
      data: { columns: ['population'] },
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not warn when accessors are not strings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: [255, 0, 0],
      getLineColor: { '@@function': 'colorBins' },
    });
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles layer with no data property', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.value',
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('value'));
    warnSpy.mockRestore();
  });

  it('deduplicates column references across accessors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateLayerColumns({
      id: 'test',
      getFillColor: '@@=properties.value > 10 ? [255,0,0] : [0,255,0]',
      getLineColor: '@@=properties.value > 5 ? [0,0,255] : [255,255,0]',
      data: { columns: [] },
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    const valueMatches = warnMsg.match(/value/g);
    expect(valueMatches).toHaveLength(1);
    warnSpy.mockRestore();
  });
});
