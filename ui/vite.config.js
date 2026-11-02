import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:4517', changeOrigin: false } }
  }
})
