import { defineConfig } from 'vite';

console.log('\n\n=============================================');
console.log('SERVER CONSOLE: Game Engine Dev Server Active');
console.log('=============================================\n\n');

export default defineConfig({
  root: 'game',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: '../dist',
    assetsDir: 'assets'
  },
  resolve: {
    alias: {
      '@engine': '/src'
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      // Disable optimizing problematic deps
      external: ['three-gpu-pathtracer']
    }
  }
});
