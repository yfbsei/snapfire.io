import * as THREE from 'three';

/**
 * HLODSystem - Hierarchical Level of Detail
 * Optimizes static object rendering by merging geometries into BatchedMesh.
 * 
 * Features:
 * - Automatically merges compatible static meshes
 * - Reduces draw calls significantly
 * - Supports frustum culling per sub-geometry
 */
export class HLODSystem {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.batches = new Map(); // Map<MaterialUUID, BatchedMesh>
        this.batchMap = new Map(); // Map<GameObjectUUID, {batch: BatchedMesh, id: geometryId}>
    }

    /**
     * Convert a list of static game objects into a highly optimized batch
     * @param {GameObject[]} gameObjects 
     */
    createStaticBatch(gameObjects) {
        console.log(`🏗️ HLOD: Batching ${gameObjects.length} static objects...`);

        // Group by material
        const groups = new Map(); // Map<Material, Mesh[]>

        for (const go of gameObjects) {
            if (!go.object3D) continue;

            go.object3D.traverse(child => {
                if (child.isMesh && child.geometry) {
                    let material = child.material;
                    // Handle array materials by taking the first one (simplification for now) (BatchedMesh restriction)
                    if (Array.isArray(material)) material = material[0];

                    if (!groups.has(material)) {
                        groups.set(material, []);
                    }
                    groups.get(material).push({ mesh: child, go: go });
                }
            });
        }

        // Create a BatchedMesh for each unique material group
        for (const [material, items] of groups) {
            this._createBatchForMaterial(material, items);
        }
    }

    _createBatchForMaterial(material, items) {
        const geometryCount = items.length;
        // Calculate total vertex/index count
        let maxVertexCount = 0;
        let maxIndexCount = 0;

        for (const item of items) {
            const geom = item.mesh.geometry;
            maxVertexCount += geom.attributes.position.count;
            if (geom.index) maxIndexCount += geom.index.count;
        }

        // Create BatchedMesh
        const batchedMesh = new THREE.BatchedMesh(
            geometryCount,
            maxVertexCount,
            maxIndexCount,
            material
        );

        // Add geometries
        for (const item of items) {
            const geometryId = batchedMesh.addGeometry(item.mesh.geometry);

            // Apply transform
            // We need world matrix of the mesh relative to the batch root (usually 0,0,0)
            item.mesh.updateMatrixWorld();
            batchedMesh.setMatrixAt(geometryId, item.mesh.matrixWorld);

            // Store reference for updates (if needed)
            this.batchMap.set(item.go.uuid, {
                batch: batchedMesh,
                id: geometryId
            });

            // Hide original mesh as it's now in the batch
            item.mesh.visible = false;
            // Better: Remove from scene entirely if possible, but keep GO logic?
            // For static props, we can just hide the visual representation.
        }

        batchedMesh.name = `HLOD_Batch_${material.uuid}`;
        batchedMesh.castShadow = true;
        batchedMesh.receiveShadow = true;

        this.scene.add(batchedMesh);

        // Track unique batches
        if (!this.batches.has(material.uuid)) {
            this.batches.set(material.uuid, batchedMesh);
        }

        console.log(`📦 Created BatchedMesh with ${geometryCount} Geometries for Material ${material.name || 'Unnamed'}`);
    }

    /**
     * Cleanup and dispose batches
     */
    dispose() {
        for (const batch of this.batches.values()) {
            this.scene.remove(batch);
            batch.dispose();
        }
        this.batches.clear();
        this.batchMap.clear();
    }
}
