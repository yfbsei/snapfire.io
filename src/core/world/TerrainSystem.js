import * as THREE from 'three';

/**
 * TerrainSystem - Heightmap-based terrain for open-world games
 * Supports chunked terrain, LOD, and texture splatting
 */
export class TerrainSystem {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 100;  // World units per chunk
        this.resolution = options.resolution || 128; // Vertices per chunk side
        this.maxHeight = options.maxHeight || 50;    // Maximum terrain height

        this.chunks = new Map(); // "x,z" -> TerrainChunk
        this.material = null;

        // LOD settings
        this.lodLevels = options.lodLevels || [1, 2, 4, 8]; // Resolution divisors
        this.lodDistances = options.lodDistances || [100, 200, 400, 800];

        // Texture layers for splatting
        this.textureLayers = [];

        this.init();
    }

    /**
     * Initialize terrain material
     */
    init() {
        // Default terrain material with vertex colors for splatting
        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: false,
            roughness: 0.8,
            metalness: 0.1
        });
    }

    /**
     * Generate terrain from heightmap data
     * @param {number} chunkX - Chunk X coordinate
     * @param {number} chunkZ - Chunk Z coordinate  
     * @param {number[]|Float32Array} heightData - Height values (0-1)
     * @returns {TerrainChunk}
     */
    generateChunk(chunkX, chunkZ, heightData = null) {
        const key = `${chunkX},${chunkZ}`;

        if (this.chunks.has(key)) {
            return this.chunks.get(key);
        }

        // Generate procedural heights if not provided
        if (!heightData) {
            heightData = this._generateProceduralHeights(chunkX, chunkZ);
        }

        // Create geometry
        const geometry = new THREE.PlaneGeometry(
            this.chunkSize,
            this.chunkSize,
            this.resolution - 1,
            this.resolution - 1
        );
        geometry.rotateX(-Math.PI / 2);

        // Apply heights
        const positions = geometry.attributes.position.array;
        const colors = [];

        for (let i = 0; i < positions.length; i += 3) {
            const vertexIndex = i / 3;
            const height = heightData[vertexIndex] || 0;
            positions[i + 1] = height * this.maxHeight;

            // Generate vertex colors based on height/slope for splatting
            const normalizedHeight = height;
            const color = this._getTerrainColor(normalizedHeight);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // Create mesh
        const mesh = new THREE.Mesh(geometry, this.material.clone());
        mesh.position.set(
            chunkX * this.chunkSize + this.chunkSize / 2,
            0,
            chunkZ * this.chunkSize + this.chunkSize / 2
        );
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.name = `Terrain_${key}`;

        const chunk = new TerrainChunk(chunkX, chunkZ, mesh, heightData, this);
        this.chunks.set(key, chunk);

        return chunk;
    }

    /**
     * Generate procedural heights using simplex-like noise
     * @private
     */
    _generateProceduralHeights(chunkX, chunkZ) {
        const heights = new Float32Array(this.resolution * this.resolution);

        for (let z = 0; z < this.resolution; z++) {
            for (let x = 0; x < this.resolution; x++) {
                const worldX = chunkX * this.chunkSize + (x / (this.resolution - 1)) * this.chunkSize;
                const worldZ = chunkZ * this.chunkSize + (z / (this.resolution - 1)) * this.chunkSize;

                // Multi-octave noise approximation
                let height = 0;
                height += this._noise(worldX * 0.01, worldZ * 0.01) * 0.5;
                height += this._noise(worldX * 0.02, worldZ * 0.02) * 0.25;
                height += this._noise(worldX * 0.05, worldZ * 0.05) * 0.125;
                height += this._noise(worldX * 0.1, worldZ * 0.1) * 0.0625;

                // Normalize to 0-1
                height = (height + 1) / 2;

                heights[z * this.resolution + x] = height;
            }
        }

        return heights;
    }

    /**
     * Simple noise function (sine-based approximation)
     * @private
     */
    _noise(x, z) {
        return Math.sin(x * 1.7 + z * 0.3) * 0.5 +
            Math.cos(z * 2.1 - x * 0.7) * 0.3 +
            Math.sin((x + z) * 0.8) * 0.2;
    }

    /**
     * Get terrain color based on height
     * @private
     */
    _getTerrainColor(height) {
        // Simple gradient: water -> grass -> rock -> snow
        if (height < 0.3) {
            return new THREE.Color(0x3d6b4f); // Dark grass
        } else if (height < 0.5) {
            return new THREE.Color(0x4a7c4e); // Grass
        } else if (height < 0.7) {
            return new THREE.Color(0x7a6b5a); // Rock
        } else if (height < 0.85) {
            return new THREE.Color(0x8a7a6a); // Light rock
        } else {
            return new THREE.Color(0xe8e8e8); // Snow
        }
    }

    /**
     * Get height at world position
     */
    getHeightAt(worldX, worldZ) {
        const chunkX = Math.floor(worldX / this.chunkSize);
        const chunkZ = Math.floor(worldZ / this.chunkSize);
        const chunk = this.chunks.get(`${chunkX},${chunkZ}`);

        if (!chunk) return 0;

        return chunk.getHeightAt(worldX, worldZ);
    }

    /**
     * Get chunk at world position
     */
    getChunkAt(worldX, worldZ) {
        const chunkX = Math.floor(worldX / this.chunkSize);
        const chunkZ = Math.floor(worldZ / this.chunkSize);
        return this.chunks.get(`${chunkX},${chunkZ}`);
    }

    /**
     * Remove a chunk
     */
    removeChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);

        if (chunk) {
            chunk.dispose();
            this.chunks.delete(key);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            chunkCount: this.chunks.size,
            chunkSize: this.chunkSize,
            resolution: this.resolution
        };
    }

    /**
     * Dispose all terrain resources
     */
    dispose() {
        for (const [key, chunk] of this.chunks) {
            chunk.dispose();
        }
        this.chunks.clear();
        this.material.dispose();
    }
}

/**
 * TerrainChunk - Single terrain chunk
 */
export class TerrainChunk {
    constructor(x, z, mesh, heightData, terrainSystem) {
        this.x = x;
        this.z = z;
        this.key = `${x},${z}`;
        this.mesh = mesh;
        this.heightData = heightData;
        this.terrainSystem = terrainSystem;

        // World bounds
        this.worldX = x * terrainSystem.chunkSize;
        this.worldZ = z * terrainSystem.chunkSize;
        this.size = terrainSystem.chunkSize;
        this.resolution = terrainSystem.resolution;
    }

    /**
     * Get height at world position (bilinear interpolation)
     */
    getHeightAt(worldX, worldZ) {
        // Convert to local coordinates (0 to size)
        const localX = worldX - this.worldX;
        const localZ = worldZ - this.worldZ;

        // Convert to grid coordinates
        const gridX = (localX / this.size) * (this.resolution - 1);
        const gridZ = (localZ / this.size) * (this.resolution - 1);

        // Get integer and fractional parts
        const x0 = Math.floor(gridX);
        const z0 = Math.floor(gridZ);
        const x1 = Math.min(x0 + 1, this.resolution - 1);
        const z1 = Math.min(z0 + 1, this.resolution - 1);
        const xf = gridX - x0;
        const zf = gridZ - z0;

        // Get heights at corners
        const h00 = this.heightData[z0 * this.resolution + x0] || 0;
        const h10 = this.heightData[z0 * this.resolution + x1] || 0;
        const h01 = this.heightData[z1 * this.resolution + x0] || 0;
        const h11 = this.heightData[z1 * this.resolution + x1] || 0;

        // Bilinear interpolation
        const h0 = h00 * (1 - xf) + h10 * xf;
        const h1 = h01 * (1 - xf) + h11 * xf;

        return (h0 * (1 - zf) + h1 * zf) * this.terrainSystem.maxHeight;
    }

    /**
     * Dispose chunk resources
     */
    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
