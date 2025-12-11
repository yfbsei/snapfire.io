/**
 * Vegetation System
 * 
 * Handles loading glTF vegetation assets and distributing them across the terrain
 * using thin instances for efficient GPU rendering.
 * 
 * ============================================================================
 * CRITICAL: glTF MESH VISIBILITY FIX
 * ============================================================================
 * 
 * BabylonJS glTF imported meshes have internal transform/hierarchy issues that
 * prevent them from rendering correctly when:
 * - You change their position/rotation/scale
 * - You apply new materials to them
 * - You use them as thin instance sources
 * 
 * THE FIX: Clone the raw vertex data into a fresh Mesh:
 * 
 *   const positions = importedMesh.getVerticesData('position');
 *   const indices = importedMesh.getIndices();
 *   const normals = importedMesh.getVerticesData('normal');
 *   
 *   const vertexData = new VertexData();
 *   vertexData.positions = positions;
 *   vertexData.indices = indices;
 *   vertexData.normals = normals;
 *   vertexData.applyToMesh(freshMesh);  // Fresh mesh works correctly!
 * 
 * This bypasses the glTF hierarchy/transform issues completely.
 * 
 * ============================================================================
 * GRASS MODEL DETAILS
 * ============================================================================
 * 
 * - Source: src/asset/world/grass_plants/
 * - Original scale: ~14cm (0.137m max height) - VERY SMALL!
 * - Each glTF contains 17 different grass mesh variations
 * - Material uses alphaMode: "BLEND" (transparent grass blades)
 * - Scale factor of 15x renders grass at ~2-3m height
 * 
 * ============================================================================
 */

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import '@babylonjs/loaders/glTF';
import { VegetationConfig, VegetationAsset } from './vegetation-config';

interface LoadedAsset {
    asset: VegetationAsset;
    mesh: Mesh;
}

export class VegetationSystem {
    private scene: Scene;
    private config: VegetationConfig;
    // Store list of meshes for each asset (e.g. grass blade + flower)
    private loadedAssets: Map<string, Mesh[]> = new Map();
    // Store all chunk meshes created for distribution
    private distributedMeshes: Mesh[] = [];

    constructor(scene: Scene, config: VegetationConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Load all vegetation assets from glTF files.
     * Uses Reference-based Thin Instances (Proper Method).
     */
    async loadAssets(): Promise<void> {
        console.log('🌲 Loading vegetation assets...');
        this.loadedAssets.clear();

        for (const asset of this.config.assets) {
            try {
                console.log(`  Loading: ${asset.name}`);

                const result = await SceneLoader.ImportMeshAsync(
                    '',
                    '',
                    asset.modelPath,
                    this.scene
                );

                // Filter for actual geometry meshes
                const geometryMeshes: Mesh[] = [];

                // The first mesh is usually __root__. We can keep it or parenting logic.
                // We just need to find all meshes that are capable of rendering.
                for (const mesh of result.meshes) {
                    if (mesh instanceof Mesh) {
                        // Ensure mesh is not a robust root or transform node without geometry
                        if (mesh.getTotalVertices() > 0) {
                            // Enable it (default), but thin instances will control rendering
                            mesh.isVisible = true;
                            // Optimization: prevent raycasts on these thousands of instances if needed
                            mesh.isPickable = false;
                            // Freeze world matrix if static (optional, good for static nature)
                            mesh.freezeWorldMatrix();
                            // Do NOT set alwaysSelectAsActiveMesh=true globally unless needed, 
                            // but for thin instances that span the map, it's often required 
                            // provided we don't implement chunking.
                            mesh.alwaysSelectAsActiveMesh = true;

                            geometryMeshes.push(mesh);
                        }
                    }
                }

                if (geometryMeshes.length === 0) {
                    console.warn(`  ⚠️ No geometry found in ${asset.name}`);
                    continue;
                }

                // If there is a root node (switching coordinate systems), keep it.
                // We don't dispose the result.

                this.loadedAssets.set(asset.name, geometryMeshes);
                console.log(`  ✅ Loaded: ${asset.name} (${geometryMeshes.length} primitives)`);

            } catch (error) {
                console.warn(`  ⚠️ Failed to load ${asset.name}:`, error);
            }
        }

        console.log(`🌲 Loaded ${this.loadedAssets.size}/${this.config.assets.length} vegetation assets`);
    }

    /**
     * Distribute vegetation across the terrain using CHUNKING for performance.
     * Divides terrain into a grid (e.g. 10x10) and creates separate meshes for each chunk.
     * This enables frustum culling to skip processing instances outside the camera view.
     */
    distributeVegetation(terrain: GroundMesh): void {
        console.log('🌿 Distributing vegetation on terrain with CHUNKING...');

        // Clear any previously distributed meshes
        this.distributedMeshes.forEach(m => m.dispose());
        this.distributedMeshes = [];

        const terrainSize = this.config.terrainSize;
        const halfSize = terrainSize / 2;

        // Chunk configuration
        const GRID_RES = 10; // 10x10 grid = 100 chunks
        const chunkSize = terrainSize / GRID_RES;

        for (const asset of this.config.assets) {
            const sourceMeshes = this.loadedAssets.get(asset.name);
            if (!sourceMeshes || sourceMeshes.length === 0) continue;

            // Ensure source meshes are invisible, as they are just templates
            sourceMeshes.forEach(m => {
                m.isVisible = false;
                m.isPickable = false;
            });

            // Calculate total density target to report
            let totalInstances = 0;

            console.log(`  Processing chunks for ${asset.name}...`);
            const startTime = performance.now();

            // Iterate through grid cells
            for (let gx = 0; gx < GRID_RES; gx++) {
                for (let gz = 0; gz < GRID_RES; gz++) {

                    // Define chunk bounds
                    const minX = -halfSize + (gx * chunkSize);
                    const maxX = minX + chunkSize;
                    const minZ = -halfSize + (gz * chunkSize);
                    const maxZ = minZ + chunkSize;

                    // Calculate area of this chunk (simple square)
                    // Note: In a real scenario, you might mask out water/paths here
                    const chunkArea100m = (chunkSize * chunkSize) / 100;

                    // Instances for this chunk
                    let instanceCount = Math.floor(
                        asset.density * chunkArea100m * this.config.globalDensityMultiplier
                    );

                    if (instanceCount <= 0) continue;

                    // Generate matrices for this chunk
                    const matricesData = new Float32Array(instanceCount * 16);
                    let validInstances = 0;

                    // Reusable temps
                    const scaling = Vector3.Zero();
                    const rotation = Quaternion.Identity();
                    const position = Vector3.Zero();
                    const matrix = Matrix.Identity();

                    for (let i = 0; i < instanceCount; i++) {
                        const x = minX + Math.random() * chunkSize;
                        const z = minZ + Math.random() * chunkSize;

                        const height = terrain.getHeightAtCoordinates(x, z);

                        // Skip if height is invalid (e.g., outside terrain bounds or NaN)
                        if (height === null || height === undefined || isNaN(height)) {
                            continue;
                        }

                        // Slope Check (Advanced) - For now just height

                        const baseScale = 15;
                        const s = baseScale * (asset.minScale + Math.random() * (asset.maxScale - asset.minScale));
                        scaling.set(s, s, s);

                        const rotY = asset.randomRotation ? Math.random() * Math.PI * 2 : 0;
                        Quaternion.FromEulerAnglesToRef(0, rotY, 0, rotation);

                        position.set(x, height, z);

                        Matrix.ComposeToRef(scaling, rotation, position, matrix);
                        matrix.copyToArray(matricesData, validInstances * 16);
                        validInstances++;
                    }

                    if (validInstances > 0) {
                        // Create a CLONE of the geometry for this chunk
                        // We clone ALL sub-meshes (parts) of the asset
                        sourceMeshes.forEach((sourceMesh, index) => {
                            // Create clone
                            const chunkMesh = sourceMesh.clone(`${asset.name}_${gx}_${gz}_${index}`);

                            // Important: Clone shares geometry but has own world matrix / thin instances
                            chunkMesh.isVisible = true;
                            chunkMesh.isPickable = false;
                            chunkMesh.alwaysSelectAsActiveMesh = false; // ALLOW CULLING! Critical fix.
                            chunkMesh.receiveShadows = true; // Receive shadows for grounding

                            // Apply buffer (subarray for exact count)
                            // We share the SAME buffer across all parts of the multipart mesh (stem, flower)
                            // because they share the same instance transforms.
                            const buffer = matricesData.subarray(0, validInstances * 16);
                            chunkMesh.thinInstanceSetBuffer('matrix', buffer, 16, true);

                            // Freeze generic world matrix computation for performance
                            chunkMesh.freezeWorldMatrix();

                            this.distributedMeshes.push(chunkMesh);
                        });

                        totalInstances += validInstances;
                    }
                }
            }

            const duration = performance.now() - startTime;
            console.log(`  ✅ ${asset.name}: Placed ${totalInstances} instances in ${duration.toFixed(0)}ms`);
        }

        console.log('🌿 Vegetation distribution complete!');
    }

    dispose(): void {
        this.loadedAssets.forEach((meshes) => {
            meshes.forEach(m => m.dispose());
        });
        this.loadedAssets.clear();

        // Dispose distributed chunks
        this.distributedMeshes.forEach(m => m.dispose());
        this.distributedMeshes = [];
    }
}
