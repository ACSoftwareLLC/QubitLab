import { defineConfig } from 'vitest/config'
import { configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig({
  ...viteConfig,
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
