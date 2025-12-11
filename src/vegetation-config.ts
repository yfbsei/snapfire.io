/**
 * Vegetation Configuration
 * Defines all vegetation assets and placement parameters for the forest scene
 */

export interface VegetationAsset {
    name: string;
    modelPath: string;
    category: 'tree' | 'grass' | 'rock' | 'debris' | 'sapling';
    density: number;          // Instances per 100m²
    minScale: number;
    maxScale: number;
    randomRotation: boolean;
    alignToSlope: boolean;    // Align to terrain normal
    maxSlopeAngle: number;    // Max slope in degrees where this can spawn
}

export interface VegetationConfig {
    assets: VegetationAsset[];
    globalDensityMultiplier: number;
    renderDistance: number;   // Max distance to render vegetation
    terrainSize: number;      // Size of terrain in meters
}

// Asset paths relative to src/asset/world/
const ASSET_BASE = '/src/asset/world';

/**
 * Vegetation asset definitions
 * GRASS MEDIUM ONLY - optimized for performance
 */
export const VEGETATION_ASSETS: VegetationAsset[] = [
    {
        name: 'grass_medium_01',
        modelPath: `${ASSET_BASE}/grass_plants/grass_medium_01/grass_medium_01_1k.gltf`,
        category: 'grass',
        density: 1.0,           // Reduced density for performance
        minScale: 0.8,
        maxScale: 1.2,
        randomRotation: true,
        alignToSlope: true,
        maxSlopeAngle: 45,
    },
    {
        name: 'grass_medium_02',
        modelPath: `${ASSET_BASE}/grass_plants/grass_medium_02/grass_medium_02_1k.gltf`,
        category: 'grass',
        density: 1.0,           // Reduced density for performance
        minScale: 0.8,
        maxScale: 1.2,
        randomRotation: true,
        alignToSlope: true,
        maxSlopeAngle: 45,
    },
];

/**
 * Main vegetation configuration
 */
export const VEGETATION_CONFIG: VegetationConfig = {
    assets: VEGETATION_ASSETS,
    globalDensityMultiplier: 1.0,   // Full density
    renderDistance: 500,
    terrainSize: 2000,
};
