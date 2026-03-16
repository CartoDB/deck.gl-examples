import { describe, it, expect } from 'vitest';
import { sanitizeMalformedKeys, stripCredentials } from '../../../src/services/agent-runner.js';

// ─── sanitizeMalformedKeys ──────────────────────────────────

describe('sanitizeMalformedKeys', () => {
  it('passes through null', () => {
    expect(sanitizeMalformedKeys(null)).toBeNull();
  });

  it('passes through undefined', () => {
    expect(sanitizeMalformedKeys(undefined)).toBeUndefined();
  });

  it('passes through primitives', () => {
    expect(sanitizeMalformedKeys(42)).toBe(42);
    expect(sanitizeMalformedKeys(true)).toBe(true);
  });

  it('passes through a string without @@ references', () => {
    expect(sanitizeMalformedKeys('hello world')).toBe('hello world');
  });

  it('returns an empty object unchanged', () => {
    expect(sanitizeMalformedKeys({})).toEqual({});
  });

  it('fixes single-quoted @@type key', () => {
    const input = { "'@@type'": 'VectorTileLayer' };
    const result = sanitizeMalformedKeys(input);
    expect(result).toEqual({ '@@type': 'VectorTileLayer' });
  });

  it('fixes double-quoted @@function key', () => {
    const input = { '"@@function"': 'vectorTableSource' };
    const result = sanitizeMalformedKeys(input);
    expect(result).toEqual({ '@@function': 'vectorTableSource' });
  });

  it('leaves valid @@ keys unchanged', () => {
    const input = { '@@type': 'H3TileLayer', '@@function': 'h3TableSource' };
    const result = sanitizeMalformedKeys(input);
    expect(result).toEqual({ '@@type': 'H3TileLayer', '@@function': 'h3TableSource' });
  });

  it('sanitizes keys recursively in nested objects', () => {
    const input = {
      layers: {
        "'@@type'": 'VectorTileLayer',
        data: {
          "'@@function'": 'vectorTableSource',
        },
      },
    };
    const result = sanitizeMalformedKeys(input) as Record<string, unknown>;
    const layers = result.layers as Record<string, unknown>;
    expect(layers['@@type']).toBe('VectorTileLayer');
    const data = layers.data as Record<string, unknown>;
    expect(data['@@function']).toBe('vectorTableSource');
  });

  it('sanitizes keys inside arrays', () => {
    const input = [{ "'@@type'": 'VectorTileLayer' }, { "'@@type'": 'H3TileLayer' }];
    const result = sanitizeMalformedKeys(input) as Record<string, unknown>[];
    expect(result[0]['@@type']).toBe('VectorTileLayer');
    expect(result[1]['@@type']).toBe('H3TileLayer');
  });

  it('handles deeply nested objects (3+ levels)', () => {
    const input = {
      a: {
        b: {
          c: {
            "'@@type'": 'deep',
          },
        },
      },
    };
    const result = sanitizeMalformedKeys(input) as any;
    expect(result.a.b.c['@@type']).toBe('deep');
  });

  it('fixes malformed @@ references in string values with double quotes', () => {
    const input = `{"'@@type'": "VectorTileLayer"}`;
    const result = sanitizeMalformedKeys(input);
    expect(result).toBe(`{"@@type": "VectorTileLayer"}`);
  });

  it('fixes malformed @@ references in string values with single quotes', () => {
    const input = "the type is '@@type' here";
    const result = sanitizeMalformedKeys(input);
    expect(result).toBe('the type is "@@type" here');
  });

  it('leaves normal non-@@ keys untouched', () => {
    const input = { name: 'test', count: 5 };
    const result = sanitizeMalformedKeys(input);
    expect(result).toEqual({ name: 'test', count: 5 });
  });

  it('handles mixed valid and malformed keys', () => {
    const input = {
      '@@type': 'VectorTileLayer',
      "'@@function'": 'vectorTableSource',
      name: 'my-layer',
    };
    const result = sanitizeMalformedKeys(input) as Record<string, unknown>;
    expect(result['@@type']).toBe('VectorTileLayer');
    expect(result['@@function']).toBe('vectorTableSource');
    expect(result.name).toBe('my-layer');
  });

  it('handles arrays of primitives', () => {
    expect(sanitizeMalformedKeys([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    expect(sanitizeMalformedKeys([])).toEqual([]);
  });
});

// ─── stripCredentials ───────────────────────────────────────

describe('stripCredentials', () => {
  it('passes through null', () => {
    expect(stripCredentials(null)).toBeNull();
  });

  it('passes through undefined', () => {
    expect(stripCredentials(undefined)).toBeUndefined();
  });

  it('passes through primitives', () => {
    expect(stripCredentials(42)).toBe(42);
    expect(stripCredentials('hello')).toBe('hello');
    expect(stripCredentials(true)).toBe(true);
  });

  it('strips accessToken from flat object', () => {
    const input = { accessToken: 'secret', name: 'test' };
    expect(stripCredentials(input)).toEqual({ name: 'test' });
  });

  it('strips apiBaseUrl from flat object', () => {
    const input = { apiBaseUrl: 'https://api.example.com', visible: true };
    expect(stripCredentials(input)).toEqual({ visible: true });
  });

  it('strips connectionName from flat object', () => {
    const input = { connectionName: 'carto_dw', data: 'ok' };
    expect(stripCredentials(input)).toEqual({ data: 'ok' });
  });

  it('strips connection from flat object', () => {
    const input = { connection: 'conn_string', id: 1 };
    expect(stripCredentials(input)).toEqual({ id: 1 });
  });

  it('strips all credential fields at once', () => {
    const input = {
      accessToken: 'tok',
      apiBaseUrl: 'url',
      connectionName: 'cn',
      connection: 'conn',
      safe: 'keep',
    };
    expect(stripCredentials(input)).toEqual({ safe: 'keep' });
  });

  it('strips credentials recursively in nested objects', () => {
    const input = {
      layer: {
        data: {
          accessToken: 'secret',
          tableName: 'my_table',
        },
      },
    };
    const result = stripCredentials(input) as any;
    expect(result.layer.data.accessToken).toBeUndefined();
    expect(result.layer.data.tableName).toBe('my_table');
  });

  it('strips credentials inside arrays', () => {
    const input = [
      { accessToken: 'tok1', name: 'a' },
      { accessToken: 'tok2', name: 'b' },
    ];
    const result = stripCredentials(input) as any[];
    expect(result[0]).toEqual({ name: 'a' });
    expect(result[1]).toEqual({ name: 'b' });
  });

  it('returns empty object when all keys are credentials', () => {
    const input = {
      accessToken: 'tok',
      apiBaseUrl: 'url',
      connectionName: 'cn',
      connection: 'conn',
    };
    expect(stripCredentials(input)).toEqual({});
  });

  it('handles empty object', () => {
    expect(stripCredentials({})).toEqual({});
  });

  it('handles empty array', () => {
    expect(stripCredentials([])).toEqual([]);
  });
});
