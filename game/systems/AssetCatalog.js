/**
 * AssetCatalog - Centralized registry of all game assets
 * Maps asset names to their file paths for easy loading
 */

const BASE_PATH = './assets-1k';

export const AssetCatalog = {
    // Low poly grass and trees
    foliage: {
        pack: `${BASE_PATH}/Foliage/low_poly_grass.glb`,
        blueSpruce: `${BASE_PATH}/Foliage/blue_spruce.glb`
    },

    // Ground textures (PBR)
    ground: {
        mudForest: {
            model: `${BASE_PATH}/ground/mud_forest_01/mud_forest_1k.gltf`,
            diffuse: `${BASE_PATH}/ground/mud_forest_01/textures/mud_forest_diff_1k.jpg`,
            normal: `${BASE_PATH}/ground/mud_forest_01/textures/mud_forest_nor_gl_1k.jpg`,
            arm: `${BASE_PATH}/ground/mud_forest_01/textures/mud_forest_arm_1k.jpg`
        }
    },

    // Environment
    environment: {
        hdri: `${BASE_PATH}/HDRI/belfast_sunset_puresky_1k.hdr`
    },

    // Modern props
    props: {
        picnicTable: `${BASE_PATH}/modern/picnic_table_-_low_poly.glb`,
        outpost: `${BASE_PATH}/modern/outpost.glb`
    },

    // Insects
    insects: {
        butterfly: `${BASE_PATH}/insects/animated_butterfly.glb`
    }
};

/**
 * Asset loading configuration
 */
export const AssetConfig = {
    foliage: {
        instanceable: true,
        castShadow: false,
        receiveShadow: false
    }
};

export default AssetCatalog;
