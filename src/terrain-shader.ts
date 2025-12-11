import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Effect } from '@babylonjs/core/Materials/effect';
import { TerrainTextureSet, TerrainBlendConfig } from './terrain-texture-config';

export interface TerrainShaderConfig {
    textures: TerrainTextureSet[];
    blendConfig: TerrainBlendConfig;
    terrainMinHeight: number;
    terrainMaxHeight: number;
    triplanarScale: number;
}

export class TerrainShaderMaterial {
    private material: ShaderMaterial;
    private scene: Scene;

    constructor(name: string, scene: Scene, config: TerrainShaderConfig) {
        this.scene = scene;

        // Define the shader code
        this.defineShaders();

        // Create the shader material
        this.material = new ShaderMaterial(
            name,
            scene,
            {
                vertex: 'terrainVertex',
                fragment: 'terrainFragment',
            },
            {
                attributes: ['position', 'normal', 'uv'],
                uniforms: [
                    'world', 'worldView', 'worldViewProjection', 'view', 'projection',
                    'cameraPosition',
                    // Blend parameters
                    'slopeFlat', 'slopeMedium', 'slopeSteep',
                    'elevationLow', 'elevationMid', 'elevationHigh',
                    'terrainMinHeight', 'terrainMaxHeight',
                    'noiseScale', 'noiseStrength', 'blendSharpness',
                    'triplanarScale',
                    // Texture scales
                    'uvScale0', 'uvScale1', 'uvScale2', 'uvScale3',
                    // PBR settings
                    'metallic', 'roughness'
                ],
                samplers: [
                    // Texture 0 (Rocky Trail)
                    'albedo0', 'normal0', 'arm0',
                    // Texture 1 (Mud Forest)
                    'albedo1', 'normal1', 'arm1',
                    // Texture 2 (Forest Ground)
                    'albedo2', 'normal2', 'roughness2',
                    // Texture 3 (Forest Leaves)
                    'albedo3', 'normal3', 'arm3'
                ],
                needAlphaBlending: false,
                needAlphaTesting: false
            }
        );

        // Set uniforms
        this.material.setFloat('slopeFlat', config.blendConfig.slopeThresholds.flat);
        this.material.setFloat('slopeMedium', config.blendConfig.slopeThresholds.medium);
        this.material.setFloat('slopeSteep', config.blendConfig.slopeThresholds.steep);

        this.material.setFloat('elevationLow', config.blendConfig.elevationRanges.low);
        this.material.setFloat('elevationMid', config.blendConfig.elevationRanges.mid);
        this.material.setFloat('elevationHigh', config.blendConfig.elevationRanges.high);

        this.material.setFloat('terrainMinHeight', config.terrainMinHeight);
        this.material.setFloat('terrainMaxHeight', config.terrainMaxHeight);

        this.material.setFloat('noiseScale', config.blendConfig.noise.scale);
        this.material.setFloat('noiseStrength', config.blendConfig.noise.strength);
        this.material.setFloat('blendSharpness', config.blendConfig.blendSharpness);

        this.material.setFloat('triplanarScale', config.triplanarScale);

        // Set UV scales for each texture
        this.material.setFloat('uvScale0', config.textures[0].uvScale);
        this.material.setFloat('uvScale1', config.textures[1].uvScale);
        this.material.setFloat('uvScale2', config.textures[2].uvScale);
        this.material.setFloat('uvScale3', config.textures[3].uvScale);

        // PBR settings
        this.material.setFloat('metallic', 0.0);
        this.material.setFloat('roughness', 0.85);

        // Load and set textures
        this.loadTextures(config.textures);

        // Backface culling and other options
        this.material.backFaceCulling = true;
        this.material.wireframe = false;
    }

    private loadTextures(textures: TerrainTextureSet[]): void {
        // Texture 0 - Rocky Trail
        const albedo0 = new Texture(textures[0].albedoPath, this.scene);
        albedo0.anisotropicFilteringLevel = 16;
        this.material.setTexture('albedo0', albedo0);

        const normal0 = new Texture(textures[0].normalPath, this.scene);
        normal0.anisotropicFilteringLevel = 16;
        this.material.setTexture('normal0', normal0);

        if (textures[0].armPath) {
            const arm0 = new Texture(textures[0].armPath, this.scene);
            arm0.anisotropicFilteringLevel = 16;
            this.material.setTexture('arm0', arm0);
        }

        // Texture 1 - Mud Forest
        const albedo1 = new Texture(textures[1].albedoPath, this.scene);
        albedo1.anisotropicFilteringLevel = 16;
        this.material.setTexture('albedo1', albedo1);

        const normal1 = new Texture(textures[1].normalPath, this.scene);
        normal1.anisotropicFilteringLevel = 16;
        this.material.setTexture('normal1', normal1);

        if (textures[1].armPath) {
            const arm1 = new Texture(textures[1].armPath, this.scene);
            arm1.anisotropicFilteringLevel = 16;
            this.material.setTexture('arm1', arm1);
        }

        // Texture 2 - Forest Ground
        const albedo2 = new Texture(textures[2].albedoPath, this.scene);
        albedo2.anisotropicFilteringLevel = 16;
        this.material.setTexture('albedo2', albedo2);

        const normal2 = new Texture(textures[2].normalPath, this.scene);
        normal2.anisotropicFilteringLevel = 16;
        this.material.setTexture('normal2', normal2);

        if (textures[2].roughnessPath) {
            const roughness2 = new Texture(textures[2].roughnessPath, this.scene);
            roughness2.anisotropicFilteringLevel = 16;
            this.material.setTexture('roughness2', roughness2);
        }

        // Texture 3 - Forest Leaves
        const albedo3 = new Texture(textures[3].albedoPath, this.scene);
        albedo3.anisotropicFilteringLevel = 16;
        this.material.setTexture('albedo3', albedo3);

        const normal3 = new Texture(textures[3].normalPath, this.scene);
        normal3.anisotropicFilteringLevel = 16;
        this.material.setTexture('normal3', normal3);

        if (textures[3].armPath) {
            const arm3 = new Texture(textures[3].armPath, this.scene);
            arm3.anisotropicFilteringLevel = 16;
            this.material.setTexture('arm3', arm3);
        }
    }

    private defineShaders(): void {
        // Vertex Shader
        Effect.ShadersStore['terrainVertexShader'] = `
            precision highp float;

            // Attributes
            attribute vec3 position;
            attribute vec3 normal;
            attribute vec2 uv;

            // Uniforms
            uniform mat4 worldViewProjection;
            uniform mat4 world;

            // Varying
            varying vec3 vPositionW;
            varying vec3 vNormalW;
            varying vec2 vUV;

            void main(void) {
                vec4 outPosition = worldViewProjection * vec4(position, 1.0);
                gl_Position = outPosition;
                
                vPositionW = vec3(world * vec4(position, 1.0));
                vNormalW = normalize(vec3(world * vec4(normal, 0.0)));
                vUV = uv;
            }
        `;

        // Fragment Shader
        Effect.ShadersStore['terrainFragmentShader'] = `
            precision highp float;

            // Varying
            varying vec3 vPositionW;
            varying vec3 vNormalW;
            varying vec2 vUV;

            // Uniforms - Blend parameters
            uniform float slopeFlat;
            uniform float slopeMedium;
            uniform float slopeSteep;
            uniform float elevationLow;
            uniform float elevationMid;
            uniform float elevationHigh;
            uniform float terrainMinHeight;
            uniform float terrainMaxHeight;
            uniform float noiseScale;
            uniform float noiseStrength;
            uniform float blendSharpness;
            uniform float triplanarScale;
            
            // UV scales
            uniform float uvScale0;
            uniform float uvScale1;
            uniform float uvScale2;
            uniform float uvScale3;

            // Texture samplers - Texture 0 (Rocky Trail)
            uniform sampler2D albedo0;
            uniform sampler2D normal0;
            uniform sampler2D arm0;
            
            // Texture 1 (Mud Forest)
            uniform sampler2D albedo1;
            uniform sampler2D normal1;
            uniform sampler2D arm1;
            
            // Texture 2 (Forest Ground)
            uniform sampler2D albedo2;
            uniform sampler2D normal2;
            uniform sampler2D roughness2;
            
            // Texture 3 (Forest Leaves)
            uniform sampler2D albedo3;
            uniform sampler2D normal3;
            uniform sampler2D arm3;

            // 3D Simplex Noise
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);

                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);

                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;

                i = mod289(i);
                vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;

                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);

                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);

                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);

                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));

                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);

                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;

                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }

            // Triplanar mapping function
            vec4 triplanarSample(sampler2D tex, vec3 worldPos, vec3 normal, float scale) {
                vec3 blendWeights = abs(normal);
                blendWeights = blendWeights / (blendWeights.x + blendWeights.y + blendWeights.z);
                
                vec4 xProjection = texture2D(tex, worldPos.yz * scale);
                vec4 yProjection = texture2D(tex, worldPos.xz * scale);
                vec4 zProjection = texture2D(tex, worldPos.xy * scale);
                
                return xProjection * blendWeights.x + yProjection * blendWeights.y + zProjection * blendWeights.z;
            }

            // Smooth blend function
            float smoothBlend(float value, float threshold, float softness) {
                return smoothstep(threshold - softness, threshold + softness, value);
            }

            void main(void) {
                vec3 normal = normalize(vNormalW);
                
                // Calculate slope angle in degrees
                float slopeDot = dot(normal, vec3(0.0, 1.0, 0.0));
                float slopeAngle = degrees(acos(slopeDot));
                
                // Normalize elevation (0 to 1)
                float elevation = (vPositionW.y - terrainMinHeight) / (terrainMaxHeight - terrainMinHeight);
                float elevationMeters = vPositionW.y;
                
                // Generate 3D noise
                float noise = snoise(vPositionW * noiseScale) * 0.5 + 0.5; // 0 to 1
                
                // Calculate blend weights for each texture
                vec4 weights = vec4(0.0);
                
                // Texture 0 (Rocky Trail) - Steep slopes only
                float steepWeight = smoothBlend(slopeAngle, slopeMedium, 5.0);
                weights.x = steepWeight;
                
                // Texture 1 (Mud Forest) - Medium slopes and low elevations
                float mediumSlopeWeight = smoothBlend(slopeAngle, slopeFlat, 3.0) - steepWeight;
                float lowElevWeight = 1.0 - smoothBlend(elevationMeters, elevationLow, 10.0);
                weights.y = max(mediumSlopeWeight, lowElevWeight * 0.5);
                
                // Texture 2 (Forest Ground) - Flat areas, primary base
                float flatWeight = 1.0 - smoothBlend(slopeAngle, slopeFlat, 3.0);
                weights.z = flatWeight * (1.0 - noise * noiseStrength);
                
                // Texture 3 (Forest Leaves) - Noise variation on flat areas
                weights.w = flatWeight * noise * noiseStrength;
                
                // Normalize weights
                float totalWeight = weights.x + weights.y + weights.z + weights.w;
                weights /= max(totalWeight, 0.001);
                
                // Sample textures with triplanar mapping
                float triScale = triplanarScale * 0.01;
                
                // Texture 0 samples
                vec4 albedo0_sample = triplanarSample(albedo0, vPositionW, normal, triScale * uvScale0);
                vec4 normal0_sample = triplanarSample(normal0, vPositionW, normal, triScale * uvScale0);
                vec4 arm0_sample = triplanarSample(arm0, vPositionW, normal, triScale * uvScale0);
                
                // Texture 1 samples
                vec4 albedo1_sample = triplanarSample(albedo1, vPositionW, normal, triScale * uvScale1);
                vec4 normal1_sample = triplanarSample(normal1, vPositionW, normal, triScale * uvScale1);
                vec4 arm1_sample = triplanarSample(arm1, vPositionW, normal, triScale * uvScale1);
                
                // Texture 2 samples
                vec4 albedo2_sample = triplanarSample(albedo2, vPositionW, normal, triScale * uvScale2);
                vec4 normal2_sample = triplanarSample(normal2, vPositionW, normal, triScale * uvScale2);
                vec4 roughness2_sample = triplanarSample(roughness2, vPositionW, normal, triScale * uvScale2);
                
                // Texture 3 samples
                vec4 albedo3_sample = triplanarSample(albedo3, vPositionW, normal, triScale * uvScale3);
                vec4 normal3_sample = triplanarSample(normal3, vPositionW, normal, triScale * uvScale3);
                vec4 arm3_sample = triplanarSample(arm3, vPositionW, normal, triScale * uvScale3);
                
                // Blend albedo
                vec4 finalAlbedo = albedo0_sample * weights.x +
                                   albedo1_sample * weights.y +
                                   albedo2_sample * weights.z +
                                   albedo3_sample * weights.w;
                
                // Output final color (for now, just albedo - PBR lighting will be handled by BabylonJS)
                gl_FragColor = vec4(finalAlbedo.rgb, 1.0);
            }
        `;
    }

    getMaterial(): ShaderMaterial {
        return this.material;
    }

    dispose(): void {
        this.material.dispose();
    }
}
