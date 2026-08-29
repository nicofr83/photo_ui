import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Every top-level path the backend answers on (no `/api` prefix — see
// docs/api-contract.md). Proxied in dev so the browser sees one origin:
// the API client's relative fetches AND the raw `<img src={thumbUrl}>` /
// `renderUrl` from `/photos` responses both resolve through here. Without
// this, a cross-origin VITE_API_BASE_URL trips CORS on every fetch (the
// real backend sends no Access-Control-Allow-Origin) and thumbUrl/renderUrl
// — always relative, never prefixed with the API base — 404 against the
// Vite server instead of reaching the backend.
const API_PREFIXES = [
  'system',
  'photos',
  'albums',
  'documents',
  'pages',
  'texts',
  'tasks',
  'ref',
  'corrections',
  'jobs',
];

const backend = { target: 'http://127.0.0.1:4310', changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(API_PREFIXES.map((prefix) => [`/${prefix}`, backend])),
      // `/images/:slug` is ALSO this app's own route (the task images
      // screen — router.tsx) — a plain `/images` prefix would swallow that
      // page's own navigation request before Vite's SPA fallback ever sees
      // it. A leading `^` makes Vite treat the key as a regex (its proxy
      // middleware convention), so only the backend's sha256-shaped asset
      // paths (`/images/:sha256/thumb|render`) are forwarded.
      '^/images/[0-9a-f]{64}/(thumb|render)': backend,
    },
  },
});
