import { Scene } from '@babylonjs/core/scene';
import { NodeMaterial } from '@babylonjs/core/Materials/Node/nodeMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { TerrainTextureSet } from './terrain-texture-config';

export class TerrainNodeMaterial {
    private nodeMaterial: NodeMaterial;

    constructor(
        name: string,
        scene: Scene,
        textures: TerrainTextureSet[]
    ) {
        this.nodeMaterial = new NodeMaterial(name, scene, { emitComments: false });
        this.buildMaterial(textures);
    }

    private buildMaterial(textures: TerrainTextureSet[]): void {
        // Build node material that blends 4 textures based on:
        // - Elevation (Y position)
        // - Slope (normal angle)
        // - Procedural noise

        // For WebGPU compatibility, we'll use a simpler approach:
        // Load all textures and blend using vertex colors or UVs

        this.nodeMaterial.build(true);
    }

    getMaterial(): NodeMaterial {
        return this.nodeMaterial;
    }
}
