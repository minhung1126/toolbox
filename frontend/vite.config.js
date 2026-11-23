import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Playwright fixtures fulfill API requests. Preview must never forward a miss to localhost:8000.
  preview: mode === 'playwright' ? { proxy: {} } : undefined,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('jszip')) {
              return 'jszip';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
          }
        },
      },
    },
  },
}));
