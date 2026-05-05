import { defineConfig } from 'vite';

// On GitHub Pages the site is served at
// https://skylinetrailcomputing.github.io/geometer/, so static asset paths
// need /geometer/ as the base. Locally and on Cloudflare Workers (served
// at the project subdomain root), serve from /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/geometer/' : '/',
  plugins: [],
  server: {
    host: true,
  },
});
