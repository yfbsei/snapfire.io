import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        port: 3000,
        open: true,
        headers: {
            // Required for SharedArrayBuffer (needed by some BabylonJS features)
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    build: {
        target: 'esnext',
        minify: 'terser',
        sourcemap: true,
    },
    optimizeDeps: {
        exclude: ['@babylonjs/core', '@babylonjs/materials', '@babylonjs/loaders'],
    },
});
