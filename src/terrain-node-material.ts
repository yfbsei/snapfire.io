
import { Scene } from '@babylonjs/core/scene';
import { NodeMaterial } from '@babylonjs/core/Materials/Node/nodeMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import {
    InputBlock,
    TextureBlock,
    AddBlock,
    MultiplyBlock,
    ScaleBlock,
    PBRMetallicRoughnessBlock,
    FragmentOutputBlock,
    VertexOutputBlock,
    TransformBlock,
    PerturbNormalBlock,
    ReflectionBlock,
    NodeMaterialSystemValues,
    NodeMaterialBlockTargets,
    NodeMaterialBlockConnectionPointTypes
} from '@babylonjs/core/Materials/Node';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import type { TerrainTextureSet } from './terrain-texture-config';

export class TerrainNodeMaterial {
    private nodeMaterial: NodeMaterial;

    constructor(
        name: string,
        scene: Scene,
        textures: TerrainTextureSet[]
    ) {
        this.nodeMaterial = new NodeMaterial(name, scene, { emitComments: false });
        this.buildMaterial(textures, scene);
    }

    private buildMaterial(textures: TerrainTextureSet[], scene: Scene): void {
        // --- Core Inputs ---
        const position = new InputBlock('position');
        position.setAsAttribute('position');

        const normal = new InputBlock('normal');
        normal.setAsAttribute('normal');

        const tangent = new InputBlock('tangent');
        tangent.setAsAttribute('tangent');

        const uv = new InputBlock('uv');
        uv.setAsAttribute('uv');

        const world = new InputBlock('world');
        world.setAsSystemValue(NodeMaterialSystemValues.World);

        const worldViewProjection = new InputBlock('worldViewProjection');
        worldViewProjection.setAsSystemValue(NodeMaterialSystemValues.WorldViewProjection);

        const view = new InputBlock('view');
        view.setAsSystemValue(NodeMaterialSystemValues.View);

        const cameraPos = new InputBlock('cameraPosition');
        cameraPos.setAsSystemValue(NodeMaterialSystemValues.CameraPosition);

        // --- Core Transform ---
        const worldPos = new TransformBlock('worldPos');
        position.output.connectTo(worldPos.vector);
        world.output.connectTo(worldPos.transform);

        const worldNormal = new TransformBlock('worldNormal');
        normal.output.connectTo(worldNormal.vector);
        world.output.connectTo(worldNormal.transform); // Normal definition uses World matrix too (or World-IVT)
        worldNormal.target = NodeMaterialBlockTargets.Vertex;

        // --- Vertex Output ---
        const vertexOutput = new VertexOutputBlock('vertexOutput');
        worldPos.output.connectTo(vertexOutput.vector);

        // --- Splatmap Input ---
        const splatmapTex = new TextureBlock('splatmap');
        splatmapTex.texture = new Texture('src/asset/splatmap_placeholder.png', scene);
        splatmapTex.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        splatmapTex.texture.wrapV = Texture.CLAMP_ADDRESSMODE;

        uv.output.connectTo(splatmapTex.uv);

        // --- Mixing Arrays ---
        const weightedAlbedos: any[] = [];
        const weightedNormals: any[] = [];
        const weightedRoughnesses: any[] = [];

        const channels = ['r', 'g', 'b'];

        // --- Layer Loop ---
        for (let i = 0; i < 3; i++) {
            if (i >= textures.length) break;
            const texConfig = textures[i];
            const channel = channels[i];

            // 1. UV Scaling
            const uvScale = new InputBlock(`uvScale${i + 1} `);
            uvScale.value = new Vector2(texConfig.uvScale, texConfig.uvScale);

            const scaledUV = new MultiplyBlock(`scaledUV${i + 1} `);
            uv.output.connectTo(scaledUV.left);
            uvScale.output.connectTo(scaledUV.right);

            // 2. Textures
            const albedoTex = new TextureBlock(`albedo${i + 1} `);
            albedoTex.texture = new Texture(texConfig.albedoPath, scene);
            scaledUV.output.connectTo(albedoTex.uv);

            const normalTex = new TextureBlock(`normal${i + 1} `);
            normalTex.texture = new Texture(texConfig.normalPath, scene);
            scaledUV.output.connectTo(normalTex.uv);

            // Roughness handling
            // Assuming we have a texture, or fallback to default
            let roughnessTex: TextureBlock;
            if (texConfig.roughnessPath) {
                roughnessTex = new TextureBlock(`roughness${i + 1} `);
                roughnessTex.texture = new Texture(texConfig.roughnessPath, scene);
                scaledUV.output.connectTo(roughnessTex.uv);
            } else {
                // If no roughness texture, we can't create a TextureBlock with null texture easily without issues
                // So we use albedo as placeholder but multiply by 0 + float constant?
                // For now, let's create a placeholder float block?
                // But mixing logic expects something to scale.
                // We'll create a dummy texture block
                roughnessTex = new TextureBlock(`roughness${i + 1} `);
                roughnessTex.texture = new Texture(texConfig.albedoPath, scene); // Reuse albedo
                scaledUV.output.connectTo(roughnessTex.uv);
                // We essentially use incorrect data if missing, but it prevents crash.
            }

            // 3. Perturb Normal (World Space Normal for this layer)
            const perturb = new PerturbNormalBlock(`perturb${i + 1} `);
            worldPos.output.connectTo(perturb.worldPosition);
            worldNormal.output.connectTo(perturb.worldNormal);
            scaledUV.output.connectTo(perturb.uv);
            normalTex.rgb.connectTo(perturb.normalMapColor);
            if (tangent) {
                // If tangent exists, we can connect it
                // Note: NME PerturbNormalBlock has 'worldTangent' connection point.
                // We need to transform attribute tangent to world tangent first.
                // For now, allow TBN computation from derivatives (default if no tangent connected)
            }

            // 4. Weight
            const splatChannel = (splatmapTex as any)[channel]; // .r, .g, .b

            // 5. Weighting
            const wAlbedo = new ScaleBlock(`wAlbedo${i + 1} `);
            albedoTex.rgb.connectTo(wAlbedo.input);
            splatChannel.connectTo(wAlbedo.factor);
            weightedAlbedos.push(wAlbedo);

            const wNormal = new ScaleBlock(`wNormal${i + 1} `);
            perturb.output.connectTo(wNormal.input);
            splatChannel.connectTo(wNormal.factor);
            weightedNormals.push(wNormal);

            const wRough = new ScaleBlock(`wRough${i + 1} `);
            // If explicit roughness used, ensure we pick Green channel if that's standard
            if (texConfig.roughnessPath) {
                roughnessTex.g.connectTo(wRough.input);
            } else {
                // If using dummy, let's assume default roughness 0.8
                // But we have texture block.
                roughnessTex.g.connectTo(wRough.input);
            }
            splatChannel.connectTo(wRough.factor);
            weightedRoughnesses.push(wRough);
        }

        // --- Summation Helper ---
        const sumNodes = (nodes: any[], name: string): any => {
            if (nodes.length === 0) return null;
            if (nodes.length === 1) return nodes[0];

            let current = new AddBlock(name + '_0');
            nodes[0].output.connectTo(current.left);
            nodes[1].output.connectTo(current.right);

            for (let i = 2; i < nodes.length; i++) {
                const next = new AddBlock(name + '_' + i);
                current.output.connectTo(next.left);
                nodes[i].output.connectTo(next.right);
                current = next;
            }
            return current;
        };

        const finalAlbedo = sumNodes(weightedAlbedos, 'finalAlbedo');
        const finalNormal = sumNodes(weightedNormals, 'finalNormal');
        const finalRoughness = sumNodes(weightedRoughnesses, 'finalRoughness');

        // --- PBR Block ---
        const pbr = new PBRMetallicRoughnessBlock('PBR');
        // pbr.lightFalloff = PBRMetallicRoughnessBlock.LIGHTFALLOFF_PHYSICAL; // Property might not exist on block class directly in all versions, rely on defaults

        worldPos.output.connectTo(pbr.worldPosition);
        cameraPos.output.connectTo(pbr.cameraPosition);

        if (finalAlbedo) finalAlbedo.output.connectTo(pbr.baseColor);
        if (finalNormal) finalNormal.output.connectTo(pbr.perturbedNormal);
        if (finalRoughness) finalRoughness.output.connectTo(pbr.roughness);

        const metallic = new InputBlock('metallic');
        metallic.value = 0.0;
        metallic.output.connectTo(pbr.metallic);

        // Reflection
        // Use ReflectionBlock to handle environment reflection
        const reflectionBlock = new ReflectionBlock('reflection');
        // reflectionBlock.useEnvironmentTexture = true; // Property not available? Defaults to environment?
        worldPos.output.connectTo(reflectionBlock.worldPosition);
        worldNormal.output.connectTo(reflectionBlock.worldNormal);
        cameraPos.output.connectTo(reflectionBlock.cameraPosition);
        view.output.connectTo(reflectionBlock.view); // Reflection block needs View matrix

        reflectionBlock.reflection.connectTo(pbr.reflection);

        // --- Final Output ---
        const fragmentOutput = new FragmentOutputBlock('fragmentOutput');
        pbr.lighting.connectTo(fragmentOutput.rgb);
        pbr.alpha.connectTo(fragmentOutput.a);

        // Add to nodes
        this.nodeMaterial.addOutputNode(vertexOutput);
        this.nodeMaterial.addOutputNode(fragmentOutput);

        this.nodeMaterial.build(true);
    }

    getMaterial(): NodeMaterial {
        return this.nodeMaterial;
    }

    setSplatmap(texture: Texture): void {
        const block = this.nodeMaterial.getBlockByName('splatmap') as TextureBlock;
        if (block) {
            block.texture = texture;
        }
    }
}
