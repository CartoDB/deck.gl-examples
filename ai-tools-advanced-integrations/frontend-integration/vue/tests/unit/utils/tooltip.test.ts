import { describe, it, expect, vi } from 'vitest';

vi.mock('@deck.gl/core', () => ({}));

import { getTooltipContent } from '../../../src/utils/tooltip';

const mockInfo = (picked: boolean, object?: Record<string, unknown>) =>
  ({ picked, object }) as any;

describe('getTooltipContent', () => {
  describe('null/empty cases', () => {
    it('returns null when picked is false', () => {
      expect(getTooltipContent(mockInfo(false, { name: 'test' }))).toBeNull();
    });

    it('returns null when object is undefined', () => {
      expect(getTooltipContent(mockInfo(true, undefined))).toBeNull();
    });

    it('returns null when object has only excluded columns', () => {
      expect(getTooltipContent(mockInfo(true, { geom: 'POINT(0 0)', id: 1, h3: 'abc' }))).toBeNull();
    });

    it('returns null when all values are null/undefined/empty', () => {
      expect(getTooltipContent(mockInfo(true, { city: null, state: undefined, country: '' }))).toBeNull();
    });
  });

  describe('property extraction', () => {
    it('extracts from nested properties object', () => {
      const result = getTooltipContent(mockInfo(true, { properties: { name: 'Test', city: 'NYC' } }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Test');
      expect(result!.html).toContain('NYC');
    });

    it('extracts from direct flat properties', () => {
      const result = getTooltipContent(mockInfo(true, { name: 'Test', city: 'NYC' }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Test');
      expect(result!.html).toContain('NYC');
    });
  });

  describe('column filtering', () => {
    it('excludes geometry columns', () => {
      const result = getTooltipContent(mockInfo(true, {
        geom: 'POINT(0 0)', the_geom: 'data', shape: 'polygon',
        city: 'Madrid',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).not.toContain('geom');
      expect(result!.html).not.toContain('the_geom');
      expect(result!.html).toContain('Madrid');
    });

    it('excludes ID columns', () => {
      const result = getTooltipContent(mockInfo(true, {
        id: 123, cartodb_id: 456, objectid: 789,
        city: 'Barcelona',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Barcelona');
    });

    it('excludes spatial index columns', () => {
      const result = getTooltipContent(mockInfo(true, {
        h3: '8a123', quadbin: '456', geohash: 'xyz',
        category: 'Park',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Park');
    });

    it('excludes internal columns', () => {
      const result = getTooltipContent(mockInfo(true, {
        created_at: '2024-01-01', _carto_feature_id: 'abc',
        city: 'London',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('London');
    });
  });

  describe('priority and labeling', () => {
    it('shows name as tooltip-title', () => {
      const result = getTooltipContent(mockInfo(true, {
        name: 'Central Park', category: 'Park', city: 'New York',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('tooltip-title');
      expect(result!.html).toContain('Central Park');
    });

    it('falls back to title when name is not present', () => {
      const result = getTooltipContent(mockInfo(true, {
        title: 'My Title', category: 'Info',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('tooltip-title');
      expect(result!.html).toContain('My Title');
    });

    it('falls back to label when neither name nor title present', () => {
      const result = getTooltipContent(mockInfo(true, {
        label: 'My Label', category: 'Info',
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('tooltip-title');
      expect(result!.html).toContain('My Label');
    });

    it('shows priority columns first', () => {
      const result = getTooltipContent(mockInfo(true, {
        random_field: 'last', name: 'First', category: 'Second',
      }));
      expect(result).not.toBeNull();
      const html = result!.html;
      const nameIdx = html.indexOf('First');
      const catIdx = html.indexOf('Second');
      expect(nameIdx).toBeLessThan(catIdx);
    });

    it('uses human-readable labels', () => {
      const result = getTooltipContent(mockInfo(true, {
        group_name: 'Finance', total_pop: 50000,
      }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Category');
      expect(result!.html).toContain('Population');
    });
  });

  describe('value formatting', () => {
    it('formats large integers with separator', () => {
      const result = getTooltipContent(mockInfo(true, { population: 1000000 }));
      expect(result).not.toBeNull();
      expect(result!.html).toMatch(/1[,.]000[,.]000/);
    });

    it('formats decimals to max 2 places', () => {
      const result = getTooltipContent(mockInfo(true, { rate: 3.14159 }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('3.14');
      expect(result!.html).not.toContain('3.14159');
    });

    it('formats booleans as Yes/No', () => {
      const resultTrue = getTooltipContent(mockInfo(true, { active: true }));
      expect(resultTrue).not.toBeNull();
      expect(resultTrue!.html).toContain('Yes');

      const resultFalse = getTooltipContent(mockInfo(true, { active: false }));
      expect(resultFalse).not.toBeNull();
      expect(resultFalse!.html).toContain('No');
    });

    it('handles null values', () => {
      const result = getTooltipContent(mockInfo(true, { city: 'NYC', value: null }));
      expect(result).not.toBeNull();
    });

    it('truncates strings longer than 50 chars', () => {
      const longString = 'A'.repeat(60);
      const result = getTooltipContent(mockInfo(true, { description: longString }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('...');
      expect(result!.html).not.toContain(longString);
    });

    it('stringifies objects', () => {
      const result = getTooltipContent(mockInfo(true, { metadata: { key: 'val' } }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('key');
    });
  });

  describe('limits and output', () => {
    it('shows maximum 5 properties', () => {
      const result = getTooltipContent(mockInfo(true, {
        col1: 'a', col2: 'b', col3: 'c', col4: 'd', col5: 'e', col6: 'f', col7: 'g',
      }));
      expect(result).not.toBeNull();
      const rowMatches = result!.html.match(/tooltip-row/g);
      expect(rowMatches!.length).toBeLessThanOrEqual(5);
    });

    it('returns className deck-tooltip', () => {
      const result = getTooltipContent(mockInfo(true, { city: 'Test' }));
      expect(result).not.toBeNull();
      expect(result!.className).toBe('deck-tooltip');
    });

    it('converts snake_case to Title Case', () => {
      const result = getTooltipContent(mockInfo(true, { some_property: 'value' }));
      expect(result).not.toBeNull();
      expect(result!.html).toContain('Some property');
    });
  });
});
