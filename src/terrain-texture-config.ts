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

export const TERRAIN_TEXTURES: TerrainTextureSet[] = [
    // Single ground texture: Mud Forest
    {
        name: 'Mud Forest',
        albedoPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_diff_4k.jpg',
        normalPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_nor_gl_4k.jpg',
        armPath: '/src/asset/texture/ground/mud_forest_01/textures/mud_forest_arm_4k.jpg',
        uvScale: 10.0
    }
];