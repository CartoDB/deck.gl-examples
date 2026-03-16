/**
 * Utility functions for data sanitization
 *
 * Pure functions with no SDK dependencies, extracted for reuse.
 */

/**
 * Credential fields to strip from data sent to frontend
 * These are sensitive and should never be transmitted over WebSocket
 */
const CREDENTIAL_FIELDS = ['accessToken', 'apiBaseUrl', 'connectionName', 'connection'];

/**
 * Pattern to detect malformed keys with extra quotes around @@ prefixes
 * Gemini sometimes generates keys like "'@@type'" instead of "@@type"
 */
const MALFORMED_KEY_PATTERN = /^['"]?(@@[^'"]+)['"]?$/;

/**
 * Sanitize malformed object keys that Gemini may generate
 * Fixes keys like "'@@type'" → "@@type" and "'@@function'" → "@@function"
 */
export const sanitizeMalformedKeys = (data: unknown): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeMalformedKeys);
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      // Fix malformed keys with extra quotes around @@ prefixes
      const match = key.match(MALFORMED_KEY_PATTERN);
      const cleanKey = match ? match[1] : key;
      result[cleanKey] = sanitizeMalformedKeys(value);
    }
    return result;
  }

  // Handle string values that might contain malformed JSON
  if (typeof data === 'string') {
    // Fix malformed keys in JSON strings (e.g., "'@@type'" → "@@type")
    return data
      .replace(/"'@@([^']+)'"/g, '"@@$1"')
      .replace(/'@@([^']+)'/g, '"@@$1"');
  }

  return data;
};

/**
 * Recursively strip credential fields from data before sending to frontend
 * This ensures sensitive information is never transmitted over WebSocket
 */
export const stripCredentials = (data: unknown): unknown => {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(stripCredentials);
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!CREDENTIAL_FIELDS.includes(key)) {
        result[key] = stripCredentials(value);
      }
    }
    return result;
  }

  return data;
};
