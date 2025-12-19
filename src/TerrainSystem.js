import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk.js';
import { Noise } from './Noise.js';

export class TerrainSystem {
    constructor(scene, customMaterial = null) {
        this.scene = scene;
        this.chunks = new Map();

        this.CHUNK_SIZE = 200;
        this.VIEW_RADIUS = 500;
        this.NOISE_SEED = 12345;

        // LOD Configuration (uniform to prevent gaps)
        this.UNIFORM_SEGMENTS = 4; // All chunks use same detail

        // Material setup
        this.ownsMaterial = !customMaterial;
        this.material = customMaterial || new THREE.MeshStandardMaterial({
            color: 0x3a5a40,
            roughness: 0.8,
            metalness: 0.2,
        });

        // BatchedMesh pooling
        this.maxInstances = 256;
        this.freeSlots = []; // Array of { instanceId, geometryId }
        this.activeChunksCount = 0;

        // BatchedMesh initialization (Optimized for 2km x 2km terrain)
        // Supports up to 256 chunks with ~16 segments each (or 100 chunks at 32 segments)
        this.batchedMesh = new THREE.BatchedMesh(this.maxInstances, 150000, 450000, this.material);
        this.batchedMesh.frustumCulled = false;
        this.scene.add(this.batchedMesh);

        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        this.chunkMatrix = new THREE.Matrix4();

        // Noise instance for height sampling
        this.noise = new Noise(this.NOISE_SEED);

        // Pre-generate fixed 4x4 grid (100mx100m)
        this._initFixedTerrain();
    }

    _initFixedTerrain() {
        // 10x10 grid = 2km x 2km terrain (with 200m chunks)
        for (let x = -5; x <= 4; x++) {
            for (let z = -5; z <= 4; z++) {
                const posX = x * this.CHUNK_SIZE;
                const posZ = z * this.CHUNK_SIZE;
                const key = `${x},${z}`;

                const chunk = new TerrainChunk(posX, posZ, this.CHUNK_SIZE);
                this.chunks.set(key, chunk);

                this._updateChunkLOD(chunk, this.UNIFORM_SEGMENTS);
            }
        }
    }

    getHeight(x, z) {
        // Find which chunk contains this point (floor division for correct chunk)
        const halfSize = this.CHUNK_SIZE / 2;
        const chunkIdxX = Math.floor((x + halfSize) / this.CHUNK_SIZE);
        const chunkIdxZ = Math.floor((z + halfSize) / this.CHUNK_SIZE);
        const key = `${chunkIdxX},${chunkIdxZ}`;

        const chunk = this.chunks.get(key);
        if (!chunk || !chunk.geometry) {
            // Fallback to noise if chunk not ready
            return this.noise.getNoise(x, z, 4, 0.5, 0.0035) * 45;
        }

        // Get local position within chunk (0 to CHUNK_SIZE)
        const localX = x - chunk.x + halfSize;
        const localZ = z - chunk.z + halfSize;

        // Calculate grid position
        const segments = this.UNIFORM_SEGMENTS;
        const step = this.CHUNK_SIZE / segments;

        const gridX = localX / step;
        const gridZ = localZ / step;

        // Clamp grid indices to valid range
        const ix = Math.max(0, Math.min(segments - 1, Math.floor(gridX)));
        const iz = Math.max(0, Math.min(segments - 1, Math.floor(gridZ)));

        const ix1 = Math.min(segments, ix + 1);
        const iz1 = Math.min(segments, iz + 1);

        // Get heights from geometry
        const positions = chunk.geometry.attributes.position.array;
        const width = segments + 1;

        const h00 = positions[(iz * width + ix) * 3 + 1];
        const h10 = positions[(iz * width + ix1) * 3 + 1];
        const h01 = positions[(iz1 * width + ix) * 3 + 1];
        const h11 = positions[(iz1 * width + ix1) * 3 + 1];

        // Triangle-accurate interpolation (matches mesh triangulation)
        const fx = Math.max(0, Math.min(1, gridX - ix));
        const fz = Math.max(0, Math.min(1, gridZ - iz));

        if (fx + fz < 1) {
            // Triangle 1: a(0,0), c(0,1), b(1,0)
            return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
        } else {
            // Triangle 2: c(0,1), d(1,1), b(1,0)
            return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
        }
    }

    _updateChunkLOD(chunk, segments) {
        if (chunk.lastSegments === segments && chunk.isReady) return;

        const data = this._generateChunkData(chunk.x, chunk.z, chunk.size, segments);
        const geometry = chunk.applyWorkerData(
            data.positions,
            data.normals,
            data.uvs,
            data.indices,
            data.minHeight,
            data.maxHeight,
            segments
        );

        this._applyChunkToBatchedMesh(chunk, geometry);
    }

    _generateChunkData(x, z, size, segments) {
        const vertexCount = (segments + 1) * (segments + 1);
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);

        const step = size / segments;
        const halfSize = size / 2;

        let minHeight = Infinity;
        let maxHeight = -Infinity;

        let idx = 0;
        for (let iz = 0; iz <= segments; iz++) {
            for (let ix = 0; ix <= segments; ix++) {
                const localX = ix * step - halfSize;
                const localZ = iz * step - halfSize;
                const worldX = localX + x;
                const worldZ = localZ + z;

                const height = this.getHeight(worldX, worldZ);

                positions[idx] = localX;
                positions[idx + 1] = height;
                positions[idx + 2] = localZ;

                const uvIdx = (iz * (segments + 1) + ix) * 2;
                uvs[uvIdx] = ix / segments;
                uvs[uvIdx + 1] = iz / segments;

                minHeight = Math.min(minHeight, height);
                maxHeight = Math.max(maxHeight, height);
                idx += 3;
            }
        }

        // Compute Normals
        const width = segments + 1;
        for (let iz = 0; iz <= segments; iz++) {
            for (let ix = 0; ix <= segments; ix++) {
                const nIdx = (iz * width + ix) * 3;
                const getHeight = (gx, gz) => {
                    const cx = Math.max(0, Math.min(segments, gx));
                    const cz = Math.max(0, Math.min(segments, gz));
                    return positions[(cz * width + cx) * 3 + 1];
                };
                const hL = getHeight(ix - 1, iz);
                const hR = getHeight(ix + 1, iz);
                const hD = getHeight(ix, iz - 1);
                const hU = getHeight(ix, iz + 1);
                const nx = (hL - hR) / (2 * step);
                const nz = (hD - hU) / (2 * step);
                const ny = 1.0;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                normals[nIdx] = nx / len;
                normals[nIdx + 1] = ny / len;
                normals[nIdx + 2] = nz / len;
            }
        }

        // Generate Indices
        const indexCount = segments * segments * 6;
        const indices = new Uint32Array(indexCount);
        let iIdx = 0;
        for (let iz = 0; iz < segments; iz++) {
            for (let ix = 0; ix < segments; ix++) {
                const a = iz * width + ix;
                const b = iz * width + ix + 1;
                const c = (iz + 1) * width + ix;
                const d = (iz + 1) * width + ix + 1;
                indices[iIdx++] = a; indices[iIdx++] = c; indices[iIdx++] = b;
                indices[iIdx++] = c; indices[iIdx++] = d; indices[iIdx++] = b;
            }
        }

        return { positions, normals, uvs, indices, minHeight, maxHeight };
    }

    _applyChunkToBatchedMesh(chunk, geometry) {
        if (!geometry) return;

        if (chunk.instanceId === -1) {
            if (this.freeSlots.length > 0) {
                const slot = this.freeSlots.pop();
                chunk.instanceId = slot.instanceId;
                chunk.lastGeoId = slot.geometryId;
                this.batchedMesh.setGeometryAt(chunk.lastGeoId, geometry);
                this.batchedMesh.setVisibleAt(chunk.instanceId, true);
            } else if (this.activeChunksCount < this.maxInstances) {
                chunk.lastGeoId = this.batchedMesh.addGeometry(geometry, 512, 1536);
                chunk.instanceId = this.batchedMesh.addInstance(chunk.lastGeoId);
                this.activeChunksCount++;
            }
        } else {
            this.batchedMesh.setGeometryAt(chunk.lastGeoId, geometry);
        }

        this.chunkMatrix.makeTranslation(chunk.x, 0, chunk.z);
        this.batchedMesh.setMatrixAt(chunk.instanceId, this.chunkMatrix);
    }

    update(playerPosition, camera) {
        // Update frustum for culling
        if (camera) {
            camera.updateMatrixWorld();
            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
            this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        }

        let visibleCount = 0;
        let visibleChunks = [];
        const maxViewDistance = 450; // Slightly beyond fade distance (400m) for smooth transition

        for (const chunk of this.chunks.values()) {
            // Distance culling
            const dx = chunk.x - playerPosition.x;
            const dz = chunk.z - playerPosition.z;
            const distSq = dx * dx + dz * dz;
            const maxDistSq = maxViewDistance * maxViewDistance;

            // Frustum + Distance Culling
            const inRange = distSq < maxDistSq;
            const inFrustum = this.frustum.intersectsBox(chunk.boundingBox);
            const isVisible = inRange && inFrustum;

            if (chunk.instanceId !== -1) {
                this.batchedMesh.setVisibleAt(chunk.instanceId, isVisible);
            }
            if (isVisible) {
                visibleCount++;
                visibleChunks.push(`(${chunk.x},${chunk.z})`);
            }
        }

        // DEBUG: Log visible chunks with positions
        const camPos = camera ? `cam(${Math.round(camera.position.x)},${Math.round(camera.position.y)},${Math.round(camera.position.z)})` : 'no cam';
        console.log(`${camPos} Visible: ${visibleCount}/${this.chunks.size}`);
    }

    dispose() {
        this.chunks.forEach(chunk => chunk.dispose());
        this.chunks.clear();

        if (this.ownsMaterial && this.material) {
            this.material.dispose();
        }

        this.scene.remove(this.batchedMesh);
        this.batchedMesh.dispose();
    }
}
