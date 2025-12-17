import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/**
 * AssetLoader - Unified asset loading with caching
 * Supports GLTF/GLB, FBX, OBJ, textures, audio, and HDR
 */
export class AssetLoader {
    constructor() {
        // Caches
        this.models = new Map();
        this.textures = new Map();
        this.audio = new Map();
        this.materials = new Map();

        // Loading manager for progress tracking
        this.loadingManager = new THREE.LoadingManager();
        this.loadingManager.onProgress = (url, loaded, total) => {
            this._onProgress(url, loaded, total);
        };

        // Loaders
        this.gltfLoader = new GLTFLoader(this.loadingManager);
        this.fbxLoader = new FBXLoader(this.loadingManager);
        this.objLoader = new OBJLoader(this.loadingManager);
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
        this.rgbeLoader = new RGBELoader(this.loadingManager);

        // Setup DRACO for compressed GLTF
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader.setDRACOLoader(this.dracoLoader);

        // Progress callback
        this.onProgress = null;

        // Base path for assets
        this.basePath = '';

        // Priority Queue for streaming
        this.priorityQueue = [];
        this.isProcessingQueue = false;
        this.maxConcurrentLoads = 4;
        this.activeLoads = 0;
    }

    /**
     * Add asset to priority queue for streaming
     * @param {string} path - Asset path
     * @param {number} priority - Priority (higher = more important)
     * @param {number} distance - Distance from camera/player
     * @returns {Promise}
     */
    streamAsset(path, priority = 0, distance = 0) {
        return new Promise((resolve, reject) => {
            this.priorityQueue.push({
                path,
                priority,
                distance,
                resolve,
                reject,
                timestamp: performance.now()
            });

            // Sort by priority (higher first), then distance (closer first)
            this.priorityQueue.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                return a.distance - b.distance;
            });

            this._processQueue();
        });
    }

    async _processQueue() {
        if (this.isProcessingQueue || this.priorityQueue.length === 0) return;
        if (this.activeLoads >= this.maxConcurrentLoads) return;

        this.isProcessingQueue = true;
        this.activeLoads++;

        const item = this.priorityQueue.shift();

        try {
            const result = await this.loadModel(item.path);
            item.resolve(result);
        } catch (error) {
            item.reject(error);
        }

        this.activeLoads--;
        this.isProcessingQueue = false;

        // Process next item
        if (this.priorityQueue.length > 0) {
            this._processQueue();
        }
    }

    /**
     * Set base path for all assets
     * @param {string} path
     */
    setBasePath(path) {
        this.basePath = path.endsWith('/') ? path : path + '/';
    }

    /**
     * Resolve asset path
     * @private
     */
    _resolvePath(path) {
        if (path.startsWith('http') || path.startsWith('/')) {
            return path;
        }
        return this.basePath + path;
    }

    /**
     * Progress handler
     * @private
     */
    _onProgress(url, loaded, total) {
        const progress = total > 0 ? loaded / total : 0;
        if (this.onProgress) {
            this.onProgress(url, progress);
        }
    }

    // ==================== Models ====================

    /**
     * Load a 3D model (GLTF/GLB, FBX, or OBJ)
     * @param {string} path - Path to model file
     * @param {Object} options
     * @returns {Promise<THREE.Object3D>}
     */
    async loadModel(path, options = {}) {
        const fullPath = this._resolvePath(path);

        // Check cache
        if (!options.forceReload && this.models.has(fullPath)) {
            const cached = this.models.get(fullPath);
            return options.clone !== false ? cached.clone() : cached;
        }

        const extension = path.split('.').pop().toLowerCase();
        let model;

        try {
            switch (extension) {
                case 'gltf':
                case 'glb':
                    model = await this._loadGLTF(fullPath, options);
                    break;
                case 'fbx':
                    model = await this._loadFBX(fullPath);
                    break;
                case 'obj':
                    model = await this._loadOBJ(fullPath);
                    break;
                default:
                    throw new Error(`Unsupported model format: ${extension}`);
            }

            // Setup shadows
            if (options.castShadow !== false) {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
            }

            // Cache
            this.models.set(fullPath, model);

            return options.clone !== false ? model.clone() : model;
        } catch (error) {
            console.error(`Failed to load model: ${path}`, error);
            throw error;
        }
    }

    async _loadGLTF(path, options) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;

                    // Store animations
                    if (gltf.animations && gltf.animations.length > 0) {
                        model.userData.animations = gltf.animations;
                    }

                    resolve(model);
                },
                undefined,
                reject
            );
        });
    }

    async _loadFBX(path) {
        return new Promise((resolve, reject) => {
            this.fbxLoader.load(path, resolve, undefined, reject);
        });
    }

    async _loadOBJ(path) {
        return new Promise((resolve, reject) => {
            this.objLoader.load(path, resolve, undefined, reject);
        });
    }

    // ==================== Textures ====================

    /**
     * Load a texture
     * @param {string} path
     * @param {Object} options
     * @returns {Promise<THREE.Texture>}
     */
    async loadTexture(path, options = {}) {
        const fullPath = this._resolvePath(path);

        // Check cache
        if (!options.forceReload && this.textures.has(fullPath)) {
            return this.textures.get(fullPath);
        }

        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                fullPath,
                (texture) => {
                    // Apply options
                    if (options.repeat) {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(options.repeat.x || 1, options.repeat.y || 1);
                    }

                    if (options.flipY !== undefined) {
                        texture.flipY = options.flipY;
                    }

                    if (options.encoding) {
                        texture.colorSpace = options.encoding;
                    } else {
                        texture.colorSpace = THREE.SRGBColorSpace;
                    }

                    if (options.filter) {
                        texture.minFilter = options.filter;
                        texture.magFilter = options.filter;
                    }

                    // Cache
                    this.textures.set(fullPath, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load an HDR environment map
     * @param {string} path
     * @returns {Promise<THREE.Texture>}
     */
    async loadHDR(path) {
        const fullPath = this._resolvePath(path);

        if (this.textures.has(fullPath)) {
            return this.textures.get(fullPath);
        }

        return new Promise((resolve, reject) => {
            this.rgbeLoader.load(
                fullPath,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    this.textures.set(fullPath, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    // ==================== Audio ====================

    /**
     * Load an audio buffer
     * @param {string} path
     * @returns {Promise<AudioBuffer>}
     */
    async loadAudio(path) {
        const fullPath = this._resolvePath(path);

        if (this.audio.has(fullPath)) {
            return this.audio.get(fullPath);
        }

        return new Promise((resolve, reject) => {
            this.audioLoader.load(
                fullPath,
                (buffer) => {
                    this.audio.set(fullPath, buffer);
                    resolve(buffer);
                },
                undefined,
                reject
            );
        });
    }

    // ==================== Preloading ====================

    /**
     * Preload multiple assets
     * @param {string[]} paths - Array of asset paths
     * @param {Function} onProgress - Progress callback (loaded, total)
     * @returns {Promise<void>}
     */
    async preload(paths, onProgress = null) {
        let loaded = 0;
        const total = paths.length;

        const promises = paths.map(async (path) => {
            const ext = path.split('.').pop().toLowerCase();

            try {
                if (['gltf', 'glb', 'fbx', 'obj'].includes(ext)) {
                    await this.loadModel(path);
                } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
                    await this.loadTexture(path);
                } else if (['hdr', 'exr'].includes(ext)) {
                    await this.loadHDR(path);
                } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
                    await this.loadAudio(path);
                }
            } catch (e) {
                console.warn(`Failed to preload: ${path}`, e);
            }

            loaded++;
            if (onProgress) {
                onProgress(loaded, total);
            }
        });

        await Promise.all(promises);
    }

    // ==================== Materials ====================

    /**
     * Create a standard PBR material
     * @param {Object} options
     * @returns {THREE.MeshStandardMaterial}
     */
    createMaterial(options = {}) {
        const material = new THREE.MeshStandardMaterial({
            color: options.color || 0xffffff,
            roughness: options.roughness ?? 0.5,
            metalness: options.metalness ?? 0.0,
            transparent: options.transparent || false,
            opacity: options.opacity ?? 1.0,
            side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide
        });

        // Load textures if paths provided
        if (options.map) {
            this.loadTexture(options.map).then(t => { material.map = t; material.needsUpdate = true; });
        }
        if (options.normalMap) {
            this.loadTexture(options.normalMap).then(t => { material.normalMap = t; material.needsUpdate = true; });
        }
        if (options.roughnessMap) {
            this.loadTexture(options.roughnessMap).then(t => { material.roughnessMap = t; material.needsUpdate = true; });
        }
        if (options.metalnessMap) {
            this.loadTexture(options.metalnessMap).then(t => { material.metalnessMap = t; material.needsUpdate = true; });
        }
        if (options.aoMap) {
            this.loadTexture(options.aoMap).then(t => { material.aoMap = t; material.needsUpdate = true; });
        }

        return material;
    }

    // ==================== Cache Management ====================

    /**
     * Clear a specific cache or all caches
     * @param {string} type - 'models', 'textures', 'audio', 'all'
     */
    clearCache(type = 'all') {
        if (type === 'models' || type === 'all') {
            this.models.forEach(model => {
                model.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            });
            this.models.clear();
        }

        if (type === 'textures' || type === 'all') {
            this.textures.forEach(texture => texture.dispose());
            this.textures.clear();
        }

        if (type === 'audio' || type === 'all') {
            this.audio.clear();
        }

        if (type === 'materials' || type === 'all') {
            this.materials.forEach(mat => mat.dispose());
            this.materials.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            models: this.models.size,
            textures: this.textures.size,
            audio: this.audio.size,
            materials: this.materials.size
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.clearCache('all');
        this.dracoLoader.dispose();
    }
}

// Singleton instance
export const assetLoader = new AssetLoader();
