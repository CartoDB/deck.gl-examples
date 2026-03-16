import { describe, it, expect } from 'vitest';
import { convertJsonSchemaToZod, sanitizeMCPToolName } from '../../../src/services/mcp-client.js';

// ─── convertJsonSchemaToZod ─────────────────────────────────

describe('convertJsonSchemaToZod', () => {
  it('returns empty z.object for null', () => {
    const schema = convertJsonSchemaToZod(null);
    expect(schema.parse({})).toEqual({});
  });

  it('returns empty z.object for undefined', () => {
    const schema = convertJsonSchemaToZod(undefined);
    expect(schema.parse({})).toEqual({});
  });

  it('returns empty z.object when no properties', () => {
    const schema = convertJsonSchemaToZod({ type: 'object' });
    expect(schema.parse({})).toEqual({});
  });

  it('maps string type', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    expect(schema.parse({ name: 'hello' })).toEqual({ name: 'hello' });
  });

  it('maps number type', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
    });
    expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
  });

  it('maps integer type to z.number', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { age: { type: 'integer' } },
      required: ['age'],
    });
    expect(schema.parse({ age: 25 })).toEqual({ age: 25 });
  });

  it('maps boolean type', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { active: { type: 'boolean' } },
      required: ['active'],
    });
    expect(schema.parse({ active: true })).toEqual({ active: true });
  });

  it('maps array type', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { items: { type: 'array' } },
      required: ['items'],
    });
    expect(schema.parse({ items: [1, 'a'] })).toEqual({ items: [1, 'a'] });
  });

  it('maps object type to z.record', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { meta: { type: 'object' } },
      required: ['meta'],
    });
    expect(schema.parse({ meta: { a: 1 } })).toEqual({ meta: { a: 1 } });
  });

  it('makes non-required fields optional', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: {
        required_field: { type: 'string' },
        optional_field: { type: 'string' },
      },
      required: ['required_field'],
    });
    // Should parse without optional_field
    expect(schema.parse({ required_field: 'yes' })).toEqual({ required_field: 'yes' });
  });

  it('preserves descriptions on fields', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name' },
      },
      required: ['name'],
    });
    // Just verify parsing works; description is metadata
    expect(schema.parse({ name: 'test' })).toEqual({ name: 'test' });
  });

  it('falls back to z.unknown for unknown types', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: {
        weird: { type: 'custom_type' },
      },
      required: ['weird'],
    });
    // z.unknown accepts anything
    expect(schema.parse({ weird: 'anything' })).toEqual({ weird: 'anything' });
  });

  it('handles empty required array', () => {
    const schema = convertJsonSchemaToZod({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: [],
    });
    // All fields should be optional
    expect(schema.parse({})).toEqual({});
  });
});

// ─── sanitizeMCPToolName ────────────────────────────────────

describe('sanitizeMCPToolName', () => {
  it('passes through alphanumeric names', () => {
    expect(sanitizeMCPToolName('myTool123')).toBe('myTool123');
  });

  it('preserves hyphens', () => {
    expect(sanitizeMCPToolName('my-tool')).toBe('my-tool');
  });

  it('preserves underscores', () => {
    expect(sanitizeMCPToolName('my_tool')).toBe('my_tool');
  });

  it('replaces dots with underscores', () => {
    expect(sanitizeMCPToolName('carto.run_query')).toBe('carto_run_query');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeMCPToolName('my tool name')).toBe('my_tool_name');
  });

  it('replaces special chars with underscores', () => {
    expect(sanitizeMCPToolName('tool@v2!beta')).toBe('tool_v2_beta');
  });
});
