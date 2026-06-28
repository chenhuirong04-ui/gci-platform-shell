import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const geminiKey = env.GEMINI_API_KEY || env.VITE_API_KEY || ''
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
    // Trade/CRM modules' services read these process.env vars as fallbacks
    // (geminiService.ts in both, claudeService.ts in CRM) — same defines
    // each used standalone, kept for parity during migration.
    define: {
      'process.env.API_KEY': JSON.stringify(geminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      'process.env.CLAUDE_API_KEY': JSON.stringify(claudeKey),
    },
    server: {
      proxy: {
        // Local dev only: these modules' /api/* calls hit Vercel Edge
        // functions, which don't run under plain `vite dev`. Proxy to the
        // still-live standalone deployments until each module's own
        // api/* routes are deployed with this monorepo.
        '/api/trade': {
          target: 'https://trade.globalcareinfo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/trade/, '/api'),
        },
        '/api/crm': {
          target: 'https://leads.globalcareinfo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/crm/, '/api'),
        },
      },
    },
    root: __dirname,
    build: {
      outDir: 'dist',
    },
  }
})
