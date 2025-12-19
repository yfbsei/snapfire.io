import * as THREE from 'three';

export class TerrainChunk {
    constructor(x, z, size) {
        this.x = x;
        this.z = z;
        this.size = size;
        this.lastSegments = -1;
        this.instanceId = -1;
        this.lastGeoId = -1;

        // Async state tracking
        this.pendingRequestId = null;
        this.isReady = false;

        // Bounding box for frustum culling
        this.boundingBox = new THREE.Box3(
            new THREE.Vector3(x - size / 2, -100, z - size / 2),
            new THREE.Vector3(x + size / 2, 100, z + size / 2)
        );

        // Cached geometry (reused for LOD changes)
        this.geometry = null;
    }

    /**
     * Apply pre-computed data from the worker
     * @param {Float32Array} positions - Vertex positions
     * @param {Float32Array} normals - Vertex normals
     * @param {Float32Array} uvs - Vertex UVs
     * @param {Uint32Array} indices - Triangle indices
     * @param {number} minHeight - Minimum height for bounding box
     * @param {number} maxHeight - Maximum height for bounding box
     * @param {number} segments - LOD segments used
     */
    applyWorkerData(positions, normals, uvs, indices, minHeight, maxHeight, segments) {
        // Dispose old geometry if exists
        if (this.geometry) {
            this.geometry.dispose();
        }

        // Create new geometry from worker data
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Update bounding box with actual heights
        this.boundingBox.min.y = minHeight;
        this.boundingBox.max.y = maxHeight;

        this.lastSegments = segments;
        this.isReady = true;
        this.pendingRequestId = null;

        return this.geometry;
    }

    /**
     * Get the current geometry (null if not ready)
     */
    getGeometry() {
        return this.geometry;
    }

    /**
     * Check if this chunk has a pending request that should be cancelled
     */
    hasPendingRequest() {
        return this.pendingRequestId !== null;
    }

    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
            this.geometry = null;
        }
        this.isReady = false;
        this.pendingRequestId = null;
    }
}
