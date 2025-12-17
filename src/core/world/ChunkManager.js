import * as THREE from 'three';
import { AssetStreaming } from './AssetStreaming.js';

/**
 * ChunkManager - Manages world chunks for open-world streaming
 * Handles loading/unloading of world regions based on camera position
 */
export class ChunkManager {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 100;      // World units per chunk
        this.loadDistance = options.loadDistance || 3;   // Chunks to load around player
        this.unloadDistance = options.unloadDistance || 5; // Chunks to keep loaded

        this.chunks = new Map(); // "x,z" -> Chunk
        this.loadingChunks = new Set(); // Chunks currently loading
        this.activeChunks = new Set(); // Currently visible chunks

        // Async asset streaming
        this.streaming = options.streaming || new AssetStreaming();

        // Registered systems (Terrain, Vegetation, etc.)
        this.systems = new Set();

        // Current player/camera position in chunk coordinates
        this._currentChunkX = null;
        this._currentChunkZ = null;

        // Update throttling
        this.updateFrequency = options.updateFrequency || 10; // Frames between updates
        this._frameCount = 0;
    }

    /**
     * Register a system to be managed by the chunk manager
     * System must implement: onChunkLoad(chunk), onChunkUnload(chunk)
     * @param {Object} system 
     */
    registerSystem(system) {
        this.systems.add(system);

        // If system needs to initialize existing chunks
        if (typeof system.onChunkLoad === 'function') {
            for (const chunk of this.chunks.values()) {
                system.onChunkLoad(chunk);
            }
        }
    }

    /**
     * Unregister a system
     * @param {Object} system 
     */
    unregisterSystem(system) {
        this.systems.delete(system);
    }

    /**
     * Update based on camera position
     * @param {THREE.Vector3} position - Camera/player world position
     */
    update(position) {
        this._frameCount++;
        if (this._frameCount % this.updateFrequency !== 0) return;

        // Convert world position to chunk coordinates
        const chunkX = Math.floor(position.x / this.chunkSize);
        const chunkZ = Math.floor(position.z / this.chunkSize);

        // Skip if still in same chunk
        if (chunkX === this._currentChunkX && chunkZ === this._currentChunkZ) {
            return;
        }

        this._currentChunkX = chunkX;
        this._currentChunkZ = chunkZ;

        // Determine which chunks should be loaded
        const chunksToLoad = [];
        const loadedChunkKeys = new Set();

        for (let dx = -this.loadDistance; dx <= this.loadDistance; dx++) {
            for (let dz = -this.loadDistance; dz <= this.loadDistance; dz++) {
                const cx = chunkX + dx;
                const cz = chunkZ + dz;
                const key = `${cx},${cz}`;

                loadedChunkKeys.add(key);

                if (!this.chunks.has(key) && !this.loadingChunks.has(key)) {
                    chunksToLoad.push({ x: cx, z: cz, key });
                }
            }
        }

        // Sort by distance (load nearest first)
        chunksToLoad.sort((a, b) => {
            const distA = Math.abs(a.x - chunkX) + Math.abs(a.z - chunkZ);
            const distB = Math.abs(b.x - chunkX) + Math.abs(b.z - chunkZ);
            return distA - distB;
        });

        // Load chunks
        chunksToLoad.forEach(chunk => this._loadChunk(chunk.x, chunk.z));

        // Unload distant chunks
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const distance = Math.max(Math.abs(cx - chunkX), Math.abs(cz - chunkZ));

            if (distance > this.unloadDistance) {
                this._unloadChunk(key);
            }
        }

        // Update active chunks set
        this.activeChunks.clear();
        loadedChunkKeys.forEach(key => {
            if (this.chunks.has(key)) {
                this.activeChunks.add(key);
            }
        });
    }

    /**
     * Load a chunk
     * @private
     */
    async _loadChunk(x, z) {
        const key = `${x},${z}`;

        if (this.chunks.has(key) || this.loadingChunks.has(key)) {
            return;
        }

        this.loadingChunks.add(key);

        try {
            // Create base chunk container
            const chunk = new Chunk(x, z, this.chunkSize);
            this.chunks.set(key, chunk);

            // Notify all systems to populate this chunk
            const promises = [];
            for (const system of this.systems) {
                if (typeof system.onChunkLoad === 'function') {
                    // Systems can be async or sync
                    const result = system.onChunkLoad(chunk);
                    if (result instanceof Promise) {
                        promises.push(result);
                    }
                }
            }

            // Wait for critical systems if needed, but usually we want non-blocking
            // For now, we just let them load asynchronously
            await Promise.allSettled(promises);

        } catch (error) {
            console.error(`Failed to load chunk ${key}:`, error);
        } finally {
            this.loadingChunks.delete(key);
        }
    }

    /**
     * Unload a chunk
     * @private
     */
    _unloadChunk(key) {
        const chunk = this.chunks.get(key);

        if (!chunk) return;

        // Notify systems
        for (const system of this.systems) {
            if (typeof system.onChunkUnload === 'function') {
                system.onChunkUnload(chunk);
            }
        }

        chunk.dispose();
        this.chunks.delete(key);
        this.activeChunks.delete(key);
    }

    /**
     * Get a chunk by coordinates
     */
    getChunk(x, z) {
        return this.chunks.get(`${x},${z}`);
    }

    /**
     * Get all objects in a radius from a position
     */
    getObjectsInRadius(position, radius) {
        const objects = [];

        // Determine which chunks to query
        const minChunkX = Math.floor((position.x - radius) / this.chunkSize);
        const maxChunkX = Math.floor((position.x + radius) / this.chunkSize);
        const minChunkZ = Math.floor((position.z - radius) / this.chunkSize);
        const maxChunkZ = Math.floor((position.z + radius) / this.chunkSize);

        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
                const chunk = this.getChunk(cx, cz);
                if (chunk) {
                    objects.push(...chunk.objects);
                }
            }
        }

        return objects;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            loadedChunks: this.chunks.size,
            loadingChunks: this.loadingChunks.size,
            activeChunks: this.activeChunks.size,
            systems: this.systems.size,
            currentChunk: `${this._currentChunkX},${this._currentChunkZ}`
        };
    }

    /**
     * Force reload all chunks
     */
    reloadAll() {
        const keys = Array.from(this.chunks.keys());
        keys.forEach(key => this._unloadChunk(key));

        if (this._currentChunkX !== null) {
            this._currentChunkX = null;
            this._currentChunkZ = null;
        }
    }

    /**
     * Dispose all chunks
     */
    dispose() {
        for (const [key, chunk] of this.chunks) {
            this._unloadChunk(key); // Properly unload via systems
        }
        this.chunks.clear();
        this.loadingChunks.clear();
        this.activeChunks.clear();
        this.systems.clear();
    }
}

/**
 * Chunk - Represents a single world chunk
 */
export class Chunk {
    constructor(x, z, size, data = {}) {
        this.x = x;
        this.z = z;
        this.size = size;
        this.key = `${x},${z}`;

        // World position of chunk origin
        this.worldX = x * size;
        this.worldZ = z * size;

        // Chunk contents
        this.objects = data.objects || [];
        this.terrain = data.terrain || null;
        this.group = new THREE.Group();
        this.group.position.set(this.worldX, 0, this.worldZ);
        this.group.name = `Chunk_${this.key}`;

        // Add objects to group
        this.objects.forEach(obj => {
            if (obj instanceof THREE.Object3D) {
                this.group.add(obj);
            }
        });

        if (this.terrain) {
            this.group.add(this.terrain);
        }

        // Chunk state
        this.isLoaded = true;
        this.lastAccessTime = Date.now();
    }

    /**
     * Add an object to this chunk
     */
    addObject(object) {
        this.objects.push(object);
        this.group.add(object);
    }

    /**
     * Remove an object from this chunk
     */
    removeObject(object) {
        const index = this.objects.indexOf(object);
        if (index !== -1) {
            this.objects.splice(index, 1);
            this.group.remove(object);
        }
    }

    /**
     * Get bounds of this chunk
     */
    getBounds() {
        return new THREE.Box3(
            new THREE.Vector3(this.worldX, -1000, this.worldZ),
            new THREE.Vector3(this.worldX + this.size, 1000, this.worldZ + this.size)
        );
    }

    /**
     * Check if a position is within this chunk
     */
    containsPosition(position) {
        return (
            position.x >= this.worldX &&
            position.x < this.worldX + this.size &&
            position.z >= this.worldZ &&
            position.z < this.worldZ + this.size
        );
    }

    /**
     * Dispose chunk resources
     */
    dispose() {
        this.isLoaded = false;

        // Dispose all objects
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });

        this.objects = [];
        this.terrain = null;
    }
}
