import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk.js';
import { Noise } from './Noise.js';

export class TerrainSystem {
    constructor(scene, customMaterial = null) {
        this.scene = scene;
        this.chunks = new Map();

        this.CHUNK_SIZE = 100;
        this.VIEW_RADIUS = 200;
        this.NOISE_SEED = 12345;

        // LOD Configuration (High resolution for smooth hills)
        this.UNIFORM_SEGMENTS = 64;

        // Material setup
        this.ownsMaterial = !customMaterial;
        this.material = customMaterial || new THREE.MeshStandardMaterial({
            color: 0x3a5a40,
            roughness: 0.8,
            metalness: 0.2,
        });

        // BatchedMesh pooling
        this.maxInstances = 4;
        this.freeSlots = [];
        this.activeChunksCount = 0;

        // BatchedMesh initialization (Budget for 4 chunks @ 64x64 segments each)
        // 4225 vertices and 24576 indices per chunk
        this.batchedMesh = new THREE.BatchedMesh(this.maxInstances, 20000, 100000, this.material);
        this.batchedMesh.frustumCulled = false;
        this.scene.add(this.batchedMesh);

        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        this.chunkMatrix = new THREE.Matrix4();

        // Noise instance for height sampling
        this.noise = new Noise(this.NOISE_SEED);

        this._initFixedTerrain();
    }

    _initFixedTerrain() {
        // Single 100m x 100m terrain chunk at origin
        const chunk = new TerrainChunk(0, 0, this.CHUNK_SIZE);
        this.chunks.set('0,0', chunk);
        this._updateChunkLOD(chunk, this.UNIFORM_SEGMENTS);
    }

    getHeight(x, z) {
        // Broad, gentle rolling hills
        return this.noise.getNoise(x, z, 2, 0.5, 0.02) * 8;
    }

    getNormal(x, z) {
        const eps = 0.5;
        const hL = this.getHeight(x - eps, z);
        const hR = this.getHeight(x + eps, z);
        const hD = this.getHeight(x, z - eps);
        const hU = this.getHeight(x, z + eps);

        const normal = new THREE.Vector3(
            (hL - hR) / (2 * eps),
            1.0,
            (hD - hU) / (2 * eps)
        ).normalize();

        return normal;
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
                chunk.lastGeoId = this.batchedMesh.addGeometry(geometry, 5000, 30000);
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
        if (camera) {
            camera.updateMatrixWorld();
            camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
            this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        }

        const maxViewDistance = 450;

        for (const chunk of this.chunks.values()) {
            const dx = chunk.x - playerPosition.x;
            const dz = chunk.z - playerPosition.z;
            const distSq = dx * dx + dz * dz;
            const maxDistSq = maxViewDistance * maxViewDistance;

            const inRange = distSq < maxDistSq;
            const inFrustum = this.frustum.intersectsBox(chunk.boundingBox);
            const isVisible = inRange && inFrustum;

            if (chunk.instanceId !== -1) {
                this.batchedMesh.setVisibleAt(chunk.instanceId, isVisible);
            }
        }
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
