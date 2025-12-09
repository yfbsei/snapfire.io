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
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
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

    console.log('[Water] Creating water surface');
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
            const pondLocations = scanForPonds(terrainInfo, waterConfig);
            console.log(`[Water] Found ${pondLocations.length} potential pond locations`);

            // Instantiate water at each location
            for (const pond of pondLocations) {
                const entries = container.instantiateModelsToScene((name) => name);
                const root = entries.rootNodes[0] as TransformNode;

                if (root) {
                    // SIMPLIFIED APPROACH: Place water directly at terrain floor height
                    // The thick water mesh will naturally fill the depression
                    root.position = pond.position;

                    // Scale
                    const scale = pond.scale;
                    root.scaling = new Vector3(scale, scale, scale);

                    // Rotation
                    root.rotation = waterConfig.gltfRotation;

                    console.log(`[Water] Placed water at terrain level: ${pond.position.x.toFixed(1)}, ${pond.position.y.toFixed(1)}, ${pond.position.z.toFixed(1)} (scale: ${scale.toFixed(2)})`);

                    // Track meshes and animations
                    waterMeshes.push(...(entries.rootNodes as AbstractMesh[]));
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

    // Fallback if no GLTF or procedural placement found nothing
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

    // Freeze transforms for performance (but keep animations running)
    if (!waterConfig.useGLTFWater) {
        for (const mesh of waterMeshes) {
            if (mesh instanceof Mesh) {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
            }
        }
    }

    console.log('[Water] Water surface created with', waterMeshes.length, 'total meshes');

    return {
        meshes: waterMeshes,
        animationGroups,
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
        },
    };
}

/**
 * Scan terrain using "Radial Rim Probe" to find valid basins
 * Returns calculated water level and scael for each pond
 */
function scanForPonds(terrainInfo: TerrainInfo, config: WaterConfig): PondLocation[] {
    const locations: PondLocation[] = [];
    // We want to scan the entire terrain
    const bounds = config.width / 2; // Assuming terrain is centered at 0,0
    const numSamples = 300; // More samples for better coverage
    const minPondRadius = 10; // Minimum radius to be considered a pond

    for (let i = 0; i < numSamples; i++) {
        // Random probe position
        const x = (Math.random() * config.width) - bounds;
        const z = (Math.random() * config.depth) - bounds;

        const centerHeight = terrainInfo.getHeightAtCoordinates(x, z);

        // Radial Probe: Cast rays outwards to find the "rim" of this potential basin
        // We move outwards until the height stops increasing (local peak) or we hit a max radius
        const probeDirections = 8;
        const maxProbeDist = 200; // Max radius of a lake
        const stepSize = 10;

        let minRimHeight = Number.MAX_VALUE;
        let validRimPoints = 0;

        for (let j = 0; j < probeDirections; j++) {
            const angle = (Math.PI * 2 * j) / probeDirections;
            let currentRimHeight = -Number.MAX_VALUE;
            let prevHeight = centerHeight;
            let foundRim = false;

            for (let d = stepSize; d <= maxProbeDist; d += stepSize) {
                const px = x + Math.cos(angle) * d;
                const pz = z + Math.sin(angle) * d;
                const h = terrainInfo.getHeightAtCoordinates(px, pz);

                if (h < prevHeight) {
                    // We started going down! This is a local peak/rim.
                    currentRimHeight = prevHeight;
                    foundRim = true;
                    break;
                }
                prevHeight = h;
            }

            // If we didn't find a downward slope, take the height at max distance
            if (!foundRim) {
                currentRimHeight = prevHeight;
            }

            if (currentRimHeight > centerHeight + 2) { // Must be at least 2m basin
                validRimPoints++;
                if (currentRimHeight < minRimHeight) {
                    minRimHeight = currentRimHeight; // The spillway is the lowest point on the rim
                }
            }
        }

        // Must be surrounded by higher ground
        if (validRimPoints >= probeDirections && minRimHeight < Number.MAX_VALUE) {

            // Calculate Water Level
            const depressionDepth = minRimHeight - centerHeight;
            const waterLevel = centerHeight + (depressionDepth * config.waterFillRatio);

            // Estimate Radius based on where water level hits the terrain
            // This is a rough approximation for scaling the mesh
            let estimatedRadius = 0;
            for (let j = 0; j < probeDirections; j++) {
                const angle = (Math.PI * 2 * j) / probeDirections;
                // Binary search-ish to find water edge? Or just linear scan again?
                // Linear scan implies we know the terrain slope.
                // Let's just use the depression depth and an assumed slope or just spacing.
                // Better: Measure distance to where height >= waterLevel
                for (let d = stepSize; d <= maxProbeDist; d += stepSize) {
                    const px = x + Math.cos(angle) * d;
                    const pz = z + Math.sin(angle) * d;
                    const h = terrainInfo.getHeightAtCoordinates(px, pz);
                    if (h >= waterLevel) {
                        estimatedRadius += d;
                        break;
                    }
                }
            }
            estimatedRadius /= probeDirections;

            if (estimatedRadius >= minPondRadius) {
                // Check overlap? (Simple distance check against existing)
                const tooClose = locations.some(l => Vector3.Distance(l.position, new Vector3(x, waterLevel, z)) < (l.scale * 10 + estimatedRadius));

                if (!tooClose) {
                    // Determine Scale needed. 
                    // If mesh is 1 unit wide, scale = radius * 2 (roughly)
                    // Adjusted for visual overlap
                    const scale = estimatedRadius * 0.5; // Trial and error factor

                    if (scale >= config.pondMinScale && scale <= config.pondMaxScale) {
                        locations.push({
                            position: new Vector3(x, waterLevel, z),
                            scale: scale
                        });
                    }
                }
            }
        }
    }

    // Always ensure at least one big lake if nothing found (or just for safety)
    if (locations.length === 0) {
        console.warn('[Water] No natural basins found. creating default lake.');
        const centerHeight = terrainInfo.getHeightAtCoordinates(0, 0);
        locations.push({
            position: new Vector3(0, centerHeight + 2, 0),
            scale: 2.0
        });
    }

    return locations;
}