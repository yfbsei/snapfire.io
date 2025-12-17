/**
 * VirtualTexturing - Tiled texture streaming for large textures
 * Manages texture LOD and memory budget for 4K+ textures
 */
import * as THREE from 'three';

/**
 * VirtualTexture - A single virtual texture with tiled streaming
 */
export class VirtualTexture {
    constructor(options = {}) {
        this.id = options.id ?? crypto.randomUUID();
        this.url = options.url ?? null;
        this.width = options.width ?? 4096;
        this.height = options.height ?? 4096;
        this.tileSize = options.tileSize ?? 256;
        this.format = options.format ?? 'image/jpeg';

        // Mip levels
        this.mipLevels = Math.floor(Math.log2(Math.max(this.width, this.height))) + 1;
        this.tiles = new Map(); // key: "mip_x_y" -> ImageBitmap/Texture
        this.pendingTiles = new Set();

        // Current display texture
        this.texture = new THREE.DataTexture(
            new Uint8Array(4).fill(128), // Gray placeholder
            1, 1,
            THREE.RGBAFormat
        );
        this.texture.needsUpdate = true;

        // Memory tracking
        this.memoryUsage = 0;
    }

    /**
     * Get tile key
     */
    getTileKey(mipLevel, tileX, tileY) {
        return `${mipLevel}_${tileX}_${tileY}`;
    }

    /**
     * Check if tile is loaded
     */
    hasTile(mipLevel, tileX, tileY) {
        return this.tiles.has(this.getTileKey(mipLevel, tileX, tileY));
    }

    /**
     * Get number of tiles at mip level
     */
    getTileCount(mipLevel) {
        const mipWidth = Math.max(1, this.width >> mipLevel);
        const mipHeight = Math.max(1, this.height >> mipLevel);
        return {
            x: Math.ceil(mipWidth / this.tileSize),
            y: Math.ceil(mipHeight / this.tileSize)
        };
    }
}

/**
 * VirtualTexturing - Manages virtual texture streaming
 */
export class VirtualTexturing {
    constructor(options = {}) {
        // Memory budget in bytes
        this.memoryBudget = options.memoryBudget ?? 256 * 1024 * 1024; // 256MB
        this.currentMemory = 0;

        // Textures
        this.textures = new Map();

        // Loading queue
        this.loadQueue = [];
        this.maxConcurrentLoads = options.maxConcurrentLoads ?? 4;
        this.activeLoads = 0;

        // Tile cache with LRU eviction
        this.tileCache = new Map();
        this.tileCacheOrder = [];
        this.maxCacheSize = options.maxCacheSize ?? 1000;

        // Camera for determining visible tiles
        this.camera = null;
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
    }

    /**
     * Set camera for LOD calculations
     * @param {THREE.Camera} camera
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * Register a virtual texture
     * @param {string} id
     * @param {Object} options
     * @returns {VirtualTexture}
     */
    createTexture(id, options = {}) {
        const texture = new VirtualTexture({
            id,
            ...options
        });
        this.textures.set(id, texture);
        return texture;
    }

    /**
     * Get virtual texture by ID
     * @param {string} id
     * @returns {VirtualTexture}
     */
    getTexture(id) {
        return this.textures.get(id);
    }

    /**
     * Request tiles for a texture based on screen coverage
     * @param {string} textureId
     * @param {THREE.Object3D} object - Object using this texture
     */
    requestTiles(textureId, object) {
        const vt = this.textures.get(textureId);
        if (!vt || !this.camera) return;

        // Calculate screen coverage to determine required mip level
        const boundingBox = new THREE.Box3().setFromObject(object);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());

        // Distance from camera
        const distance = center.distanceTo(this.camera.position);

        // Screen coverage approximation
        const fov = this.camera.fov * (Math.PI / 180);
        const screenHeight = 2 * distance * Math.tan(fov / 2);
        const coverage = Math.max(size.x, size.y, size.z) / screenHeight;

        // Calculate required mip level (lower mip = higher detail)
        const requiredMip = Math.max(0, Math.floor(-Math.log2(coverage * 2)));
        const mipLevel = Math.min(requiredMip, vt.mipLevels - 1);

        // Get visible tile range
        const tileCount = vt.getTileCount(mipLevel);

        // Request visible tiles
        for (let ty = 0; ty < tileCount.y; ty++) {
            for (let tx = 0; tx < tileCount.x; tx++) {
                this._requestTile(vt, mipLevel, tx, ty);
            }
        }
    }

    _requestTile(vt, mipLevel, tileX, tileY) {
        const key = vt.getTileKey(mipLevel, tileX, tileY);

        // Already loaded or pending
        if (vt.hasTile(mipLevel, tileX, tileY) || vt.pendingTiles.has(key)) {
            return;
        }

        // Add to queue with priority (lower mip = higher priority)
        this.loadQueue.push({
            texture: vt,
            mipLevel,
            tileX,
            tileY,
            priority: mipLevel
        });

        vt.pendingTiles.add(key);
        this._processQueue();
    }

    async _processQueue() {
        // Sort by priority
        this.loadQueue.sort((a, b) => a.priority - b.priority);

        while (this.activeLoads < this.maxConcurrentLoads && this.loadQueue.length > 0) {
            const request = this.loadQueue.shift();
            this.activeLoads++;

            try {
                await this._loadTile(request);
            } catch (error) {
                console.warn('VirtualTexturing: Failed to load tile:', error);
            }

            this.activeLoads--;
        }
    }

    async _loadTile(request) {
        const { texture: vt, mipLevel, tileX, tileY } = request;
        const key = vt.getTileKey(mipLevel, tileX, tileY);

        // Construct tile URL (assumes tiled texture server)
        const tileUrl = `${vt.url}/${mipLevel}/${tileX}_${tileY}.${vt.format.split('/')[1]}`;

        try {
            const response = await fetch(tileUrl);
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);

            // Estimate memory usage
            const tileMemory = vt.tileSize * vt.tileSize * 4; // RGBA

            // Check memory budget
            if (this.currentMemory + tileMemory > this.memoryBudget) {
                this._evictTiles(tileMemory);
            }

            // Store tile
            vt.tiles.set(key, bitmap);
            this.currentMemory += tileMemory;

            // Update cache
            this._updateCache(vt.id, key);

            // Update texture if this is a high-priority tile
            if (mipLevel <= 2) {
                this._updateTexture(vt);
            }

        } finally {
            vt.pendingTiles.delete(key);
        }
    }

    _updateCache(textureId, tileKey) {
        const fullKey = `${textureId}_${tileKey}`;

        // Remove if already in cache (will re-add at end)
        const index = this.tileCacheOrder.indexOf(fullKey);
        if (index > -1) {
            this.tileCacheOrder.splice(index, 1);
        }

        this.tileCacheOrder.push(fullKey);
        this.tileCache.set(fullKey, { textureId, tileKey, time: Date.now() });
    }

    _evictTiles(requiredMemory) {
        while (this.currentMemory + requiredMemory > this.memoryBudget &&
            this.tileCacheOrder.length > 0) {
            // Remove oldest tile
            const fullKey = this.tileCacheOrder.shift();
            const cacheEntry = this.tileCache.get(fullKey);

            if (cacheEntry) {
                const vt = this.textures.get(cacheEntry.textureId);
                if (vt && vt.tiles.has(cacheEntry.tileKey)) {
                    const tile = vt.tiles.get(cacheEntry.tileKey);
                    if (tile && tile.close) tile.close(); // Close ImageBitmap
                    vt.tiles.delete(cacheEntry.tileKey);

                    // Approximate memory freed
                    const tileMemory = vt.tileSize * vt.tileSize * 4;
                    this.currentMemory = Math.max(0, this.currentMemory - tileMemory);
                }

                this.tileCache.delete(fullKey);
            }
        }
    }

    _updateTexture(vt) {
        // Composite loaded tiles into main texture
        // This is a simplified version - full implementation would use GPU compositing
        // For now, just mark texture as needing update
        vt.texture.needsUpdate = true;
    }

    /**
     * Update virtual texturing system
     * Call every frame to process loading
     */
    update() {
        this._processQueue();
    }

    /**
     * Get memory statistics
     * @returns {Object}
     */
    getStats() {
        return {
            memoryUsed: this.currentMemory,
            memoryBudget: this.memoryBudget,
            memoryUsedMB: (this.currentMemory / (1024 * 1024)).toFixed(2),
            textureCount: this.textures.size,
            cachedTiles: this.tileCache.size,
            pendingLoads: this.loadQueue.length
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.textures.forEach(vt => {
            vt.tiles.forEach(tile => {
                if (tile && tile.close) tile.close();
            });
            vt.tiles.clear();
            vt.texture.dispose();
        });
        this.textures.clear();
        this.tileCache.clear();
        this.tileCacheOrder = [];
        this.loadQueue = [];
        this.currentMemory = 0;
    }
}

export default VirtualTexturing;
