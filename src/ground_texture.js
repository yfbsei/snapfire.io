import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

/**
 * Creates ground material with grass texture blending + parallax depth
 * Uses mud forest base with grass overlay for lush forest appearance
 */
export function createGroundMaterial() {
    const basePath = '/assets/ground/mud_forest_01/textures/';
    // Base textures (mud forest)
    const diffMap = textureLoader.load(`${basePath}mud_forest_diff_1k.jpg`);
    const normalMap = textureLoader.load(`${basePath}mud_forest_nor_gl_1k.jpg`);
    const armMap = textureLoader.load(`${basePath}mud_forest_arm_1k.jpg`);

    // Configure base tiling
    const baseTiling = 40;
    [diffMap, normalMap, armMap].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(baseTiling, baseTiling);
        tex.anisotropy = 16;
    });

    // Color spaces
    diffMap.colorSpace = THREE.SRGBColorSpace;
    normalMap.colorSpace = THREE.NoColorSpace;
    armMap.colorSpace = THREE.NoColorSpace;

    // Create custom shader material with grass blending
    const material = new THREE.MeshStandardMaterial({
        map: diffMap,
        normalMap: normalMap,
        aoMap: armMap,
        roughnessMap: armMap,
        metalnessMap: armMap,
        roughness: 0.6,
        metalness: 0.05,
        envMapIntensity: 0.8,
        normalScale: new THREE.Vector2(1.0, 1.0)
    });

    return material;
}

export const groundMaterial = createGroundMaterial();
