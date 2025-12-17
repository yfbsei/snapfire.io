import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * AssetStreaming - Manages async loading of assets with priority
 * Used by ChunkManager and LODManager
 */
export class AssetStreaming {
    constructor(options = {}) {
        this.maxDownloads = options.maxDownloads || 4;
        this.activeDownloads = 0;
        this.queue = []; // { url, type, priority, resolve, reject, callback }

        // Loaders
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();

        // Setup Draco
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader.setDRACOLoader(dracoLoader);

        // Cache
        this.cache = new Map();
    }

    /**
     * Load a texture with priority
     * @param {string} url 
     * @param {number} priority - Higher number = higher priority
     * @returns {Promise<THREE.Texture>}
     */
    loadTexture(url, priority = 1) {
        if (this.cache.has(url)) {
            return Promise.resolve(this.cache.get(url));
        }

        return new Promise((resolve, reject) => {
            this._enqueue({
                url,
                type: 'texture',
                priority,
                resolve,
                reject,
                retries: 0
            });
        });
    }

    /**
     * Load an audio buffer with priority
     * @param {string} url 
     * @param {number} priority 
     * @returns {Promise<AudioBuffer>}
     */
    loadAudio(url, priority = 1) {
        if (this.cache.has(url)) {
            return Promise.resolve(this.cache.get(url));
        }

        return new Promise((resolve, reject) => {
            this._enqueue({
                url,
                type: 'audio',
                priority,
                resolve,
                reject,
                retries: 0
            });
        });
    }

    /**
     * Load a GLTF model with priority
     * @param {string} url 
     * @param {number} priority 
     * @returns {Promise<THREE.Group>}
     */
    loadModel(url, priority = 1) {
        // ... (existing model logic slightly modified to use retries object if needed, though simpler to leave as is for enqueue)
        // Actually I should just update the enqueue call in loadModel to include retries: 0
        if (this.cache.has(url)) {
            return Promise.resolve(this.cache.get(url).clone());
        }

        return new Promise((resolve, reject) => {
            this._enqueue({
                url,
                type: 'model',
                priority,
                resolve,
                reject,
                retries: 0
            });
        });
    }

    /**
     * Add to queue and sort
     * @private
     */
    _enqueue(item) {
        this.queue.push(item);
        this.queue.sort((a, b) => b.priority - a.priority);
        this._processQueue();
    }

    /**
     * Process the download queue
     * @private
     */
    _processQueue() {
        if (this.activeDownloads >= this.maxDownloads || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        this.activeDownloads++;

        const onLoad = (data) => {
            this.activeDownloads--;

            // For models, cache the result but return a clone
            if (item.type === 'model') {
                this.cache.set(item.url, data.scene);
                item.resolve(data.scene.clone());
            } else {
                this.cache.set(item.url, data);
                item.resolve(data);
            }

            this._processQueue();
        };

        const onError = (err) => {
            this.activeDownloads--;

            // Retry logic
            if (item.retries < 3) {
                console.warn(`Failed to load ${item.url}, retrying (${item.retries + 1}/3)...`);
                item.retries++;
                // Re-queue with same priority
                this.queue.push(item);
                this.queue.sort((a, b) => b.priority - a.priority);
            } else {
                console.error(`Failed to load ${item.url} after 3 attempts:`, err);
                item.reject(err);
            }

            this._processQueue();
        };

        try {
            if (item.type === 'texture') {
                this.textureLoader.load(item.url, onLoad, undefined, onError);
            } else if (item.type === 'model') {
                this.gltfLoader.load(item.url, onLoad, undefined, onError);
            } else if (item.type === 'audio') {
                const loader = new THREE.AudioLoader();
                loader.load(item.url, onLoad, undefined, onError);
            }
        } catch (e) {
            onError(e);
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}
