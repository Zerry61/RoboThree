import vue from '@vitejs/plugin-vue2';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  build: {
    target: 'es2022',
    outDir: mode === 'integration' ? 'dist-integration' : 'dist',
    rollupOptions: {
      input: mode === 'integration' ? 'integration.html' : 'index.html'
    }
  }
}));
