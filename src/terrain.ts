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
        console.log('🎨 Applying multi-texture terrain material...');

        const { MixMaterial } = await import('@babylonjs/materials/mix');
        const { TerrainSplatmapGenerator } = await import('./terrain-splatmap-generator');
        const { TERRAIN_TEXTURES } = await import('./terrain-texture-config');
        const { Texture } = await import('@babylonjs/core/Materials/Textures/texture');

        // Create MixMaterial - designed for texture blending
        const material = new MixMaterial('terrainMix', this.scene);

        const tex1 = TERRAIN_TEXTURES[0]; // Mud Forest
        const tex2 = TERRAIN_TEXTURES[1]; // Forest Ground
        const tex3 = TERRAIN_TEXTURES[2]; // Forest Leaves

        console.log('📁 Loading 3 textures...');
        console.log(`  1. ${tex1.name}: ${tex1.albedoPath}`);
        console.log(`  2. ${tex2.name}: ${tex2.albedoPath}`);
        console.log(`  3. ${tex3.name}: ${tex3.albedoPath}`);

        // Generate splatmap
        const splatmapGen = new TerrainSplatmapGenerator(this.scene);
        const splatmap = splatmapGen.generateSplatmap(mesh);

        // Load textures
        const albedo1 = new Texture(tex1.albedoPath, this.scene);
        albedo1.uScale = albedo1.vScale = tex1.uvScale;

        const albedo2 = new Texture(tex2.albedoPath, this.scene);
        albedo2.uScale = albedo2.vScale = tex2.uvScale;

        const albedo3 = new Texture(tex3.albedoPath, this.scene);
        albedo3.uScale = albedo3.vScale = tex3.uvScale;


        // Assign textures to mix material based on actual RGB channels
        // Red channel = Forest Leaves (currently flat areas <5°)
        // Green channel = Forest Ground (currently medium slopes 5-20°)
        // Blue channel = Mud Forest (currently steep slopes >20°)
        material.mixTexture1 = splatmap;  // RGB blend map
        material.diffuseTexture1 = albedo3;  // Red = Forest Leaves (tex2)
        material.diffuseTexture2 = albedo2;  // Green = Forest Ground (tex1)
        material.diffuseTexture3 = albedo1;  // Blue = Mud Forest (tex0)
        material.diffuseTexture4 = albedo1;  // Alpha (reuse Mud Forest)

        // Material properties
        material.specularColor = this.scene.getEngine().getCaps().highPrecisionShaderSupported ?
            new (await import('@babylonjs/core/Maths/math.color')).Color3(0.2, 0.2, 0.2) :
            new (await import('@babylonjs/core/Maths/math.color')).Color3(0.2, 0.2, 0.2);

        mesh.material = material;

        console.log('✅ Multi-texture terrain material applied (MixMaterial)');
        console.log(`   Red channel: ${tex3.name} (flat areas <5°)`);
        console.log(`   Green channel: ${tex2.name} (medium slopes 5-20°)`);
        console.log(`   Blue channel: ${tex1.name} (steep slopes >20°)`);
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