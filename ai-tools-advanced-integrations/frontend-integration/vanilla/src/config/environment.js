/**
 * Environment Configuration
 *
 * Reads VITE_ prefixed environment variables from .env file.
 */

export const environment = {
  production: false,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'https://gcp-us-east1.api.carto.com',
  accessToken: import.meta.env.VITE_API_ACCESS_TOKEN || '',
  connectionName: import.meta.env.VITE_CONNECTION_NAME || 'carto_dw',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3003/ws',
  httpApiUrl: import.meta.env.VITE_HTTP_API_URL || 'http://localhost:3003/api/chat',
  useHttp: import.meta.env.VITE_USE_HTTP === 'true',
};
