/**
 * Configuration for photorealistic terrain texturing
 * Uses 3 high-quality 4K PBR texture sets with procedural blending
 */

export interface TerrainTextureSet {
    /** Display name */
    name: string;
    /** Path to diffuse/albedo texture (4K) */
    albedoPath: string;
    /** Path to normal map (4K, OpenGL format) */
    normalPath: string;
    /** Path to roughness map OR ARM map (Ambient Occlusion + Roughness + Metallic packed) */
    roughnessPath?: string;
    /** Path to ARM map if using packed format */
    armPath?: string;
    /** UV tiling scale (higher = more repetition, lower = stretched) */
    uvScale: number;
}

export interface TerrainBlendConfig {
    /** Slope angle in degrees where texture transitions occur */
    slopeThresholds: {
        flat: number;      // 0-15° considered flat
        medium: number;    // 15-35° considered medium slope
        steep: number;     // 35°+ considered steep
    };
    /** Elevation ranges in meters for vertical variation */
    elevationRanges: {
        low: number;       // Below this height
        mid: number;       // Mid elevation
        high: number;      // Above this height
    };
    /** Noise configuration for natural variation */
    noise: {
        scale: number;     // 3D noise scale
        strength: number;  // How much noise affects blending (0-1)
    };
    /** Blend sharpness (higher = sharper transitions) */
    blendSharpness: number;
}

export const TERRAIN_TEXTURES: TerrainTextureSet[] = [
    // Texture 0: Mud Forest - for steep slopes
    {
        name: 'Mud Forest',
        albedoPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_diff_4k.jpg',
        normalPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_nor_gl_4k.jpg',
        armPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_arm_4k.jpg',
        uvScale: 10.0
    },
    // Texture 1: Forest Ground - for medium slopes and base layer
    {
        name: 'Forest Ground',
        albedoPath: '/src/asset/texture/ground/forest_ground_04/textures/forest_ground_04_diff_4k.jpg',
        normalPath: '/src/asset/texture/ground/forest_ground_04/textures/forest_ground_04_nor_gl_4k.jpg',
        roughnessPath: '/src/asset/texture/ground/forest_ground_04/textures/forest_ground_04_rough_4k.jpg',
        uvScale: 12.0
    },
    // Texture 2: Forest Leaves - for flat areas with variation
    {
        name: 'Forest Leaves',
        albedoPath: '/src/asset/texture/ground/forest_leaves_04/textures/forest_leaves_04_diff_4k.jpg',
        normalPath: '/src/asset/texture/ground/forest_leaves_04/textures/forest_leaves_04_nor_gl_4k.jpg',
        armPath: '/src/asset/texture/ground/forest_leaves_04/textures/forest_leaves_04_arm_4k.jpg',
        uvScale: 15.0
    }
];

export const TERRAIN_BLEND_CONFIG: TerrainBlendConfig = {
    slopeThresholds: {
        flat: 8.0,     // Degrees - gentle slopes
        medium: 18.0,  // Medium slopes
        steep: 30.0    // Steeper slopes
    },
    elevationRanges: {
        low: 20.0,     // Meters - lower elevation
        mid: 60.0,     // Mid elevation
        high: 100.0    // Upper elevation
    },
    noise: {
        scale: 0.8,      // 3D noise frequency
        strength: 0.4    // 40% noise influence
    },
    blendSharpness: 2.0
};