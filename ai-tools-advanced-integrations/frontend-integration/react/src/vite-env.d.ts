/// <reference types="vite/client" />

declare module 'cartocolor';

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_ACCESS_TOKEN: string;
  readonly VITE_CONNECTION_NAME: string;
  readonly VITE_USE_HTTP: string;
  readonly VITE_WS_URL: string;
  readonly VITE_HTTP_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
