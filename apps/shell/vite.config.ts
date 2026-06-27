import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const geminiKey = env.GEMINI_API_KEY || env.VITE_API_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@gci/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
        '@gci/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
        '@gci/module-trade': path.resolve(__dirname, '../../modules/trade'),
      },
    },
    // Trade module's services read process.env.API_KEY as a fallback
    // (see modules/trade/services/geminiService.ts) — same define Trade OS
    // used standalone, kept for parity during migration.
    define: {
      'process.env.API_KEY': JSON.stringify(geminiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    server: {
      proxy: {
        // Local dev only: Trade module's /api/trade/* calls Vercel Edge
        // functions, which don't run under plain `vite dev`. Proxy to the
        // still-live standalone Trade OS deployment until this module's
        // own api/trade/* routes are deployed with this monorepo.
        '/api/trade': {
          target: 'https://trade.globalcareinfo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/trade/, '/api'),
        },
      },
    },
    root: __dirname,
    build: {
      outDir: 'dist',
    },
  }
})
