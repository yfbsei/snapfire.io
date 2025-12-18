import * as THREE from 'three';

/**
 * TerrainSystem - Heightmap-based terrain with chunking and LOD
 * Optimized for open-world games
 */
export class TerrainSystem {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.scene = engine.scene;

        // Terrain settings
        this.chunkSize = options.chunkSize ?? 64;      // Vertices per chunk side
        this.chunkWorldSize = options.chunkWorldSize ?? 100; // World units per chunk
        this.maxHeight = options.maxHeight ?? 50;
        this.lodLevels = options.lodLevels ?? 3;
        this.viewDistance = options.viewDistance ?? 3;  // Chunks to render around player

        // Material
        this.material = options.material || this._createDefaultMaterial();

        // Chunks storage
        this.chunks = new Map(); // "x,z" -> TerrainChunk
        this.loadedChunks = new Set();

        // Heightmap source
        this.heightmapGenerator = options.heightmapGenerator || this._defaultHeightGenerator.bind(this);

        // Player position tracking
        this._lastChunkX = null;
        this._lastChunkZ = null;

        // Performance
        this.updateFrequency = options.updateFrequency ?? 10;
        this._frameCount = 0;
    }

    /**
     * Create default terrain material
     */
    _createDefaultMaterial() {
        return new THREE.MeshStandardMaterial({
            color: 0x3a7d44,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false,
            side: THREE.FrontSide
        });
    }

    /**
     * Default procedural height generator using noise
     */
    _defaultHeightGenerator(worldX, worldZ) {
        // Multi-octave noise for terrain
        let height = 0;
        let amplitude = 1;
        let frequency = 0.005;

        for (let i = 0; i < 4; i++) {
            height += Math.sin(worldX * frequency + i * 1000) *
                Math.cos(worldZ * frequency + i * 1000) * amplitude;
            height += Math.sin((worldX + worldZ) * frequency * 1.5) * amplitude * 0.5;

            amplitude *= 0.5;
            frequency *= 2;
        }

        return (height + 1) * 0.5 * this.maxHeight;
    }

    /**
     * Set custom heightmap generator
     * @param {Function} generator - (worldX, worldZ) => height
     */
    setHeightmapGenerator(generator) {
        this.heightmapGenerator = generator;
    }

    /**
     * Load heightmap from image
     * @param {string} imagePath
     * @returns {Promise}
     */
    async loadHeightmap(imagePath) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                imagePath,
                (texture) => {
                    const canvas = document.createElement('canvas');
                    const img = texture.image;
                    canvas.width = img.width;
                    canvas.height = img.height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                    this.heightmapGenerator = (worldX, worldZ) => {
                        // Map world coords to image coords
                        const u = (worldX / this.chunkWorldSize + 0.5) * canvas.width;
                        const v = (worldZ / this.chunkWorldSize + 0.5) * canvas.height;

                        const x = Math.floor(u) % canvas.width;
                        const z = Math.floor(v) % canvas.height;
                        const i = (z * canvas.width + x) * 4;

                        return (imageData.data[i] / 255) * this.maxHeight;
                    };

                    resolve();
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Set material for terrain
     * @param {THREE.Material} material
     */
    setMaterial(material) {
        this.material = material;
        // Update existing chunks
        for (const [, chunk] of this.chunks) {
            chunk.mesh.material = material;
        }
    }

    /**
     * Create splat material with multiple textures
     * @param {Object} textures - { grass, rock, dirt, sand }
     */
    async createSplatMaterial(textures) {
        const textureLoader = this.engine.assets || new THREE.TextureLoader();

        const loadTex = async (path) => {
            if (typeof textureLoader.loadTexture === 'function') {
                return await textureLoader.loadTexture(path, { repeat: { x: 20, y: 20 } });
            } else {
                return new Promise(resolve => {
                    new THREE.TextureLoader().load(path, (t) => {
                        t.wrapS = t.wrapT = THREE.RepeatWrapping;
                        t.repeat.set(20, 20);
                        resolve(t);
                    });
                });
            }
        };

        const grassTex = textures.grass ? await loadTex(textures.grass) : null;

        if (grassTex) {
            this.material = new THREE.MeshStandardMaterial({
                map: grassTex,
                roughness: 0.8
            });
        }
    }

    /**
     * Update terrain chunks based on camera/player position
     * @deprecated Use ChunkManager and onChunkLoad instead
     * @param {THREE.Vector3} position
     */
    update(position) {
        // Deprecated: Logic moved to ChunkManager
    }

    /**
     * Called by ChunkManager when a chunk is loaded
     * @param {Chunk} chunk 
     */
    onChunkLoad(chunk) {
        if (this.chunks.has(chunk.key)) return;

        const terrainChunk = new TerrainChunk(this, chunk.x, chunk.z);
        this.chunks.set(chunk.key, terrainChunk);

        // Add to the chunk's group instead of the scene directly
        if (chunk.group) {
            // Position mesh at middle of chunk since TerrainChunk is centered
            const size = this.chunkWorldSize;
            terrainChunk.mesh.position.set(size / 2, 0, size / 2);
            chunk.group.add(terrainChunk.mesh);
        } else {
            this.scene.add(terrainChunk.mesh);
        }

        // Store reference on chunk for easy access
        chunk.terrain = terrainChunk;
    }

    /**
     * Called by ChunkManager when a chunk is unloaded
     * @param {Chunk} chunk 
     */
    onChunkUnload(chunk) {
        const terrainChunk = this.chunks.get(chunk.key);
        if (terrainChunk) {
            terrainChunk.dispose();

            if (chunk.group) {
                chunk.group.remove(terrainChunk.mesh);
            } else {
                this.scene.remove(terrainChunk.mesh);
            }

            this.chunks.delete(chunk.key);
        }
    }

    /**
     * Load a terrain chunk
     */
    _loadChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) return;

        const chunk = new TerrainChunk(this, chunkX, chunkZ);
        this.chunks.set(key, chunk);
        this.scene.add(chunk.mesh);
    }

    /**
     * Unload a terrain chunk
     */
    _unloadChunk(key, chunk) {
        chunk.dispose();
        this.scene.remove(chunk.mesh);
        this.chunks.delete(key);
    }

    /**
     * Get terrain height at world position
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {number}
     */
    getHeightAt(worldX, worldZ) {
        return this.heightmapGenerator(worldX, worldZ);
    }

    /**
     * Get terrain normal at world position
     * @param {number} worldX
     * @param {number} worldZ
     * @returns {THREE.Vector3}
     */
    getNormalAt(worldX, worldZ) {
        const delta = 0.5;
        const hL = this.getHeightAt(worldX - delta, worldZ);
        const hR = this.getHeightAt(worldX + delta, worldZ);
        const hD = this.getHeightAt(worldX, worldZ - delta);
        const hU = this.getHeightAt(worldX, worldZ + delta);

        const normal = new THREE.Vector3(hL - hR, 2 * delta, hD - hU);
        return normal.normalize();
    }

    /**
     * Raycast against terrain
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction
     * @param {number} maxDistance
     * @returns {Object|null}
     */
    raycast(origin, direction, maxDistance = 1000) {
        const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, maxDistance);
        const meshes = Array.from(this.chunks.values()).map(c => c.mesh);
        const intersects = raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            return {
                point: intersects[0].point,
                normal: intersects[0].face.normal,
                distance: intersects[0].distance
            };
        }
        return null;
    }

    /**
     * Dispose all terrain resources
     */
    dispose() {
        for (const [key, chunk] of this.chunks) {
            chunk.dispose();
            this.scene.remove(chunk.mesh);
        }
        this.chunks.clear();

        if (this.material) {
            this.material.dispose();
        }
    }
}

/**
 * TerrainChunk - Single terrain segment
 */
class TerrainChunk {
    constructor(terrain, chunkX, chunkZ) {
        this.terrain = terrain;
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.key = `${chunkX},${chunkZ}`;

        // World position of chunk center
        const size = terrain.chunkWorldSize;
        this.worldX = chunkX * size + size / 2;
        this.worldZ = chunkZ * size + size / 2;

        // Create geometry
        this.geometry = this._createGeometry();

        // Create mesh
        this.mesh = new THREE.Mesh(this.geometry, terrain.material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = false;
        this.mesh.name = `Terrain_${this.key}`;
    }

    _createGeometry() {
        const size = this.terrain.chunkWorldSize;
        const segments = this.terrain.chunkSize - 1;

        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position.array;

        // Apply heightmap
        // PlaneGeometry vertices are centered around (0,0), ranging from -size/2 to +size/2
        // The mesh is positioned at (worldX, 0, worldZ)
        // So the actual world position of a vertex at local position (lx, 0, lz) is:
        //   world x = worldX + lx
        //   world z = worldZ + lz
        for (let i = 0; i < positions.length; i += 3) {
            const localX = positions[i];
            const localZ = positions[i + 2];

            // Calculate world coordinates - mesh.position + vertex.localPosition
            // Note: vertex local coords range from -size/2 to +size/2
            const worldX = this.worldX + localX;
            const worldZ = this.worldZ + localZ;

            positions[i + 1] = this.terrain.heightmapGenerator(worldX, worldZ);
        }

        geometry.computeVertexNormals();
        geometry.attributes.position.needsUpdate = true;

        return geometry;
    }

    dispose() {
        this.geometry.dispose();
    }
}
