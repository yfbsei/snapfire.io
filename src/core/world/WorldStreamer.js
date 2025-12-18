import * as THREE from 'three';

/**
 * WorldStreamer - Infinite World Chunk Manager
 * Loads/Unloads chunks based on player position.
 */
export class WorldStreamer {
    constructor(gameEngine, options = {}) {
        this.engine = gameEngine;
        this.params = {
            chunkSize: 64, // Units
            loadDistance: 2, // Chunks radius (2 = 5x5 grid)
            unloadDistance: 3,
            worldBounds: null, // Box3 or {minX, maxX, minZ, maxZ}
            ...options
        };

        this.chunks = new Map(); // "x,z" -> Chunk
        this.currentChunk = { x: null, z: null };
        this.isProcessing = false;
        this.systems = new Set();

        // Debug
        this.debugGroup = new THREE.Group();
        this.engine.scene.add(this.debugGroup);
    }

    /**
     * Register a system to be notified of chunk events
     * @param {Object} system
     */
    registerSystem(system) {
        this.systems.add(system);
        // Load for existing chunks
        for (const chunk of this.chunks.values()) {
            if (typeof system.onChunkLoad === 'function') {
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

    update(dt) {
        if (!this.engine.camera) return;

        const pos = this.engine.camera.position;
        const cx = Math.floor(pos.x / this.params.chunkSize);
        const cz = Math.floor(pos.z / this.params.chunkSize);

        // Check if moved to new chunk
        if (cx !== this.currentChunk.x || cz !== this.currentChunk.z) {
            this.currentChunk.x = cx;
            this.currentChunk.z = cz;
            console.log(`🌏 WorldStreamer: Moved to Chunk ${cx},${cz}`);
            this._updateChunks(cx, cz);
        }
    }

    _updateChunks(centerX, centerZ) {
        const loadDist = this.params.loadDistance;
        const keepDist = this.params.unloadDistance;

        // 1. Identify chunks to load
        for (let x = centerX - loadDist; x <= centerX + loadDist; x++) {
            for (let z = centerZ - loadDist; z <= centerZ + loadDist; z++) {
                // Check if chunk is within world bounds
                if (this.params.worldBounds) {
                    const worldX = x * this.params.chunkSize;
                    const worldZ = z * this.params.chunkSize;
                    const b = this.params.worldBounds;

                    // Check if ANY part of the chunk is within bounds
                    // A chunk at (x, z) covers [x*size, (x+1)*size]
                    if (worldX >= b.maxX || (worldX + this.params.chunkSize) <= b.minX ||
                        worldZ >= b.maxZ || (worldZ + this.params.chunkSize) <= b.minZ) {
                        continue;
                    }
                }

                const key = `${x},${z}`;
                if (!this.chunks.has(key)) {
                    this._loadChunk(key, x, z);
                }
            }
        }

        // 2. Identify chunks to unload
        for (const [key, chunk] of this.chunks) {
            const dist = Math.max(Math.abs(chunk.x - centerX), Math.abs(chunk.z - centerZ));
            if (dist > keepDist) {
                this._unloadChunk(key);
            }
        }
    }

    async _loadChunk(key, x, z) {
        const chunk = {
            key, x, z,
            loaded: false,
            group: new THREE.Group()
        };

        // Set position to chunk world origin
        chunk.group.position.set(x * this.params.chunkSize, 0, z * this.params.chunkSize);

        // Debug Visual (optional, can be disabled)
        // const size = this.params.chunkSize;
        // const helper = new THREE.GridHelper(size, 4, 0x444444, 0x222222);
        // helper.position.set(size / 2, 0, size / 2);
        // chunk.group.add(helper);

        this.chunks.set(key, chunk);

        // Notify systems
        for (const system of this.systems) {
            if (typeof system.onChunkLoad === 'function') {
                system.onChunkLoad(chunk);
            }
        }

        // Add to scene
        this.engine.scene.add(chunk.group);
        chunk.loaded = true;
    }

    _unloadChunk(key) {
        const chunk = this.chunks.get(key);
        if (chunk) {
            // Notify systems
            for (const system of this.systems) {
                if (typeof system.onChunkUnload === 'function') {
                    system.onChunkUnload(chunk);
                }
            }

            this.engine.scene.remove(chunk.group);
            this.chunks.delete(key);
        }
    }
}
