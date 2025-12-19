import * as THREE from 'three';
import { TerrainChunk } from './TerrainChunk.js';
import { Noise } from './Noise.js';

export class TerrainSystem {
    constructor(scene, customMaterial = null) {
        this.scene = scene;
        this.chunks = new Map();

        this.CHUNK_SIZE = 200;
        this.VIEW_RADIUS = 1000;
        this.updateThreshold = 50;
        this.lastUpdatePos = new THREE.Vector3(Infinity, Infinity, Infinity);
        this.NOISE_SEED = 12345;

        // LOD Configuration
        this.LOD_LEVELS = [
            { distance: 300, segments: 64 },
            { distance: 600, segments: 32 },
            { distance: 1000, segments: 16 }
        ];

        // Material setup
        this.material = customMaterial || new THREE.MeshStandardMaterial({
            color: 0x3a5a40,
            roughness: 0.8,
            metalness: 0.2,
        });

        // BatchedMesh pooling
        this.maxInstances = 256;
        this.freeSlots = []; // Array of { instanceId, geometryId }
        this.activeChunksCount = 0;

        // BatchedMesh initialization
        this.batchedMesh = new THREE.BatchedMesh(this.maxInstances, 1500000, 7000000, this.material);
        this.batchedMesh.frustumCulled = false;
        this.scene.add(this.batchedMesh);

        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        this.chunkMatrix = new THREE.Matrix4();

        // Web Worker for async terrain generation
        this.worker = new Worker(new URL('./TerrainWorker.js', import.meta.url), { type: 'module' });
        this.pendingRequests = new Map(); // requestId -> { chunk, segments }
        this.nextRequestId = 0;
        this.workerReady = false;

        // Initialize worker with noise seed
        this.worker.postMessage({ type: 'init', seed: this.NOISE_SEED });

        // Handle worker responses
        this.worker.onmessage = (e) => this._handleWorkerMessage(e);

        // Noise instance for CPU-side height sampling
        this.noise = new Noise(this.NOISE_SEED);
    }

    getHeight(x, z) {
        // Must match TerrainWorker.js formula: noise.getNoise(worldX, worldZ, 4, 0.5, 0.005) * 50
        return this.noise.getNoise(x, z, 4, 0.5, 0.005) * 50;
    }

    _handleWorkerMessage(e) {
        const { type, id, positions, normals, uvs, indices, minHeight, maxHeight, segments } = e.data;

        if (type === 'ready') {
            this.workerReady = true;
            console.log('🌍 TerrainWorker initialized');
            return;
        }

        if (type === 'result') {
            const request = this.pendingRequests.get(id);
            if (!request) {
                // Request was cancelled (chunk unloaded or LOD changed)
                return;
            }

            this.pendingRequests.delete(id);
            const { chunk, segments: requestedSegments } = request;

            // Verify the chunk still needs this data
            if (chunk.pendingRequestId !== id) {
                return;
            }

            // Apply the worker data to create geometry
            const geometry = chunk.applyWorkerData(
                positions,
                normals,
                uvs,
                indices,
                minHeight,
                maxHeight,
                segments
            );

            // Now add geometry to BatchedMesh
            this._applyChunkToBatchedMesh(chunk, geometry);
        }
    }

    _applyChunkToBatchedMesh(chunk, geometry) {
        if (!geometry) return;

        if (chunk.instanceId === -1) {
            if (this.freeSlots.length > 0) {
                // Reuse a pooled slot
                const slot = this.freeSlots.pop();
                chunk.instanceId = slot.instanceId;
                chunk.lastGeoId = slot.geometryId;
                this.batchedMesh.setGeometryAt(chunk.lastGeoId, geometry);
                this.batchedMesh.setVisibleAt(chunk.instanceId, true);
            } else if (this.activeChunksCount < this.maxInstances) {
                // Create brand new slot
                chunk.lastGeoId = this.batchedMesh.addGeometry(geometry, 4225, 24576);
                chunk.instanceId = this.batchedMesh.addInstance(chunk.lastGeoId);
                this.activeChunksCount++;
            } else {
                console.warn('TerrainSystem: Maximum BatchedMesh instances reached!');
                return;
            }
        } else {
            // LOD change: reuse the existing geometry slot
            this.batchedMesh.setGeometryAt(chunk.lastGeoId, geometry);
        }

        // Set position matrix
        this.chunkMatrix.makeTranslation(chunk.x, 0, chunk.z);
        this.batchedMesh.setMatrixAt(chunk.instanceId, this.chunkMatrix);
    }

    update(playerPosition, camera) {
        if (this.lastUpdatePos.distanceTo(playerPosition) < this.updateThreshold) {
            // Still update frustum culling even if position hasn't changed much
        }

        this.lastUpdatePos.copy(playerPosition);

        // Update frustum for culling
        if (camera) {
            this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
        }

        this._updateVisibleChunks(playerPosition);
    }

    _getRequiredLOD(distance) {
        for (const level of this.LOD_LEVELS) {
            if (distance < level.distance) return level.segments;
        }
        return this.LOD_LEVELS[this.LOD_LEVELS.length - 1].segments;
    }

    _updateVisibleChunks(playerPosition) {
        const playerChunkX = Math.round(playerPosition.x / this.CHUNK_SIZE);
        const playerChunkZ = Math.round(playerPosition.z / this.CHUNK_SIZE);
        const chunksInRadius = Math.ceil(this.VIEW_RADIUS / this.CHUNK_SIZE);

        const activeKeys = new Set();

        for (let x = -chunksInRadius; x <= chunksInRadius; x++) {
            for (let z = -chunksInRadius; z <= chunksInRadius; z++) {
                const chunkX = playerChunkX + x;
                const chunkZ = playerChunkZ + z;
                const posX = chunkX * this.CHUNK_SIZE;
                const posZ = chunkZ * this.CHUNK_SIZE;

                const dist = Math.sqrt(Math.pow(posX - playerPosition.x, 2) + Math.pow(posZ - playerPosition.z, 2));
                if (dist > this.VIEW_RADIUS) continue;

                const key = `${chunkX},${chunkZ}`;
                activeKeys.add(key);

                let chunk = this.chunks.get(key);
                const requiredSegments = this._getRequiredLOD(dist);

                if (!chunk) {
                    chunk = new TerrainChunk(posX, posZ, this.CHUNK_SIZE);
                    this.chunks.set(key, chunk);
                }

                // Frustum Culling & LOD management
                const isVisible = this.frustum.intersectsBox(chunk.boundingBox);

                if (isVisible) {
                    // Check if we need to request new geometry
                    const needsNewGeometry = !chunk.isReady || chunk.lastSegments !== requiredSegments;
                    const hasPendingWithWrongLOD = chunk.pendingRequestId !== null &&
                        this.pendingRequests.get(chunk.pendingRequestId)?.segments !== requiredSegments;

                    if (needsNewGeometry && !chunk.hasPendingRequest()) {
                        // Request new geometry from worker
                        this._requestChunkGeneration(chunk, requiredSegments);
                    } else if (hasPendingWithWrongLOD) {
                        // LOD changed while request was pending - cancel and request new
                        this.pendingRequests.delete(chunk.pendingRequestId);
                        this._requestChunkGeneration(chunk, requiredSegments);
                    }

                    // Only update visibility/matrix if the instance exists
                    if (chunk.instanceId !== -1) {
                        this.batchedMesh.setVisibleAt(chunk.instanceId, true);
                        this.chunkMatrix.makeTranslation(chunk.x, 0, chunk.z);
                        this.batchedMesh.setMatrixAt(chunk.instanceId, this.chunkMatrix);
                    }
                } else {
                    if (chunk.instanceId !== -1) {
                        this.batchedMesh.setVisibleAt(chunk.instanceId, false);
                    }
                }
            }
        }

        // Unload chunks - properly free resources by pooling
        for (const [key, chunk] of this.chunks.entries()) {
            if (!activeKeys.has(key)) {
                // Cancel any pending requests
                if (chunk.pendingRequestId !== null) {
                    this.pendingRequests.delete(chunk.pendingRequestId);
                }

                if (chunk.instanceId !== -1) {
                    this.batchedMesh.setVisibleAt(chunk.instanceId, false);
                    this.freeSlots.push({
                        instanceId: chunk.instanceId,
                        geometryId: chunk.lastGeoId
                    });
                }
                chunk.dispose();
                this.chunks.delete(key);
            }
        }
    }

    _requestChunkGeneration(chunk, segments) {
        if (!this.workerReady) return;

        const requestId = this.nextRequestId++;
        chunk.pendingRequestId = requestId;

        this.pendingRequests.set(requestId, { chunk, segments });

        this.worker.postMessage({
            type: 'generate',
            id: requestId,
            x: chunk.x,
            z: chunk.z,
            size: chunk.size,
            segments: segments
        });
    }

    dispose() {
        // Terminate worker
        this.worker.terminate();

        // Clear pending requests
        this.pendingRequests.clear();

        // Dispose chunks
        this.chunks.forEach(chunk => chunk.dispose());
        this.chunks.clear();

        // Dispose material and mesh
        this.material.dispose();
        this.scene.remove(this.batchedMesh);
        this.batchedMesh.dispose();
    }
}
