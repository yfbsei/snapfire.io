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
            ...options
        };

        this.chunks = new Map(); // "x,z" -> Chunk
        this.currentChunk = { x: null, z: null };
        this.isProcessing = false;

        // Debug
        this.debugGroup = new THREE.Group();
        this.engine.scene.add(this.debugGroup);
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
        // Placeholder: Create a logical chunk object
        // In a real implementation, this fetches data from a server or procedural generator
        // Using AssetStreaming to fetch a GLTF or Heightmap

        const chunk = {
            x, z,
            loaded: false,
            object: new THREE.Group()
        };

        // Debug Visual
        const size = this.params.chunkSize;
        const helper = new THREE.GridHelper(size, 4, 0x444444, 0x222222);
        helper.position.set(x * size + size / 2, 0, z * size + size / 2);
        chunk.object.add(helper);

        // Simulate Async Load
        this.chunks.set(key, chunk); // Reserve spot

        // Add to scene
        this.engine.scene.add(chunk.object);
        chunk.loaded = true;

        // console.log(`Loaded Chunk ${key}`);
    }

    _unloadChunk(key) {
        const chunk = this.chunks.get(key);
        if (chunk) {
            this.engine.scene.remove(chunk.object);
            // Dispose geometries/materials if specific to this chunk
            this.chunks.delete(key);
            // console.log(`Unloaded Chunk ${key}`);
        }
    }
}
