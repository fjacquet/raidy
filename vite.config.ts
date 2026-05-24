import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Base path for GitHub Pages deployment (https://fjacquet.github.io/raidy/)
  base: '/raidy/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@engines': resolve(__dirname, './src/engines'),
      '@components': resolve(__dirname, './src/components'),
      '@store': resolve(__dirname, './src/store'),
      '@types': resolve(__dirname, './src/types'),
      '@utils': resolve(__dirname, './src/utils'),
      '@data': resolve(__dirname, './src/data'),
      '@hooks': resolve(__dirname, './src/hooks'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    // PDF export libs are inherently large (~600KB), raise limit to suppress warning
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Function form: Vite 8 / Rollup tightened the OutputOptions union so the
        // static-object form of manualChunks no longer type-checks under `tsc -b`
        // (TS picks the ManualChunksFunction overload and rejects the object
        // literal). Path-based routing also avoids a brittle exact-name list.
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          // PDF export (lazy-loaded, large but acceptable). Matches jspdf and
          // jspdf-autotable. html2canvas stays separate (optional jspdf dep we
          // don't use via html()).
          if (id.includes('node_modules/jspdf')) return 'vendor-pdf'
          // State management
          if (id.includes('node_modules/zustand')) return 'vendor-state'
          return undefined
        },
      },
    },
  },
})
