/**
 * Water Creation Module
 * 
 * Creates realistic water using GLTF animated model with morph targets
 * for wave deformation, combined with Babylon.js WaterMaterial for
 * reflections and refractions.
 */

import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// import { Texture } from '@babylonjs/core/Materials/Textures/texture'; (Removed)
// import { WaterMaterial } from '@babylonjs/materials/water/waterMaterial';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
// import { AssetContainer } from '@babylonjs/core/assetContainer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { WaterConfig, defaultWaterConfig } from './WaterConfig';
import { TerrainInfo } from '../terrain/createTerrain';

// Required for GLTF loading
import '@babylonjs/loaders/glTF';

interface PondLocation {
    position: Vector3;
    scale: number;
}

export interface WaterInfo {
    /** The water meshes (may be multiple from GLTF) */
    meshes: AbstractMesh[];
    /** The water material for runtime updates (Removed) */
    // material: WaterMaterial;
    /** Animation groups from GLTF (if using GLTF water) */
    animationGroups: AnimationGroup[];
    /** Add a mesh to the reflection/refraction render list */
    addToRenderList: (mesh: Mesh) => void;
    /** Dispose of water resources */
    dispose: () => void;
}

/**
 * Creates water with realistic reflections, refractions, and animated waves
 * 
 * @param scene - The Babylon.js scene
 * @param meshesToReflect - Array of meshes to reflect/refract in the water
 * @param config - Optional water configuration (uses defaults if not provided)
 * @returns Promise<WaterInfo> with meshes, material, animations, and utility functions
 */
export async function createWater(
    scene: Scene,
    meshesToReflect: Mesh[] = [],
    terrainInfo: TerrainInfo,
    config: Partial<WaterConfig> = {}
): Promise<WaterInfo> {
    // Merge with defaults
    const waterConfig: WaterConfig = {
        ...defaultWaterConfig,
        ...config,
    };

    console.log('[Water] Creating water surface at Y =', waterConfig.waterLevel);
    console.log('[Water] Using GLTF water:', waterConfig.useGLTFWater);

    let waterMeshes: AbstractMesh[] = [];
    let animationGroups: AnimationGroup[] = [];

    if (waterConfig.useGLTFWater) {
        // Load GLTF water model
        console.log('[Water] Loading GLTF water from:', waterConfig.gltfPath);

        try {
            // Load asset into container first (so we can instantiate multiple times)
            const container = await SceneLoader.LoadAssetContainerAsync(
                '',  // Root URL handled by path
                waterConfig.gltfPath,
                scene
            );

            // Scan terrain for pond locations
            // Scan terrain for pond locations
            const pondLocations = scanForPonds(terrainInfo, waterConfig);
            console.log(`[Water] Found ${pondLocations.length} potential pond locations`);

            // Instantiate water at each location
            for (const pond of pondLocations) {
                const entries = container.instantiateModelsToScene((name) => name); // Keep original names (or random sufix)
                const root = entries.rootNodes[0] as TransformNode; // Assuming first root is the main container

                if (root) {
                    // Position
                    root.position = pond.position;
                    // Scale
                    const scale = pond.scale;
                    root.scaling = new Vector3(scale, scale, scale);
                    // Rotation
                    root.rotation = waterConfig.gltfRotation;

                    // Track meshes and animations
                    waterMeshes.push(...(entries.rootNodes as AbstractMesh[])); // Add roots (may handle children differently, but simplest for now)
                    // Actually, we should track all meshes for disposal
                    entries.rootNodes.forEach(n => {
                        const childMeshes = n.getChildMeshes(false);
                        waterMeshes.push(...childMeshes);
                    });

                    animationGroups.push(...entries.animationGroups);
                }
            }

            // Start all animations
            for (const animGroup of animationGroups) {
                animGroup.speedRatio = waterConfig.animationSpeed;
                animGroup.start(true);
            }

        } catch (error) {
            console.error('[Water] Failed to load GLTF water:', error);
            waterConfig.useGLTFWater = false;
        }
    }

    // Fallback if no GLTF or procedural placement found nothing (and we want at least one?)
    // For now, if procedural found nothing, we get no water. Correct.

    // Create fallback mesh if not using GLTF (Legacy mode)
    if (!waterConfig.useGLTFWater) {
        console.log('[Water] Using legacy water mesh');
        const waterMesh = MeshBuilder.CreateGround(
            'waterMesh',
            {
                width: waterConfig.width,
                height: waterConfig.depth,
                subdivisions: waterConfig.subdivisions,
            },
            scene
        );
        waterMesh.position = new Vector3(0, waterConfig.waterLevel, 0);
        waterMeshes = [waterMesh];
    }

    // WaterMaterial logic removed as requested
    /*
    // Create water material for reflections and refractions
    const waterMaterial = new WaterMaterial(
        'waterMaterial',
        scene,
        new Vector2(512, 512) // Render target size for reflections/refractions
    );

    // Set bump texture for wave surface detail
    waterMaterial.bumpTexture = new Texture(waterConfig.bumpTexturePath, scene);

    // Configure wave behavior (these affect the visual appearance, not the GLTF geometry)
    waterMaterial.windForce = waterConfig.windForce;
    waterMaterial.waveHeight = waterConfig.useGLTFWater ? 0 : waterConfig.waveHeight; // Disable wave height if using GLTF
    waterMaterial.bumpHeight = waterConfig.bumpHeight;
    waterMaterial.windDirection = waterConfig.windDirection;
    waterMaterial.waveLength = waterConfig.waveLength;
    waterMaterial.waveSpeed = waterConfig.waveSpeed;

    // Configure water appearance
    waterMaterial.waterColor = waterConfig.waterColor;
    waterMaterial.colorBlendFactor = waterConfig.colorBlendFactor;

    // Add meshes to reflection/refraction render list
    for (const mesh of meshesToReflect) {
        waterMaterial.addToRenderList(mesh);
    }

    // Apply water material to all water meshes
    // ONLY if NOT using GLTF water (or if we want to override it, but user requested original look)
    if (!waterConfig.useGLTFWater) {
        for (const mesh of waterMeshes) {
            if (mesh instanceof Mesh && mesh.geometry) {
                mesh.material = waterMaterial;
                mesh.isPickable = false;
            }
        }
    }
    */

    // Freeze transforms for performance (but keep animations running)
    // Only freeze if NOT using GLTF animations
    if (!waterConfig.useGLTFWater) {
        for (const mesh of waterMeshes) {
            if (mesh instanceof Mesh) {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
            }
        }
    }

    console.log('[Water] Water surface created with', meshesToReflect.length, 'meshes in render list');

    return {
        meshes: waterMeshes,
        // material: waterMaterial,
        animationGroups,
        // addToRenderList: (mesh: Mesh) => {}, // No-op
        addToRenderList: (_mesh: Mesh) => { },
        dispose: () => {
            // Stop animations
            for (const animGroup of animationGroups) {
                animGroup.stop();
                animGroup.dispose();
            }
            // Dispose meshes
            for (const mesh of waterMeshes) {
                mesh.dispose();
            }
            // Dispose material
            // waterMaterial.dispose();
        },
    };
}

/**
 * Scan terrain for locations that are below the water level
 */
/**
 * Scan terrain using "Radial Rim Probe" to find valid basins
 */
function scanForPonds(terrainInfo: TerrainInfo, config: WaterConfig): PondLocation[] {
    const locations: PondLocation[] = [];
    const numSamples = 200; // Number of random probes to attempt
    const bounds = 1000; // Half-width of terrain
    const halfBounds = bounds / 2;
    const probeRadius = 150; // Distance to check for rim

    for (let i = 0; i < numSamples; i++) {
        // Random probe position
        const x = (Math.random() * bounds) - halfBounds;
        const z = (Math.random() * bounds) - halfBounds;

        const centerHeight = terrainInfo.getHeightAtCoordinates(x, z);

        // Radial Probe: Check 8 points around the circle
        let minRimHeight = Number.MAX_VALUE;
        let isBasin = true;

        for (let angle = 0; angle < 360; angle += 45) {
            const rad = angle * (Math.PI / 180);
            const px = x + Math.cos(rad) * probeRadius;
            const pz = z + Math.sin(rad) * probeRadius;
            const h = terrainInfo.getHeightAtCoordinates(px, pz);

            // Use the LOWEST point on the rim as the spillway
            if (h < minRimHeight) {
                minRimHeight = h;
            }
        }

        // Validate: The lowest point on the rim must still be significantly higher than the center
        // This ensures it's a "bowl" and not a slope/valley that flows out
        const minDepth = 2.0;
        if (minRimHeight > centerHeight + minDepth) {
            // Valid Basin!

            // Calculate Water Level
            // Bias towards the rim but keep it safe (e.g. 90% up from bottom, or 10% down from rim)
            // Using WaterFillRatio logic:
            const basinDepth = minRimHeight - centerHeight;
            const waterLevel = centerHeight + (basinDepth * config.waterFillRatio);

            // Random Scale
            const scale = config.pondMinScale + (Math.random() * (config.pondMaxScale - config.pondMinScale));

            locations.push({
                position: new Vector3(x, waterLevel, z),
                scale: scale
            });
        }
    }

    // Fallback if random sampling failed hard
    if (locations.length === 0) {
        console.warn('[Water] No ponds found via random sampling. Adding fallback.');
        const centerHeight = terrainInfo.getHeightAtCoordinates(0, 0);
        locations.push({
            position: new Vector3(0, centerHeight + 2.0, 0),
            scale: config.pondMinScale
        });
    }

    return locations;
}
