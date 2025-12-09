/**
 * Terrain Creation Module
 * 
 * Creates heightmap-based terrain with multi-layer PBR texturing.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { TerrainConfig, defaultTerrainConfig } from './TerrainConfig';
import { TerrainMaterial } from './TerrainMaterial';

export interface TerrainInfo {
    /** The ground mesh */
    ground: GroundMesh;
    /** Maximum terrain height */
    maxHeight: number;
    /** Get height at world coordinates */
    getHeightAtCoordinates: (x: number, z: number) => number;
    /** The terrain material instance for runtime updates */
    material: TerrainMaterial;
}

/**
 * Creates terrain from heightmap with multi-layer PBR texturing
 * 
 * @param scene - The Babylon.js scene
 * @param shadowGenerator - Shadow generator for receiving shadows
 * @param config - Optional terrain configuration (uses defaults if not provided)
 * @returns Promise resolving to TerrainInfo with ground mesh and utilities
 */
export async function createTerrain(
    scene: Scene,
    shadowGenerator: ShadowGenerator,
    config: Partial<TerrainConfig> = {}
): Promise<TerrainInfo> {
    // Merge with defaults
    const terrainConfig: TerrainConfig = {
        ...defaultTerrainConfig,
        ...config,
        textures: {
            ...defaultTerrainConfig.textures,
            ...config.textures,
        },
        blending: {
            ...defaultTerrainConfig.blending,
            ...config.blending,
        },
    };

    return new Promise((resolve) => {
        // Create ground from heightmap
        const ground = MeshBuilder.CreateGroundFromHeightMap(
            'terrain',
            terrainConfig.heightmapPath,
            {
                width: terrainConfig.width,
                height: terrainConfig.height,
                subdivisions: terrainConfig.subdivisions,
                minHeight: terrainConfig.minHeight,
                maxHeight: terrainConfig.maxHeight,
                onReady: (mesh) => {
                    console.log('[Terrain] Heightmap loaded successfully!');

                    // Add physics to terrain
                    new PhysicsAggregate(
                        mesh,
                        PhysicsShapeType.MESH,
                        { mass: 0, restitution: 0.2, friction: 0.8 },
                        scene
                    );

                    // Enable shadows
                    mesh.receiveShadows = true;

                    // Create invisible collision floor as safety net
                    const safetyFloor = MeshBuilder.CreateGround(
                        'safetyFloor',
                        { width: terrainConfig.width * 1.5, height: terrainConfig.height * 1.5 },
                        scene
                    );
                    safetyFloor.position = new Vector3(0, -1, 0);
                    safetyFloor.isVisible = false;
                    safetyFloor.checkCollisions = true;
                    new PhysicsAggregate(
                        safetyFloor,
                        PhysicsShapeType.BOX,
                        { mass: 0, restitution: 0, friction: 1 },
                        scene
                    );

                    // Resolve with terrain info
                    const groundMesh = mesh as GroundMesh;
                    resolve({
                        ground: groundMesh,
                        maxHeight: terrainConfig.maxHeight,
                        getHeightAtCoordinates: (x: number, z: number) => {
                            return groundMesh.getHeightAtCoordinates(x, z) ?? terrainConfig.maxHeight;
                        },
                        material: terrainMaterial,
                    });
                },
            },
            scene
        );

        // Create and apply terrain material
        const terrainMaterial = new TerrainMaterial(scene, terrainConfig);
        ground.material = terrainMaterial.getMaterial();

        // Position terrain at origin
        ground.position = new Vector3(0, 0, 0);

        // Update camera position for specular when camera moves
        scene.registerBeforeRender(() => {
            if (scene.activeCamera) {
                terrainMaterial.updateCameraPosition(scene.activeCamera.position);
            }
        });

        console.log('[Terrain] Multi-layer PBR material applied');
    });
}
