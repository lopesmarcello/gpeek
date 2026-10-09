import { defineConfig } from 'vite';
export default defineConfig({
  resolve: { conditions: ['development'] },
  build: { target: 'es2023', sourcemap: false },
});
