/**
 * Tooltip Utilities
 *
 * Provides tooltip content generation for deck.gl layers.
 * Automatically filters technical columns and shows top 5 relevant properties.
 */

import type { PickingInfo } from '@deck.gl/core';

/**
 * Columns to exclude from tooltip display.
 * These are typically technical/internal columns that users don't need to see.
 */
const EXCLUDED_COLUMNS = new Set([
  // Geometry columns
  'geom',
  'geometry',
  'the_geom',
  'the_geom_webmercator',
  'shape',
  'wkb_geometry',
  'geo',
  // ID columns
  'id',
  'osm_id',
  'cartodb_id',
  'ogc_fid',
  'gid',
  'fid',
  'objectid',
  'globalid',
  'geoid',
  // Spatial index columns
  'h3',
  'quadbin',
  'geohash',
  // Internal columns
  'created_at',
  'updated_at',
  'row_number',
  '_carto_feature_id',
  // Map marker (usually internal)
  'map_marker',
  'all_tags',
]);

/**
 * Priority columns that should appear first in tooltips.
 * These are typically the most useful columns for users.
 */
const PRIORITY_COLUMNS = [
  'name',
  'title',
  'label',
  'description',
  'group_name',
  'subgroup_name',
  'category',
  'type',
  'address',
  'city',
  'state_name',
  'state',
  'country_name',
  'country',
  'population',
  'total_pop',
  'pop_max',
];

/**
 * Human-readable labels for common column names.
 */
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

/**
 * Maximum number of properties to show in tooltip.
 */
const MAX_PROPERTIES = 5;

/**
 * Maximum length for string values before truncation.
 */
const MAX_VALUE_LENGTH = 50;

/**
 * Check if a column should be excluded from the tooltip.
 */
const isExcludedColumn = (key: string): boolean => {
  const lowerKey = key.toLowerCase();
  return EXCLUDED_COLUMNS.has(lowerKey) || EXCLUDED_COLUMNS.has(key);
};

/**
 * Get priority score for a column (lower is higher priority).
 */
const getColumnPriority = (key: string): number => {
  const lowerKey = key.toLowerCase();
  const index = PRIORITY_COLUMNS.findIndex(
    (col) => col.toLowerCase() === lowerKey
  );
  return index === -1 ? PRIORITY_COLUMNS.length + 1 : index;
};

/**
 * Get human-readable label for a column.
 */
const getColumnLabel = (key: string): string => {
  // Check for exact match in labels
  if (COLUMN_LABELS[key]) {
    return COLUMN_LABELS[key];
  }

  // Check for lowercase match
  const lowerKey = key.toLowerCase();
  for (const [labelKey, label] of Object.entries(COLUMN_LABELS)) {
    if (labelKey.toLowerCase() === lowerKey) {
      return label;
    }
  }

  // Convert snake_case or camelCase to Title Case
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
};

/**
 * Format a value for display in the tooltip.
 */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'number') {
    // Format large numbers with commas
    if (Number.isInteger(value) && Math.abs(value) >= 1000) {
      return value.toLocaleString();
    }
    // Format decimals to 2 places
    if (!Number.isInteger(value)) {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > MAX_VALUE_LENGTH) {
      return value.substring(0, MAX_VALUE_LENGTH - 3) + '...';
    }
    return value;
  }

  // For arrays or objects, stringify
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    if (str.length > MAX_VALUE_LENGTH) {
      return str.substring(0, MAX_VALUE_LENGTH - 3) + '...';
    }
    return str;
  }

  return String(value);
};

/**
 * Extract properties from a picked object.
 * Handles both direct properties and nested properties object.
 */
const extractProperties = (
  object: Record<string, unknown>
): Record<string, unknown> => {
  // CARTO tiles typically have properties nested
  if (object.properties && typeof object.properties === 'object') {
    return object.properties as Record<string, unknown>;
  }
  // Direct properties on the object
  return object;
};

/**
 * Get filtered and sorted properties for tooltip display.
 */
const getTooltipProperties = (
  properties: Record<string, unknown>
): Array<{ key: string; label: string; value: string }> => {
  const entries = Object.entries(properties)
    .filter(([key, value]) => {
      // Exclude technical columns
      if (isExcludedColumn(key)) return false;
      // Exclude null/undefined values
      if (value === null || value === undefined) return false;
      // Exclude empty strings
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

/**
 * Generate tooltip HTML content from PickingInfo.
 *
 * @param info - The PickingInfo object from deck.gl picking
 * @returns Tooltip configuration object or null if no tooltip should be shown
 */
export const getTooltipContent = (
  info: PickingInfo
): { html: string; className: string } | null => {
  if (!info.picked || !info.object) {
    return null;
  }

  const properties = extractProperties(
    info.object as Record<string, unknown>
  );
  const tooltipProps = getTooltipProperties(properties);

  if (tooltipProps.length === 0) {
    return null;
  }

  // Check if there's a name/title to use as header
  const nameValue =
    properties['name'] || properties['title'] || properties['label'];
  const hasTitle = nameValue && typeof nameValue === 'string';

  // Build HTML
  let html = '';

  if (hasTitle) {
    html += `<div class="tooltip-title">${formatValue(nameValue)}</div>`;
    // Filter out the name from properties since it's in the title
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
    // No title, just show all properties
    for (const prop of tooltipProps) {
      html += `<div class="tooltip-row">
        <span class="tooltip-key">${prop.label}</span>
        <span class="tooltip-value">${prop.value}</span>
      </div>`;
    }
  }

  return {
    html,
    className: 'deck-tooltip',
  };
};
