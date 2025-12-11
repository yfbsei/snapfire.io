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
        console.log('🎨 Applying terrain material...');

        const { PBRMaterial } = await import('@babylonjs/core/Materials/PBR/pbrMaterial');
        const { Texture } = await import('@babylonjs/core/Materials/Textures/texture');
        const { TERRAIN_TEXTURES } = await import('./terrain-texture-config');

        const material = new PBRMaterial('terrainPBR', this.scene);
        const primaryTex = TERRAIN_TEXTURES[0];

        // UV tiling - 30x on 2km terrain = ~67m per tile
        const uvTiling = 30;

        // ===== ALBEDO TEXTURE =====
        const albedoTexture = new Texture(primaryTex.albedoPath, this.scene, false, true);
        albedoTexture.uScale = uvTiling;
        albedoTexture.vScale = uvTiling;
        albedoTexture.anisotropicFilteringLevel = 16;
        material.albedoTexture = albedoTexture;

        // ===== NORMAL MAP =====
        const bumpTexture = new Texture(primaryTex.normalPath, this.scene, false, true);
        bumpTexture.uScale = uvTiling;
        bumpTexture.vScale = uvTiling;
        bumpTexture.anisotropicFilteringLevel = 16;
        material.bumpTexture = bumpTexture;
        material.bumpTexture.level = 1.0;

        // ===== ARM TEXTURE =====
        if (primaryTex.armPath) {
            const armTexture = new Texture(primaryTex.armPath, this.scene, false, true);
            armTexture.uScale = uvTiling;
            armTexture.vScale = uvTiling;
            armTexture.anisotropicFilteringLevel = 16;
            material.metallicTexture = armTexture;
            material.useAmbientOcclusionFromMetallicTextureRed = true;
            material.useRoughnessFromMetallicTextureGreen = true;
            material.useMetallnessFromMetallicTextureBlue = true;
        }

        // ===== PBR SETTINGS =====
        material.metallic = 0.0;
        material.roughness = 0.85;

        mesh.material = material;
        console.log('✅ Terrain material applied (30x tiling)');
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