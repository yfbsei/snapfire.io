import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

export interface TerrainConfig {
    /** Width in meters (e.g., 2000 for 2km) */
    width: number;
    /** Height in meters (e.g., 2000 for 2km) */
    height: number;
    /** Number of subdivisions (higher = more detail, use heightmap resolution) */
    subdivisions: number;
    /** Maximum terrain elevation in meters */
    maxHeight: number;
    /** Minimum terrain elevation in meters */
    minHeight: number;
    /** Path to heightmap image */
    heightmapPath: string;
}

export class TerrainSystem {
    private scene: Scene;
    private config: TerrainConfig;
    private terrainMesh: GroundMesh | null = null;

    constructor(scene: Scene, config: TerrainConfig) {
        this.scene = scene;
        this.config = config;
    }

    async createTerrain(): Promise<GroundMesh> {
        console.log('🏔️ Creating terrain from heightmap...');

        return new Promise((resolve) => {
            // Create ground from heightmap using BabylonJS API
            // Signature: (name, url, width, height, subdivisions, minHeight, maxHeight, scene, updatable?, onReady?)
            this.terrainMesh = GroundMesh.CreateGroundFromHeightMap(
                'terrain',
                this.config.heightmapPath,
                this.config.width,
                this.config.height,
                this.config.subdivisions,
                this.config.minHeight,
                this.config.maxHeight,
                this.scene,
                false,  // updatable
                (mesh: GroundMesh) => {
                    console.log('✅ Terrain mesh created');
                    this.applyMaterial(mesh);

                    // Enable collisions
                    mesh.checkCollisions = true;

                    resolve(mesh);
                }
            );
        });
    }

    private async applyMaterial(mesh: GroundMesh): Promise<void> {
        console.log('🎨 Applying PBR multi-texture terrain material...');

        // Import PBRCustomMaterial and Texture class
        const { PBRCustomMaterial } = await import('@babylonjs/materials');
        const { TerrainSplatmapGenerator } = await import('./terrain-splatmap-generator');
        const { TERRAIN_TEXTURES } = await import('./terrain-texture-config');
        const { Texture } = await import('@babylonjs/core/Materials/Textures/texture');

        // Create PBR Custom Material
        const material = new PBRCustomMaterial('terrainPBR', this.scene);

        // Load all 3 terrain textures
        const tex1 = TERRAIN_TEXTURES[0]; // Rocky Trail
        const tex2 = TERRAIN_TEXTURES[1]; // Mud Forest
        const tex3 = TERRAIN_TEXTURES[2]; // Forest Ground

        // Generate splatmap from terrain geometry
        const splatmapGen = new TerrainSplatmapGenerator(this.scene);
        const splatmap = splatmapGen.generateSplatmap(mesh);

        // Load texture 1 (Rocky Trail) - Red channel
        const albedo1 = new Texture(tex1.albedoPath, this.scene);
        albedo1.uScale = tex1.uvScale;
        albedo1.vScale = tex1.uvScale;

        const normal1 = new Texture(tex1.normalPath, this.scene);
        normal1.uScale = tex1.uvScale;
        normal1.vScale = tex1.uvScale;

        let roughness1: InstanceType<typeof Texture> | null = null;
        if (tex1.roughnessPath) {
            roughness1 = new Texture(tex1.roughnessPath, this.scene);
            roughness1.uScale = tex1.uvScale;
            roughness1.vScale = tex1.uvScale;
        }

        // Load texture 2 (Mud Forest) - Green channel
        const albedo2 = new Texture(tex2.albedoPath, this.scene);
        albedo2.uScale = tex2.uvScale;
        albedo2.vScale = tex2.uvScale;

        const normal2 = new Texture(tex2.normalPath, this.scene);
        normal2.uScale = tex2.uvScale;
        normal2.vScale = tex2.uvScale;

        let roughness2: InstanceType<typeof Texture> | null = null;
        if (tex2.roughnessPath) {
            roughness2 = new Texture(tex2.roughnessPath, this.scene);
            roughness2.uScale = tex2.uvScale;
            roughness2.vScale = tex2.uvScale;
        }

        // Load texture 3 (Forest Ground) - Blue channel
        const albedo3 = new Texture(tex3.albedoPath, this.scene);
        albedo3.uScale = tex3.uvScale;
        albedo3.vScale = tex3.uvScale;

        const normal3 = new Texture(tex3.normalPath, this.scene);
        normal3.uScale = tex3.uvScale;
        normal3.vScale = tex3.uvScale;

        let roughness3: InstanceType<typeof Texture> | null = null;
        if (tex3.roughnessPath) {
            roughness3 = new Texture(tex3.roughnessPath, this.scene);
            roughness3.uScale = tex3.uvScale;
            roughness3.vScale = tex3.uvScale;
        }

        // Add custom shader code for multi-texture blending
        material.Fragment_Custom_Albedo(`
            // Sample splatmap (RGB = blend weights)
            vec3 splatWeights = texture2D(splatmapSampler, vMainUV1).rgb;
            
            // Sample all albedo textures
            vec3 albedo1 = texture2D(albedo1Sampler, vMainUV1).rgb;
            vec3 albedo2 = texture2D(albedo2Sampler, vMainUV1).rgb;
            vec3 albedo3 = texture2D(albedo3Sampler, vMainUV1).rgb;
            
            // Blend albedo based on splatmap weights
            vec3 blendedAlbedo = 
                albedo1 * splatWeights.r +
                albedo2 * splatWeights.g +
                albedo3 * splatWeights.b;
            
            surfaceAlbedo = blendedAlbedo;
        `);

        material.Fragment_Custom_MetallicRoughness(`
            // Sample splatmap
            vec3 splatWeights = texture2D(splatmapSampler, vMainUV1).rgb;
    
            // Sample roughness from all textures (green channel)
            float rough1 = ${roughness1 ? 'texture2D(roughness1Sampler, vMainUV1).g' : '0.85'};
            float rough2 = ${roughness2 ? 'texture2D(roughness2Sampler, vMainUV1).g' : '0.85'};
            float rough3 = ${roughness3 ? 'texture2D(roughness3Sampler, vMainUV1).g' : '0.85'};
            
            // Blend roughness
            float blendedRoughness = 
                rough1 * splatWeights.r +
                rough2 * splatWeights.g +
                rough3 * splatWeights.b;
            
            roughness = blendedRoughness;
            metallic = 0.0; // Terrain is non-metallic
        `);

        material.Fragment_Before_FragColor(`
            // Sample splatmap
            vec3 splatWeights = texture2D(splatmapSampler, vMainUV1).rgb;
            
            // Sample all normal maps
            vec3 normal1 = texture2D(normal1Sampler, vMainUV1).xyz * 2.0 - 1.0;
            vec3 normal2 = texture2D(normal2Sampler, vMainUV1).xyz * 2.0 - 1.0;
            vec3 normal3 = texture2D(normal3Sampler, vMainUV1).xyz * 2.0 - 1.0;
            
            // Blend normals (proper tangent-space blending)
            vec3 blendedNormal = normalize(
                normal1 * splatWeights.r +
                normal2 * splatWeights.g +
                normal3 * splatWeights.b
            );
            
            // Apply to bump normal
            normalW = normalize(blendedNormal);
        `);

        // Add custom samplers for all textures
        material.AddUniform('splatmapSampler', 'sampler2D', null);
        material.AddUniform('albedo1Sampler', 'sampler2D', null);
        material.AddUniform('albedo2Sampler', 'sampler2D', null);
        material.AddUniform('albedo3Sampler', 'sampler2D', null);
        material.AddUniform('normal1Sampler', 'sampler2D', null);
        material.AddUniform('normal2Sampler', 'sampler2D', null);
        material.AddUniform('normal3Sampler', 'sampler2D', null);

        if (roughness1) material.AddUniform('roughness1Sampler', 'sampler2D', null);
        if (roughness2) material.AddUniform('roughness2Sampler', 'sampler2D', null);
        if (roughness3) material.AddUniform('roughness3Sampler', 'sampler2D', null);

        // Set texture samplers
        material.onBindObservable.add(() => {
            material.getEffect()?.setTexture('splatmapSampler', splatmap);
            material.getEffect()?.setTexture('albedo1Sampler', albedo1);
            material.getEffect()?.setTexture('albedo2Sampler', albedo2);
            material.getEffect()?.setTexture('albedo3Sampler', albedo3);
            material.getEffect()?.setTexture('normal1Sampler', normal1);
            material.getEffect()?.setTexture('normal2Sampler', normal2);
            material.getEffect()?.setTexture('normal3Sampler', normal3);

            if (roughness1) material.getEffect()?.setTexture('roughness1Sampler', roughness1);
            if (roughness2) material.getEffect()?.setTexture('roughness2Sampler', roughness2);
            if (roughness3) material.getEffect()?.setTexture('roughness3Sampler', roughness3);
        });

        // PBR properties
        material.metallic = 0.0;
        material.roughness = 0.85;
        material.usePhysicalLightFalloff = true;

        // Enable HDRI environment if available
        if (this.scene.environmentTexture) {
            material.reflectionTexture = this.scene.environmentTexture;
        }

        mesh.material = material;

        console.log('✅ PBR multi-texture terrain material applied');
        console.log(`   - Texture 1(Red): ${tex1.name}`);
        console.log(`   - Texture 2(Green): ${tex2.name}`);
        console.log(`   - Texture 3(Blue): ${tex3.name}`);
        console.log(`   - Splatmap: Procedurally generated from terrain slope`);
        console.log(`   - PBR: Full metallic / roughness workflow with HDRI`);
        console.log('');
    }

    getTerrain(): GroundMesh | null {
        return this.terrainMesh;
    }

    dispose(): void {
        if (this.terrainMesh) {
            this.terrainMesh.dispose();
            this.terrainMesh = null;
        }
    }
}
