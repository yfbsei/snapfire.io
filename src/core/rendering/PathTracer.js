import * as THREE from 'three';
import { WebGLPathTracer, PhysicalCamera, BlurredEnvMapGenerator } from 'three-gpu-pathtracer';

/**
 * PathTracer - Wrapper for three-gpu-pathtracer for high-quality rendering
 * 
 * Features:
 * - Progressive path tracing for preview/baking
 * - Environment map support
 * - Quality presets
 * - Lightmap export
 */
export class PathTracer {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.pathTracer = null;
        this.isRendering = false;
        this.samples = 0;
        this.maxSamples = 500;

        // Settings
        this.settings = {
            bounces: 8,
            tiles: { x: 3, y: 3 },
            filterGlossyFactor: 0.5,
            renderScale: 1,
            dynamicLowRes: true,
            lowResScale: 0.25
        };

        // Callbacks
        this.onProgress = null;
        this.onComplete = null;

        // Environment
        this.envMapGenerator = null;
    }

    /**
     * Initialize the path tracer
     */
    async init() {
        this.pathTracer = new WebGLPathTracer(this.renderer);

        // Apply settings
        this.pathTracer.bounces = this.settings.bounces;
        this.pathTracer.tiles.set(this.settings.tiles.x, this.settings.tiles.y);
        this.pathTracer.filterGlossyFactor = this.settings.filterGlossyFactor;
        this.pathTracer.renderScale = this.settings.renderScale;
        this.pathTracer.dynamicLowRes = this.settings.dynamicLowRes;
        this.pathTracer.lowResScale = this.settings.lowResScale;

        // Enable smooth fade-in
        this.pathTracer.fadeDuration = 500;
        this.pathTracer.minSamples = 3;

        // Set scene
        await this.pathTracer.setSceneAsync(this.scene, this.camera);

        // Setup environment map generator
        this.envMapGenerator = new BlurredEnvMapGenerator(this.renderer);

        return this;
    }

    /**
     * Update scene in path tracer (call when geometry/materials change)
     */
    async updateScene() {
        if (!this.pathTracer) return;
        await this.pathTracer.setSceneAsync(this.scene, this.camera);
        this.reset();
    }

    /**
     * Update camera (call when camera moves/changes)
     */
    updateCamera() {
        if (!this.pathTracer) return;
        this.pathTracer.updateCamera();
    }

    /**
     * Update materials (call when material properties change)
     */
    updateMaterials() {
        if (!this.pathTracer) return;
        this.pathTracer.updateMaterials();
    }

    /**
     * Update environment (call when scene background/environment changes)
     */
    updateEnvironment() {
        if (!this.pathTracer) return;
        this.pathTracer.updateEnvironment();
    }

    /**
     * Update lights (call when lights change)
     */
    updateLights() {
        if (!this.pathTracer) return;
        this.pathTracer.updateLights();
    }

    /**
     * Start path tracing
     */
    start(maxSamples = 500) {
        if (!this.pathTracer) {
            console.error('PathTracer not initialized. Call init() first.');
            return;
        }

        this.maxSamples = maxSamples;
        this.isRendering = true;
        this.samples = 0;
        this.pathTracer.reset();
    }

    /**
     * Stop path tracing
     */
    stop() {
        this.isRendering = false;
    }

    /**
     * Reset path tracing (restart from sample 0)
     */
    reset() {
        if (!this.pathTracer) return;
        this.pathTracer.reset();
        this.samples = 0;
    }

    /**
     * Render one sample (call in animation loop)
     * @returns {boolean} True if still rendering
     */
    renderSample() {
        if (!this.pathTracer || !this.isRendering) return false;

        this.pathTracer.renderSample();
        this.samples = this.pathTracer.samples;

        // Progress callback
        if (this.onProgress) {
            this.onProgress(this.samples, this.maxSamples);
        }

        // Check completion
        if (this.samples >= this.maxSamples) {
            this.isRendering = false;
            if (this.onComplete) {
                this.onComplete(this.getImage());
            }
            return false;
        }

        return true;
    }

    /**
     * Get current render as image data URL
     * @returns {string} Data URL of the current render
     */
    getImage() {
        if (!this.pathTracer || !this.pathTracer.target) return null;

        const target = this.pathTracer.target;
        const width = target.width;
        const height = target.height;

        // Read pixels
        const pixels = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

        // Create canvas and draw
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        // Flip Y and copy pixels
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = ((height - y - 1) * width + x) * 4;
                const dstIdx = (y * width + x) * 4;
                imageData.data[dstIdx] = pixels[srcIdx];
                imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
                imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
                imageData.data[dstIdx + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }

    /**
     * Bake path traced render at high quality
     * @param {Object} options Bake options
     * @returns {Promise<string>} Data URL of baked image
     */
    async bake(options = {}) {
        const {
            samples = 1000,
            width = 1920,
            height = 1080,
            onProgress = null
        } = options;

        // Store original settings
        const originalRenderScale = this.pathTracer.renderScale;

        // Set bake resolution
        this.renderer.setSize(width, height);
        this.pathTracer.renderScale = 1;

        // Start baking
        this.start(samples);
        this.onProgress = onProgress;

        // Render all samples
        return new Promise((resolve) => {
            const bakeLoop = () => {
                if (this.renderSample()) {
                    requestAnimationFrame(bakeLoop);
                } else {
                    // Restore settings
                    this.pathTracer.renderScale = originalRenderScale;
                    resolve(this.getImage());
                }
            };
            bakeLoop();
        });
    }

    /**
     * Set quality preset
     * @param {string} preset 'low' | 'medium' | 'high' | 'ultra'
     */
    setQuality(preset) {
        const presets = {
            low: { bounces: 3, tiles: { x: 2, y: 2 }, samples: 100 },
            medium: { bounces: 5, tiles: { x: 3, y: 3 }, samples: 250 },
            high: { bounces: 8, tiles: { x: 4, y: 4 }, samples: 500 },
            ultra: { bounces: 12, tiles: { x: 4, y: 4 }, samples: 1000 }
        };

        const settings = presets[preset] || presets.medium;

        this.settings.bounces = settings.bounces;
        this.settings.tiles = settings.tiles;
        this.maxSamples = settings.samples;

        if (this.pathTracer) {
            this.pathTracer.bounces = settings.bounces;
            this.pathTracer.tiles.set(settings.tiles.x, settings.tiles.y);
        }
    }

    /**
     * Configure path tracer settings
     * @param {Object} settings Settings to apply
     */
    configure(settings) {
        Object.assign(this.settings, settings);

        if (this.pathTracer) {
            if (settings.bounces !== undefined) {
                this.pathTracer.bounces = settings.bounces;
            }
            if (settings.tiles !== undefined) {
                this.pathTracer.tiles.set(settings.tiles.x, settings.tiles.y);
            }
            if (settings.filterGlossyFactor !== undefined) {
                this.pathTracer.filterGlossyFactor = settings.filterGlossyFactor;
            }
            if (settings.renderScale !== undefined) {
                this.pathTracer.renderScale = settings.renderScale;
            }
        }
    }

    /**
     * Get current stats
     * @returns {Object} Current path tracing stats
     */
    getStats() {
        return {
            samples: this.samples,
            maxSamples: this.maxSamples,
            progress: this.samples / this.maxSamples,
            isRendering: this.isRendering,
            bounces: this.settings.bounces
        };
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.stop();

        if (this.pathTracer) {
            this.pathTracer.dispose();
            this.pathTracer = null;
        }

        if (this.envMapGenerator) {
            this.envMapGenerator.dispose();
            this.envMapGenerator = null;
        }
    }
}

/**
 * Check if path tracing is supported
 * @param {WebGLRenderer} renderer 
 * @returns {boolean}
 */
export function isPathTracingSupported(renderer) {
    const gl = renderer.getContext();

    // Check for WebGL2
    if (!(gl instanceof WebGL2RenderingContext)) {
        return false;
    }

    // Check for required extensions
    const requiredExtensions = [
        'EXT_color_buffer_float',
        'OES_texture_float_linear'
    ];

    for (const ext of requiredExtensions) {
        if (!gl.getExtension(ext)) {
            return false;
        }
    }

    return true;
}
