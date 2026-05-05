import { defineConfig } from 'vite';

// Base path is set explicitly per deploy target via the BASE_PATH env var.
// GitHub Pages serves at /geometer/ (set by .github/workflows/pages.yml);
// every other context — local dev, CI preview deploys at the workers.dev
// subdomain root — uses /.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [],
  server: {
    host: true,
  },
});
