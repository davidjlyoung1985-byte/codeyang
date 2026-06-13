import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './web/client',
  server: {
    port: 5173,
    host: '0.0.0.0',
    open: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../../dist-web/client',
    emptyOutDir: true,
  },
});
