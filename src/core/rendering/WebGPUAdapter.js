/**
 * WebGPUAdapter - Renderer abstraction layer for WebGPU/WebGL
 * Provides unified API and automatic fallback
 */
import * as THREE from 'three';

/**
 * Renderer capabilities detection and feature flags
 */
export const RendererCapabilities = {
    WEBGPU: 'webgpu',
    WEBGL2: 'webgl2',
    WEBGL: 'webgl'
};

/**
 * Check if WebGPU is available in the current browser
 * @returns {Promise<boolean>}
 */
export async function isWebGPUAvailable() {
    if (!navigator.gpu) {
        return false;
    }

    try {
        const adapter = await navigator.gpu.requestAdapter();
        return adapter !== null;
    } catch (e) {
        console.warn('WebGPU adapter request failed:', e);
        return false;
    }
}

/**
 * Check WebGL2 availability
 * @returns {boolean}
 */
export function isWebGL2Available() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

/**
 * WebGPUAdapter - Creates and manages the appropriate renderer
 */
export class WebGPUAdapter {
    constructor() {
        this.renderer = null;
        this.rendererType = null;
        this.capabilities = null;
        this.isInitialized = false;

        // Feature flags
        this.features = {
            computeShaders: false,
            bindlessTextures: false,
            variableRateShading: false,
            rayTracing: false,
            meshShaders: false
        };

        // Performance settings
        this.settings = {
            pixelRatio: Math.min(window.devicePixelRatio, 2),
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false
        };
    }

    /**
     * Initialize the renderer with automatic fallback
     * @param {HTMLElement} container - DOM container for the canvas
     * @param {Object} options - Renderer options
     * @returns {Promise<THREE.WebGLRenderer|THREE.WebGPURenderer>}
     */
    async init(container, options = {}) {
        this.settings = { ...this.settings, ...options };

        // Try WebGPU first if preferred
        if (options.preferWebGPU !== false) {
            const webgpuAvailable = await isWebGPUAvailable();

            if (webgpuAvailable) {
                try {
                    await this._initWebGPU(container);
                    return this.renderer;
                } catch (e) {
                    console.warn('WebGPU initialization failed, falling back to WebGL:', e);
                }
            }
        }

        // Fallback to WebGL2/WebGL
        this._initWebGL(container);
        return this.renderer;
    }

    /**
     * Initialize WebGPU renderer
     * @private
     */
    async _initWebGPU(container) {
        // Dynamic import for WebGPU renderer - three.js 0.170+ uses webgpu subpath
        let WebGPURenderer;

        try {
            // Try the three/webgpu entry point (three.js 0.170+)
            const module = await import('three/webgpu');
            // Handle both named export and default export
            WebGPURenderer = module.WebGPURenderer || module.default;

            if (!WebGPURenderer) {
                throw new Error('WebGPURenderer not found in module');
            }
        } catch (e1) {
            console.warn('WebGPU renderer not available:', e1.message);
            throw new Error('WebGPU renderer module not found');
        }

        this.renderer = new WebGPURenderer({
            antialias: this.settings.antialias,
            powerPreference: this.settings.powerPreference,
            alpha: this.settings.alpha
        });

        await this.renderer.init();

        this.rendererType = RendererCapabilities.WEBGPU;
        this._configureRenderer(container);
        this._detectWebGPUFeatures();

        console.log('🚀 WebGPU Renderer initialized');
        this.isInitialized = true;
    }

    /**
     * Initialize WebGL renderer
     * @private
     */
    _initWebGL(container) {
        const isWebGL2 = isWebGL2Available();

        this.renderer = new THREE.WebGLRenderer({
            antialias: this.settings.antialias,
            powerPreference: this.settings.powerPreference,
            alpha: this.settings.alpha
        });

        this.rendererType = isWebGL2 ? RendererCapabilities.WEBGL2 : RendererCapabilities.WEBGL;
        this._configureRenderer(container);
        this._detectWebGLFeatures();

        console.log(`🎮 ${isWebGL2 ? 'WebGL2' : 'WebGL'} Renderer initialized`);
        this.isInitialized = true;
    }

    /**
     * Configure common renderer settings
     * @private
     */
    _configureRenderer(container) {
        this.renderer.setPixelRatio(this.settings.pixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Shadow configuration
        if (this.renderer.shadowMap) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        container.appendChild(this.renderer.domElement);
    }

    /**
     * Detect WebGPU-specific features
     * @private
     */
    async _detectWebGPUFeatures() {
        this.features.computeShaders = true;

        // Check for additional WebGPU features
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                const features = adapter.features;

                // Check for ray tracing (future)
                this.features.rayTracing = features.has('ray-tracing') || false;

                // Variable rate shading
                this.features.variableRateShading = features.has('variable-rate-shading') || false;

                // Store adapter limits
                this.capabilities = {
                    maxTextureSize: adapter.limits.maxTextureDimension2D,
                    maxUniformBufferSize: adapter.limits.maxUniformBufferBindingSize,
                    maxStorageBufferSize: adapter.limits.maxStorageBufferBindingSize,
                    maxComputeWorkgroupSize: adapter.limits.maxComputeWorkgroupSizeX
                };
            }
        } catch (e) {
            console.warn('Failed to detect WebGPU features:', e);
        }
    }

    /**
     * Detect WebGL-specific features
     * @private
     */
    _detectWebGLFeatures() {
        const gl = this.renderer.getContext();

        this.capabilities = {
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
            maxVaryings: gl.getParameter(gl.MAX_VARYING_VECTORS),
            maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
            instancedArrays: this.rendererType === RendererCapabilities.WEBGL2 ||
                !!gl.getExtension('ANGLE_instanced_arrays'),
            drawBuffers: this.rendererType === RendererCapabilities.WEBGL2 ||
                !!gl.getExtension('WEBGL_draw_buffers'),
            depthTexture: this.rendererType === RendererCapabilities.WEBGL2 ||
                !!gl.getExtension('WEBGL_depth_texture'),
            floatTextures: this.rendererType === RendererCapabilities.WEBGL2 ||
                !!gl.getExtension('OES_texture_float')
        };

        // Check for compute shader emulation possibility
        this.features.computeShaders = false;
    }

    /**
     * Check if a specific feature is available
     * @param {string} feature - Feature name
     * @returns {boolean}
     */
    hasFeature(feature) {
        return this.features[feature] || false;
    }

    /**
     * Get renderer info string
     * @returns {string}
     */
    getInfo() {
        const info = this.renderer.info;
        return {
            type: this.rendererType,
            capabilities: this.capabilities,
            features: this.features,
            memory: {
                geometries: info.memory?.geometries || 0,
                textures: info.memory?.textures || 0
            },
            render: {
                calls: info.render?.calls || 0,
                triangles: info.render?.triangles || 0,
                points: info.render?.points || 0,
                lines: info.render?.lines || 0
            }
        };
    }

    /**
     * Set render size
     * @param {number} width 
     * @param {number} height 
     */
    setSize(width, height) {
        this.renderer.setSize(width, height);
    }

    /**
     * Set pixel ratio
     * @param {number} ratio 
     */
    setPixelRatio(ratio) {
        this.renderer.setPixelRatio(Math.min(ratio, 2));
    }

    /**
     * Render scene
     * @param {THREE.Scene} scene 
     * @param {THREE.Camera} camera 
     */
    render(scene, camera) {
        this.renderer.render(scene, camera);
    }

    /**
     * Render async (for WebGPU)
     * @param {THREE.Scene} scene 
     * @param {THREE.Camera} camera 
     */
    async renderAsync(scene, camera) {
        if (this.rendererType === RendererCapabilities.WEBGPU && this.renderer.renderAsync) {
            await this.renderer.renderAsync(scene, camera);
        } else {
            this.renderer.render(scene, camera);
        }
    }

    /**
     * Get the DOM element
     * @returns {HTMLCanvasElement}
     */
    get domElement() {
        return this.renderer.domElement;
    }

    /**
     * Check if using WebGPU
     * @returns {boolean}
     */
    get isWebGPU() {
        return this.rendererType === RendererCapabilities.WEBGPU;
    }

    /**
     * Check if using WebGL2
     * @returns {boolean}
     */
    get isWebGL2() {
        return this.rendererType === RendererCapabilities.WEBGL2;
    }

    /**
     * Dispose of renderer resources
     */
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.isInitialized = false;
    }
}

/**
 * Singleton instance for convenience
 */
let _instance = null;

export function getWebGPUAdapter() {
    if (!_instance) {
        _instance = new WebGPUAdapter();
    }
    return _instance;
}

export default WebGPUAdapter;
