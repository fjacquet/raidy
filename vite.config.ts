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
        manualChunks: {
          // React core
          'vendor-react': ['react', 'react-dom'],
          // PDF export (lazy-loaded, large but acceptable)
          // Note: html2canvas removed - it's an optionalDependency of jspdf for the html() method,
          // but we only use autoTable and text methods, so it's unnecessary overhead
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          // State management
          'vendor-state': ['zustand'],
        },
      },
    },
  },
})
