import { defineConfig } from 'vite';

// On GitHub Pages the site is served at
// https://skylinetrailcomputing.github.io/geometer/, so static asset paths
// need /geometer/ as the base. Locally, serve from /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/geometer/' : '/',
  server: {
    host: true,
  },
});
