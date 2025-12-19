import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

/**
 * Creates ground material with distance-based fade for smooth chunk transitions
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

    // Create material with transparency support
    const material = new THREE.MeshStandardMaterial({
        map: diffMap,
        normalMap: normalMap,
        aoMap: armMap,
        roughnessMap: armMap,
        metalnessMap: armMap,
        roughness: 0.6,
        metalness: 0.05,
        envMapIntensity: 0.8,
        normalScale: new THREE.Vector2(1.0, 1.0),
        transparent: true
    });

    // Inject custom shader for distance-based fade
    material.onBeforeCompile = (shader) => {
        shader.uniforms.fadeStart = { value: 200.0 };
        shader.uniforms.fadeEnd = { value: 400.0 };

        // Add varying for world position
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            varying vec3 vWorldPos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vWorldPos = worldPosition.xyz;`
        );

        // Add distance-based alpha fade in fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform float fadeStart;
            uniform float fadeEnd;
            varying vec3 vWorldPos;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
            float dist = length(vWorldPos - cameraPosition);
            float fadeAlpha = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
            gl_FragColor.a *= fadeAlpha;`
        );
    };

    return material;
}

export const groundMaterial = createGroundMaterial();

