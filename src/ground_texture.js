import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();

/**
 * Creates ground material with distance-based fade for smooth chunk transitions
 */
export function createGroundMaterial() {
    const mudPath = '/assets/ground/mud_forest_01/textures/';
    const rockPath = '/assets/ground/rocky_terrain_02/textures/';

    // Mud textures
    const diff1 = textureLoader.load(`${mudPath}mud_forest_diff_1k.jpg`);
    const norm1 = textureLoader.load(`${mudPath}mud_forest_nor_gl_1k.jpg`);
    const arm1 = textureLoader.load(`${mudPath}mud_forest_arm_1k.jpg`);

    // Rock textures
    const diff2 = textureLoader.load(`${rockPath}rocky_terrain_02_diff_1k.jpg`);
    const norm2 = textureLoader.load(`${rockPath}rocky_terrain_02_nor_gl_1k.jpg`);
    const arm2 = textureLoader.load(`${rockPath}rocky_terrain_02_arm_1k.jpg`);

    // Configure base tiling
    const baseTiling = 40;
    [diff1, norm1, arm1, diff2, norm2, arm2].forEach(tex => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(baseTiling, baseTiling);
        tex.anisotropy = 16;
    });

    // Color spaces
    diff1.colorSpace = THREE.SRGBColorSpace;
    diff2.colorSpace = THREE.SRGBColorSpace;
    [norm1, arm1, norm2, arm2].forEach(tex => tex.colorSpace = THREE.NoColorSpace);

    // Create material with transparency support
    const material = new THREE.MeshStandardMaterial({
        roughness: 0.8,
        metalness: 0.1,
        envMapIntensity: 0.8,
        transparent: true
    });

    // Inject custom shader for blending and fade
    material.onBeforeCompile = (shader) => {
        shader.uniforms.mudDiff = { value: diff1 };
        shader.uniforms.mudNorm = { value: norm1 };
        shader.uniforms.mudArm = { value: arm1 };

        shader.uniforms.rockDiff = { value: diff2 };
        shader.uniforms.rockNorm = { value: norm2 };
        shader.uniforms.rockArm = { value: arm2 };

        shader.uniforms.fadeStart = { value: 200.0 };
        shader.uniforms.fadeEnd = { value: 400.0 };
        shader.uniforms.tiling = { value: baseTiling };

        // Add varyings
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;`
        );

        // Use existing worldPosition which handles BatchedMesh/Instancing correctly
        shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            vWorldPos = worldPosition.xyz;
            #ifdef USE_BATCHING
                vWorldNormal = normalize( ( modelMatrix * batchingMatrix * vec4( normal, 0.0 ) ).xyz );
            #else
                vWorldNormal = normalize( ( modelMatrix * vec4( normal, 0.0 ) ).xyz );
            #endif`
        );

        // Fragment shader blending
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
            uniform sampler2D mudDiff;
            uniform sampler2D mudNorm;
            uniform sampler2D mudArm;
            uniform sampler2D rockDiff;
            uniform sampler2D rockNorm;
            uniform sampler2D rockArm;
            uniform float fadeStart;
            uniform float fadeEnd;
            uniform float tiling;
            varying vec3 vWorldPos;
            varying vec3 vWorldNormal;

            // Simple hash for noise
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }
            float noise(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }`
        );

        // Define UVs and Blend once at the start of main
        shader.fragmentShader = shader.fragmentShader.replace(
            'void main() {',
            `void main() {
            vec2 terrainUv = vWorldPos.xz * (tiling / 200.0);
            float slope = 1.0 - normalize(vWorldNormal).y;
            float n = noise(vWorldPos.xz * 0.1); 
            // Sharp transition to prevent "overlapping" feel, and lower threshold for more rocks
            float blendFactor = smoothstep(0.05, 0.2, slope * 1.2 + (n - 0.5) * 0.8 + 0.1);`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `
            vec4 col1 = texture2D(mudDiff, terrainUv);
            vec4 col2 = texture2D(rockDiff, terrainUv);
            diffuseColor = mix(col1, col2, blendFactor);
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <normal_fragment_maps>',
            `
            vec3 n1 = texture2D(mudNorm, terrainUv).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(rockNorm, terrainUv).xyz * 2.0 - 1.0;
            
            // "High Depth" for rocks: amplify rock normals, flatten mud normals
            n1.xy *= 0.2; 
            n2.xy *= 2.5; 
            
            vec3 blendedNormal = mix(n1, n2, blendFactor);
            normal = normalize(vWorldNormal + blendedNormal * 0.8);
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            `
            float ao1 = texture2D(mudArm, terrainUv).r;
            float ao2 = texture2D(rockArm, terrainUv).r;
            // Stronger AO for rocks for more 3D depth
            float ambientOcclusion = mix(ao1, pow(ao2, 2.0), blendFactor);
            reflectedLight.indirectDiffuse *= ambientOcclusion;
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `
            float r1 = texture2D(mudArm, terrainUv).g;
            float r2 = texture2D(rockArm, terrainUv).g;
            
            // Mud: High roughness (simple/flat)
            // Rock: Super low roughness (wet/shiny)
            float mudRough = 0.9;
            float rockRough = r2 * 0.15; 
            
            float roughnessFactor = mix(mudRough, rockRough, blendFactor);
            `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <metalnessmap_fragment>',
            `
            float m1 = texture2D(mudArm, terrainUv).b;
            float m2 = texture2D(rockArm, terrainUv).b;
            
            // Mud: No metalness
            // Rock: High "wet" specular look
            float metalnessFactor = mix(0.0, 0.4, blendFactor); 
            `
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

