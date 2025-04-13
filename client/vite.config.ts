import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // Use relative paths for all assets
  build: {
    outDir: 'dist',
    sourcemap: true,
    assetsInlineLimit: 0, // Prevent inlining large files
    rollupOptions: {
      output: {
        // Ensure assets are in a predictable location
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@js': resolve(__dirname, './js')
    },
    extensions: ['.js', '.ts']
  },
  publicDir: 'public', // Ensure public directory is copied to output
  // Ensure proper CORS headers during development
  server: {
    headers: {
      'Access-Control-Allow-Origin': '*'
    }
  }
}); 