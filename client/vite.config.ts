import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsInlineLimit: 0 // Prevent inlining large files
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@js': resolve(__dirname, './js')
    },
    extensions: ['.js', '.ts']
  },
  publicDir: 'public' // Ensure public directory is copied to output
}); 