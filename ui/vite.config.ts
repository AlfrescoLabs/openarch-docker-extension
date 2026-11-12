import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Docker Desktop loads the UI from files, so asset paths must be relative.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __EXTENSION_VERSION__: JSON.stringify(process.env.EXTENSION_VERSION ?? '0.0.0-dev'),
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
