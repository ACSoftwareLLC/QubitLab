import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Dev-only: proxy /auth calls to the local Wrangler Worker so HMR works
    // while the API runs on the Worker runtime. This proxy is not used in the
    // production build, which is served entirely from the same-origin Worker.
    proxy: {
      '/auth': 'http://localhost:8787',
    },
  },
})
