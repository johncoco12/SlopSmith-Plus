import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue({
    ...templateCompilerOptions,
  })],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/api':    { target: 'http://localhost:5001', changeOrigin: true },
      '/ws':     { target: 'ws://localhost:5001', ws: true },
      '/static': { target: 'http://localhost:5001', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
