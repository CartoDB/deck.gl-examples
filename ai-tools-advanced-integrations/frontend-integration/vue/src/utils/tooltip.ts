/**
 * Tooltip Utilities
 *
 * Provides tooltip content generation for deck.gl layers.
 * Automatically filters technical columns and shows top 5 relevant properties.
 */

import type { PickingInfo } from '@deck.gl/core';

const EXCLUDED_COLUMNS = new Set([
  'geom', 'geometry', 'the_geom', 'the_geom_webmercator', 'shape', 'wkb_geometry', 'geo',
  'id', 'osm_id', 'cartodb_id', 'ogc_fid', 'gid', 'fid', 'objectid', 'globalid', 'geoid',
  'h3', 'quadbin', 'geohash',
  'created_at', 'updated_at', 'row_number', '_carto_feature_id',
  'map_marker', 'all_tags',
]);

const PRIORITY_COLUMNS = [
  'name', 'title', 'label', 'description', 'group_name', 'subgroup_name',
  'category', 'type', 'address', 'city', 'state_name', 'state',
  'country_name', 'country', 'population', 'total_pop', 'pop_max',
];

const COLUMN_LABELS: Record<string, string> = {
  group_name: 'Category',
  subgroup_name: 'Subcategory',
  state_name: 'State',
  country_name: 'Country',
  total_pop: 'Population',
  pop_max: 'Population',
  pop_min: 'Min Population',
  hh_med_inc: 'Median Income',
  unemp_rate: 'Unemployment',
  sq_mi: 'Area (sq mi)',
  pers_sq_mi: 'Density',
  adm0name: 'Country',
  adm1name: 'State/Province',
  megacity: 'Megacity',
  worldcity: 'World City',
  urbanity: 'Urbanity',
  elevation: 'Elevation',
  scalerank: 'Scale Rank',
};

const MAX_PROPERTIES = 5;
const MAX_VALUE_LENGTH = 50;

const isExcludedColumn = (key: string): boolean => {
  const lowerKey = key.toLowerCase();
  return EXCLUDED_COLUMNS.has(lowerKey) || EXCLUDED_COLUMNS.has(key);
};

const getColumnPriority = (key: string): number => {
  const lowerKey = key.toLowerCase();
  const index = PRIORITY_COLUMNS.findIndex((col) => col.toLowerCase() === lowerKey);
  return index === -1 ? PRIORITY_COLUMNS.length + 1 : index;
};

const getColumnLabel = (key: string): string => {
  if (COLUMN_LABELS[key]) {
    return COLUMN_LABELS[key];
  }
  const lowerKey = key.toLowerCase();
  for (const [labelKey, label] of Object.entries(COLUMN_LABELS)) {
    if (labelKey.toLowerCase() === lowerKey) {
      return label;
    }
  }
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return value.toLocaleString();
    }
    if (!Number.isInteger(value)) {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    return value.toString();
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'string') {
    if (value.length > MAX_VALUE_LENGTH) {
      return value.substring(0, MAX_VALUE_LENGTH - 3) + '...';
    }
    return value;
  }

  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    if (str.length > MAX_VALUE_LENGTH) {
      return str.substring(0, MAX_VALUE_LENGTH - 3) + '...';
    }
    return str;
  }

  return String(value);
};

const extractProperties = (object: Record<string, unknown>): Record<string, unknown> => {
  if (object.properties && typeof object.properties === 'object') {
    return object.properties as Record<string, unknown>;
  }
  return object;
};

const getTooltipProperties = (
  properties: Record<string, unknown>
): Array<{ key: string; label: string; value: string }> => {
  const entries = Object.entries(properties)
    .filter(([key, value]) => {
      if (isExcludedColumn(key)) return false;
      if (value === null || value === undefined) return false;
      if (value === '') return false;
      return true;
    })
    .map(([key, value]) => ({
      key,
      label: getColumnLabel(key),
      value: formatValue(value),
      priority: getColumnPriority(key),
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_PROPERTIES);

  return entries.map(({ key, label, value }) => ({ key, label, value }));
};

export const getTooltipContent = (
  info: PickingInfo
): { html: string; className: string } | null => {
  if (!info.picked || !info.object) {
    return null;
  }

  const properties = extractProperties(info.object as Record<string, unknown>);
  const tooltipProps = getTooltipProperties(properties);

  if (tooltipProps.length === 0) {
    return null;
  }

  const nameValue = properties['name'] || properties['title'] || properties['label'];
  const hasTitle = nameValue && typeof nameValue === 'string';

  let html = '';

  if (hasTitle) {
    html += `<div class="tooltip-title">${formatValue(nameValue)}</div>`;
    const filteredProps = tooltipProps.filter(
      (p) => !['name', 'title', 'label'].includes(p.key.toLowerCase())
    );
    for (const prop of filteredProps) {
      html += `<div class="tooltip-row">
        <span class="tooltip-key">${prop.label}</span>
        <span class="tooltip-value">${prop.value}</span>
      </div>`;
    }
  } else {
    for (const prop of tooltipProps) {
      html += `<div class="tooltip-row">
        <span class="tooltip-key">${prop.label}</span>
        <span class="tooltip-value">${prop.value}</span>
      </div>`;
    }
  }

  return { html, className: 'deck-tooltip' };
};
