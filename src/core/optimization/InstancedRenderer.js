import * as THREE from 'three';

/**
 * InstancedRenderer - Efficiently render many copies of the same mesh
 * Uses THREE.InstancedMesh for GPU-optimized batch rendering
 */
export class InstancedRenderer {
    constructor() {
        // Map of mesh key -> InstancedBatch
        this.batches = new Map();

        // Maximum instances per batch
        this.maxInstancesPerBatch = 10000;

        // Instance color support
        this.useInstanceColors = true;

        // Stats
        this.stats = {
            totalBatches: 0,
            totalInstances: 0,
            drawCalls: 0
        };
    }

    /**
     * Generate a key for a geometry+material combination
     */
    getBatchKey(geometry, material) {
        const geoId = geometry.uuid;
        const matId = material.uuid;
        return `${geoId}_${matId}`;
    }

    /**
     * Add an instance to a batch
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Material} material 
     * @param {THREE.Matrix4} matrix - World transform matrix
     * @param {THREE.Color} color - Optional instance color
     * @returns {Object} Instance reference for later updates
     */
    addInstance(geometry, material, matrix, color = null) {
        const key = this.getBatchKey(geometry, material);

        let batch = this.batches.get(key);

        if (!batch || batch.count >= this.maxInstancesPerBatch) {
            // Create new batch
            batch = this.createBatch(geometry, material, key);
            this.batches.set(`${key}_${Date.now()}`, batch);
        }

        // Add instance to batch
        const index = batch.count;
        batch.mesh.setMatrixAt(index, matrix);

        if (color && batch.mesh.instanceColor) {
            batch.mesh.setColorAt(index, color);
        }

        batch.count++;
        batch.mesh.count = batch.count;
        batch.mesh.instanceMatrix.needsUpdate = true;

        if (batch.mesh.instanceColor) {
            batch.mesh.instanceColor.needsUpdate = true;
        }

        return {
            batch,
            index,
            key
        };
    }

    /**
     * Create a new instanced batch
     */
    createBatch(geometry, material, key) {
        const mesh = new THREE.InstancedMesh(
            geometry,
            material,
            this.maxInstancesPerBatch
        );

        mesh.count = 0;
        mesh.frustumCulled = false; // We handle culling ourselves
        mesh.userData.batchKey = key;

        // Initialize instance colors if enabled
        if (this.useInstanceColors) {
            mesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(this.maxInstancesPerBatch * 3),
                3
            );
        }

        const batch = {
            mesh,
            count: 0,
            key,
            matrices: [],
            colors: []
        };

        this.stats.totalBatches++;

        return batch;
    }

    /**
     * Update an existing instance's transform
     * @param {Object} instanceRef - Reference from addInstance
     * @param {THREE.Matrix4} matrix 
     */
    updateInstanceMatrix(instanceRef, matrix) {
        if (!instanceRef || !instanceRef.batch) return;

        instanceRef.batch.mesh.setMatrixAt(instanceRef.index, matrix);
        instanceRef.batch.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Update an existing instance's color
     * @param {Object} instanceRef 
     * @param {THREE.Color} color 
     */
    updateInstanceColor(instanceRef, color) {
        if (!instanceRef || !instanceRef.batch) return;
        if (!instanceRef.batch.mesh.instanceColor) return;

        instanceRef.batch.mesh.setColorAt(instanceRef.index, color);
        instanceRef.batch.mesh.instanceColor.needsUpdate = true;
    }

    /**
     * Create instances from an array of transforms
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Material} material 
     * @param {THREE.Matrix4[]} matrices 
     * @param {THREE.Color[]} colors 
     * @returns {THREE.InstancedMesh}
     */
    createInstancedMesh(geometry, material, matrices, colors = null) {
        const count = matrices.length;
        const mesh = new THREE.InstancedMesh(geometry, material, count);

        matrices.forEach((matrix, i) => {
            mesh.setMatrixAt(i, matrix);
        });

        if (colors && colors.length === count) {
            colors.forEach((color, i) => {
                mesh.setColorAt(i, color);
            });
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
            mesh.instanceColor.needsUpdate = true;
        }

        return mesh;
    }

    /**
     * Add all batches to a scene
     * @param {THREE.Scene} scene 
     */
    addToScene(scene) {
        for (const batch of this.batches.values()) {
            if (batch.count > 0 && !scene.children.includes(batch.mesh)) {
                scene.add(batch.mesh);
            }
        }
    }

    /**
     * Remove all batches from a scene
     * @param {THREE.Scene} scene 
     */
    removeFromScene(scene) {
        for (const batch of this.batches.values()) {
            scene.remove(batch.mesh);
        }
    }

    /**
     * Get all batch meshes for manual scene management
     * @returns {THREE.InstancedMesh[]}
     */
    getBatchMeshes() {
        return Array.from(this.batches.values()).map(b => b.mesh);
    }

    /**
     * Get rendering statistics
     */
    getStats() {
        let totalInstances = 0;
        for (const batch of this.batches.values()) {
            totalInstances += batch.count;
        }

        return {
            totalBatches: this.batches.size,
            totalInstances,
            // Each non-empty batch = 1 draw call
            drawCalls: Array.from(this.batches.values()).filter(b => b.count > 0).length
        };
    }

    /**
     * Clear all batches
     */
    clear() {
        for (const batch of this.batches.values()) {
            batch.mesh.dispose();
        }
        this.batches.clear();
        this.stats.totalBatches = 0;
    }

    /**
     * Dispose of resources
     */
    dispose() {
        this.clear();
    }
}

/**
 * Helper to create instanced vegetation, debris, etc.
 */
export class InstancedScatter {
    /**
     * Scatter instances across a surface
     * @param {THREE.BufferGeometry} geometry - Mesh to instance
     * @param {THREE.Material} material 
     * @param {Object} options 
     * @returns {THREE.InstancedMesh}
     */
    static scatter(geometry, material, options = {}) {
        const {
            count = 100,
            area = { min: new THREE.Vector3(-10, 0, -10), max: new THREE.Vector3(10, 0, 10) },
            scaleRange = { min: 0.8, max: 1.2 },
            rotationRange = { min: 0, max: Math.PI * 2 },
            alignToNormal = false,
            seed = 12345
        } = options;

        // Simple seeded random
        let s = seed;
        const random = () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };

        const mesh = new THREE.InstancedMesh(geometry, material, count);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            // Random position within area
            position.set(
                area.min.x + random() * (area.max.x - area.min.x),
                area.min.y + random() * (area.max.y - area.min.y),
                area.min.z + random() * (area.max.z - area.min.z)
            );

            // Random rotation (Y-axis for standing objects)
            rotation.set(
                0,
                rotationRange.min + random() * (rotationRange.max - rotationRange.min),
                0
            );
            quaternion.setFromEuler(rotation);

            // Random uniform scale
            const s = scaleRange.min + random() * (scaleRange.max - scaleRange.min);
            scale.set(s, s, s);

            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(i, matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }
}
