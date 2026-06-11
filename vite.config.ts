import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: './web/client',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: '../../dist-web/client',
    emptyOutDir: true,
  },
});
