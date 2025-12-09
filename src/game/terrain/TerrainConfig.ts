/**
 * Terrain Configuration Types and Defaults
 * 
 * This module defines the configuration interface for terrain generation
 * including dimensions, textures, and blending parameters.
 */

export interface TerrainTextureLayer {
    /** Path to diffuse/albedo texture */
    diffuse: string;
    /** Path to normal map */
    normal: string;
    /** Path to roughness map */
    roughness: string;
}

export interface TerrainBlendConfig {
    /** Slope threshold where rock texture starts blending (0-1, 0=flat, 1=vertical) */
    slopeStart: number;
    /** Slope threshold where rock texture is fully applied */
    slopeEnd: number;
    /** Height (normalized 0-1) where burned texture starts blending */
    heightStart: number;
    /** Height (normalized 0-1) where burned texture is fully applied */
    heightEnd: number;
}

export interface TerrainConfig {
    /** Width of terrain in world units */
    width: number;
    /** Depth of terrain in world units */
    height: number;
    /** Number of subdivisions for mesh detail */
    subdivisions: number;
    /** Minimum terrain height */
    minHeight: number;
    /** Maximum terrain height */
    maxHeight: number;
    /** Path to heightmap image */
    heightmapPath: string;
    /** Texture tiling scale (how many times texture repeats across terrain) */
    textureScale: number;
    /** Texture layers for multi-layer blending */
    textures: {
        /** Grass/mud layer for flat, low areas */
        grass: TerrainTextureLayer;
        /** Rock layer for steep slopes */
        rock: TerrainTextureLayer;
        /** Burned ground layer for high altitude */
        burned: TerrainTextureLayer;
    };
    /** Blending parameters for slope and height-based mixing */
    blending: TerrainBlendConfig;
}

/**
 * Default terrain configuration with realistic settings
 */
export const defaultTerrainConfig: TerrainConfig = {
    width: 1000,
    height: 1000,
    subdivisions: 256,
    minHeight: 0,
    maxHeight: 75,
    heightmapPath: '/assets/heightmap/heightmap.png',
    textureScale: 50, // Texture repeats 50 times across 1km = ~20m per tile
    textures: {
        grass: {
            diffuse: '/assets/textures/ground/brown-mud-leaves-grass/textures/brown_mud_leaves_01_diff_2k.jpg',
            normal: '/assets/textures/ground/brown-mud-leaves-grass/textures/brown_mud_leaves_01_nor_gl_2k.jpg',
            roughness: '/assets/textures/ground/brown-mud-leaves-grass/textures/brown_mud_leaves_01_arm_2k.jpg',
        },
        rock: {
            diffuse: '/assets/textures/ground/rocks-ground/textures/rocks_ground_02_col_2k.jpg',
            normal: '/assets/textures/ground/rocks-ground/textures/rocks_ground_02_nor_gl_2k.jpg',
            roughness: '/assets/textures/ground/rocks-ground/textures/rocks_ground_02_rough_2k.jpg',
        },
        burned: {
            diffuse: '/assets/textures/ground/burned-ground/textures/burned_ground_01_diff_2k.jpg',
            normal: '/assets/textures/ground/burned-ground/textures/burned_ground_01_nor_gl_2k.jpg',
            roughness: '/assets/textures/ground/burned-ground/textures/burned_ground_01_rough_2k.jpg',
        },
    },
    blending: {
        slopeStart: 0.01,  // Start blending rock at 1% slope (extremely flat)
        slopeEnd: 0.05,    // Full rock at 5% slope
        heightStart: 0.08, // Start blending burned at 8% height
        heightEnd: 0.25,   // Full burned at 25% height
    },
};
