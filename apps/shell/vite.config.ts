import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@gci/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@gci/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
    },
  },
  root: __dirname,
  build: {
    outDir: 'dist',
  },
})
