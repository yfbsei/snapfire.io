/**
 * Terrain Material
 * 
 * A custom ShaderMaterial for multi-layer PBR terrain rendering.
 * Handles texture loading and shader uniform management.
 */

import { Scene } from '@babylonjs/core/scene';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Effect } from '@babylonjs/core/Materials/effect';
import { TerrainConfig } from './TerrainConfig';
import { terrainVertexShader, terrainFragmentShader } from './TerrainShaders';

// Register custom shaders with Babylon.js
Effect.ShadersStore['terrainVertexShader'] = terrainVertexShader;
Effect.ShadersStore['terrainFragmentShader'] = terrainFragmentShader;

export class TerrainMaterial {
    private material: ShaderMaterial;
    private textures: Map<string, Texture> = new Map();
    private config: TerrainConfig;
    private scene: Scene;

    constructor(scene: Scene, config: TerrainConfig) {
        this.scene = scene;
        this.config = config;
        this.material = this.createMaterial();
        this.loadTextures();
        this.setUniforms();
    }

    /**
     * Creates the shader material with all required attributes and uniforms
     */
    private createMaterial(): ShaderMaterial {
        const material = new ShaderMaterial(
            'terrainMaterial',
            this.scene,
            {
                vertex: 'terrain',
                fragment: 'terrain',
            },
            {
                attributes: ['position', 'normal', 'uv'],
                uniforms: [
                    // Matrices
                    'world',
                    'worldView',
                    'worldViewProjection',
                    // Terrain parameters
                    'textureScale',
                    'terrainWidth',
                    'terrainHeight',
                    'minHeight',
                    'maxHeight',
                    // Blending parameters
                    'slopeStart',
                    'slopeEnd',
                    'heightStart',
                    'heightEnd',
                    'lightDirection',
                    'lightColor',
                    'ambientColor',
                    'cameraPosition',
                    'debugMode',
                ],
                samplers: [
                    'grassDiffuse',
                    'grassNormal',
                    'grassRoughness',
                    'rockDiffuse',
                    'rockNormal',
                    'rockRoughness',
                    'burnedDiffuse',
                    'burnedNormal',
                    'burnedRoughness',
                ],
            }
        );

        // Enable backface culling for performance
        material.backFaceCulling = true;

        return material;
    }

    /**
     * Loads all terrain textures
     */
    private loadTextures(): void {
        const textureConfigs = [
            { name: 'grassDiffuse', path: this.config.textures.grass.diffuse },
            { name: 'grassNormal', path: this.config.textures.grass.normal },
            { name: 'grassRoughness', path: this.config.textures.grass.roughness },
            { name: 'rockDiffuse', path: this.config.textures.rock.diffuse },
            { name: 'rockNormal', path: this.config.textures.rock.normal },
            { name: 'rockRoughness', path: this.config.textures.rock.roughness },
            { name: 'burnedDiffuse', path: this.config.textures.burned.diffuse },
            { name: 'burnedNormal', path: this.config.textures.burned.normal },
            { name: 'burnedRoughness', path: this.config.textures.burned.roughness },
        ];

        for (const { name, path } of textureConfigs) {
            const texture = new Texture(path, this.scene, false, false);
            texture.wrapU = Texture.WRAP_ADDRESSMODE;
            texture.wrapV = Texture.WRAP_ADDRESSMODE;

            // Use anisotropic filtering for better quality at angles
            texture.anisotropicFilteringLevel = 8;

            this.textures.set(name, texture);
            this.material.setTexture(name, texture);
        }

        console.log(`[TerrainMaterial] Loaded ${textureConfigs.length} textures`);
    }

    /**
     * Sets initial uniform values
     */
    private setUniforms(): void {
        const { config } = this;

        // Terrain dimensions
        this.material.setFloat('textureScale', config.textureScale);
        this.material.setFloat('terrainWidth', config.width);
        this.material.setFloat('terrainHeight', config.height);
        this.material.setFloat('minHeight', config.minHeight);
        this.material.setFloat('maxHeight', config.maxHeight);

        // Blending parameters
        this.material.setFloat('slopeStart', config.blending.slopeStart);
        this.material.setFloat('slopeEnd', config.blending.slopeEnd);
        this.material.setFloat('heightStart', config.blending.heightStart);
        this.material.setFloat('heightEnd', config.blending.heightEnd);

        // Default lighting (can be updated at runtime)
        this.material.setVector3('lightDirection', new Vector3(0.5, 1.0, 0.3).normalize());
        this.material.setVector3('lightColor', new Vector3(1.0, 0.98, 0.95)); // Warm sunlight
        this.material.setVector3('ambientColor', new Vector3(0.15, 0.18, 0.25)); // Cool ambient
        this.material.setVector3('cameraPosition', new Vector3(0, 50, 0));

        console.log('[TerrainMaterial] Uniforms set:', {
            textureScale: config.textureScale,
            terrainWidth: config.width,
            terrainHeight: config.height,
            minHeight: config.minHeight,
            maxHeight: config.maxHeight,
            slopeStart: config.blending.slopeStart,
            slopeEnd: config.blending.slopeEnd,
            heightStart: config.blending.heightStart,
            heightEnd: config.blending.heightEnd,
        });

        // Debug mode off by default - set to 1.0 to see blend factors as colors
        this.material.setFloat('debugMode', 0.0); // Debug mode OFF - showing actual textures
    }

    /**
     * Updates camera position for correct specular highlights
     */
    public updateCameraPosition(position: Vector3): void {
        this.material.setVector3('cameraPosition', position);
    }

    /**
     * Updates light direction (e.g., for day/night cycle)
     */
    public updateLightDirection(direction: Vector3): void {
        this.material.setVector3('lightDirection', direction.normalize());
    }

    /**
     * Updates light color
     */
    public updateLightColor(color: Vector3): void {
        this.material.setVector3('lightColor', color);
    }

    /**
     * Updates ambient color
     */
    public updateAmbientColor(color: Vector3): void {
        this.material.setVector3('ambientColor', color);
    }

    /**
     * Updates blending parameters at runtime
     */
    public updateBlending(
        slopeStart?: number,
        slopeEnd?: number,
        heightStart?: number,
        heightEnd?: number
    ): void {
        if (slopeStart !== undefined) this.material.setFloat('slopeStart', slopeStart);
        if (slopeEnd !== undefined) this.material.setFloat('slopeEnd', slopeEnd);
        if (heightStart !== undefined) this.material.setFloat('heightStart', heightStart);
        if (heightEnd !== undefined) this.material.setFloat('heightEnd', heightEnd);
    }

    /**
     * Gets the underlying ShaderMaterial for assignment to mesh
     */
    public getMaterial(): ShaderMaterial {
        return this.material;
    }

    /**
     * Disposes of all textures and the material
     */
    public dispose(): void {
        for (const texture of this.textures.values()) {
            texture.dispose();
        }
        this.textures.clear();
        this.material.dispose();
    }
}
