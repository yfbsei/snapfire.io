import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';

export interface TerrainInfo {
    ground: GroundMesh;
    maxHeight: number;
    getHeightAtCoordinates: (x: number, z: number) => number;
}

export async function createTerrain(scene: Scene, shadowGenerator: ShadowGenerator): Promise<TerrainInfo> {
    // Terrain configuration
    const terrainConfig = {
        width: 1000,          // Width of terrain (1km)
        height: 1000,         // Depth of terrain (1km)
        subdivisions: 256,    // Subdivisions for collision
        minHeight: 0,         // Minimum terrain height
        maxHeight: 75,        // Maximum terrain height (scaled for 1km terrain)
        heightmapPath: '/assets/heightmap/heightmap.png' // Path to your heightmap
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
                    console.log('Terrain loaded successfully!');

                    // Add physics to terrain
                    new PhysicsAggregate(
                        mesh,
                        PhysicsShapeType.MESH,
                        { mass: 0, restitution: 0.2, friction: 0.8 },
                        scene
                    );

                    // Enable shadows
                    mesh.receiveShadows = true;

                    // Create invisible collision floor as safety net (prevents falling through world)
                    const safetyFloor = MeshBuilder.CreateGround(
                        'safetyFloor',
                        { width: 1500, height: 1500 },
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
                        }
                    });
                }
            },
            scene
        );

        // Create terrain material
        const terrainMaterial = new StandardMaterial('terrainMaterial', scene);

        // You can customize the terrain appearance here
        // Option 1: Use the heatmap as a texture
        terrainMaterial.diffuseTexture = new Texture(terrainConfig.heightmapPath, scene);

        // Option 2: Use solid colors (comment out the line above and uncomment below)
        // terrainMaterial.diffuseColor = new Color3(0.4, 0.6, 0.3); // Green terrain

        terrainMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
        terrainMaterial.specularPower = 32;

        // Apply material to terrain
        ground.material = terrainMaterial;

        // Position terrain
        ground.position = new Vector3(0, 0, 0);
    });
}

