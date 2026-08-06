import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
  server: {
    proxy: {
      // Simulation runs locally in WASM; only the auth server is proxied.
      '/auth': 'http://localhost:3000',
    },
  },
})
