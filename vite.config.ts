import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const here = fileURLToPath(new URL('.', import.meta.url));

// Base path is set explicitly per deploy target via the BASE_PATH env var.
// GitHub Pages serves at /geometer/ (set by .github/workflows/pages.yml);
// every other context — local dev, CI preview deploys at the workers.dev
// subdomain root — uses /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [],
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
    },
  },
  server: {
    host: true,
  },
});
