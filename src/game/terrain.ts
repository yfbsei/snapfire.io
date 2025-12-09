/**
 * Terrain Module - Backwards Compatibility Re-export
 * 
 * This file re-exports from the new modular terrain system.
 * All existing imports will continue to work.
 * 
 * For new code, consider importing directly from './terrain/index'
 */

export { createTerrain, TerrainMaterial, defaultTerrainConfig } from './terrain/index';
export type { TerrainInfo, TerrainConfig, TerrainTextureLayer, TerrainBlendConfig } from './terrain/index';
