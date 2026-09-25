import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const claudeKey = env.CLAUDE_API_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@gci/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
        '@gci/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
        '@gci/module-trade': path.resolve(__dirname, '../../modules/trade'),
        '@gci/module-crm': path.resolve(__dirname, '../../modules/crm'),
        '@gci/module-quotation': path.resolve(__dirname, '../../modules/quotation'),
      },
    },
    // Gemini is NOT injected: all Gemini calls go through the server-side
    // /api/ai/gemini-generate proxy (apps/shell/src/lib/geminiProxy.ts).
    // CRM's claudeService.ts still reads CLAUDE_API_KEY in the browser.
    define: {
      'process.env.CLAUDE_API_KEY': JSON.stringify(claudeKey),
    },
    server: {
      proxy: {
        // Local dev only: these modules' /api/* calls hit Vercel Edge
        // functions, which don't run under plain `vite dev`. Proxy to the
        // still-live standalone deployments until each module's own
        // api/* routes are deployed with this monorepo.
        '/api/trade': {
          target: 'https://app.globalcareinfo.com',
          changeOrigin: true,
        },
        '/api/crm': {
          target: 'https://app.globalcareinfo.com',
          changeOrigin: true,
        },
      },
    },
    root: __dirname,
    build: {
      outDir: 'dist',
    },
  }
})
