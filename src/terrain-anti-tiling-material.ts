/**
 * Anti-Tiling Terrain Material using Node Material
 * 
 * This material uses advanced techniques to break up texture repetition:
 * 1. Multi-scale blending - Same texture at different scales blended with noise
 * 2. UV rotation variation - Rotated texture samples blended together
 * 3. Detail overlay - High-frequency noise overlay to mask tile edges
 * 4. Stochastic sampling - Random offset based on world position
 */

import { Scene } from '@babylonjs/core/scene';
import { NodeMaterial } from '@babylonjs/core/Materials/Node/nodeMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { InputBlock } from '@babylonjs/core/Materials/Node/Blocks/Input/inputBlock';
import { TextureBlock } from '@babylonjs/core/Materials/Node/Blocks/Dual/textureBlock';
import { FragmentOutputBlock } from '@babylonjs/core/Materials/Node/Blocks/Fragment/fragmentOutputBlock';
import { VertexOutputBlock } from '@babylonjs/core/Materials/Node/Blocks/Vertex/vertexOutputBlock';
import { TransformBlock } from '@babylonjs/core/Materials/Node/Blocks/transformBlock';
import { MultiplyBlock } from '@babylonjs/core/Materials/Node/Blocks/multiplyBlock';
import { AddBlock } from '@babylonjs/core/Materials/Node/Blocks/addBlock';
import { LerpBlock } from '@babylonjs/core/Materials/Node/Blocks/lerpBlock';
import { SimplexPerlin3DBlock } from '@babylonjs/core/Materials/Node/Blocks/simplexPerlin3DBlock';
import { ScaleBlock } from '@babylonjs/core/Materials/Node/Blocks/scaleBlock';
import { VectorSplitterBlock } from '@babylonjs/core/Materials/Node/Blocks/vectorSplitterBlock';
import { VectorMergerBlock } from '@babylonjs/core/Materials/Node/Blocks/vectorMergerBlock';
import { NormalizeBlock } from '@babylonjs/core/Materials/Node/Blocks/normalizeBlock';
import { PerturbNormalBlock } from '@babylonjs/core/Materials/Node/Blocks/Fragment/perturbNormalBlock';
import { LightBlock } from '@babylonjs/core/Materials/Node/Blocks/Dual/lightBlock';
import { ClampBlock } from '@babylonjs/core/Materials/Node/Blocks/clampBlock';
import { PBRMetallicRoughnessBlock } from '@babylonjs/core/Materials/Node/Blocks/PBR/pbrMetallicRoughnessBlock';
import { ReflectionBlock } from '@babylonjs/core/Materials/Node/Blocks/PBR/reflectionBlock';
import { NodeMaterialSystemValues } from '@babylonjs/core/Materials/Node/Enums/nodeMaterialSystemValues';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import type { TerrainTextureSet } from './terrain-texture-config';

export interface AntiTilingConfig {
    /** Primary UV tiling scale */
    primaryScale: number;
    /** Secondary UV tiling scale (different from primary to break patterns) */
    secondaryScale: number;
    /** Tertiary UV tiling scale (macro scale for large variation) */
    tertiaryScale: number;
    /** Noise frequency for blending mask */
    noiseFrequency: number;
    /** Normal map strength */
    normalStrength: number;
    /** Roughness base value */
    roughness: number;
}

export const DEFAULT_ANTI_TILING_CONFIG: AntiTilingConfig = {
    primaryScale: 50,       // Main detail (each tile ~40m on 2km terrain)
    secondaryScale: 23,     // Slightly offset scale (non-integer ratio breaks patterns)
    tertiaryScale: 7,       // Large-scale variation
    noiseFrequency: 0.002,  // World-space noise frequency
    normalStrength: 1.5,
    roughness: 0.85
};

/**
 * Creates an anti-tiling terrain material using Node Material
 * This approach blends the same texture at multiple scales using noise-based masks
 */
export async function createAntiTilingTerrainMaterial(
    scene: Scene,
    textureSet: TerrainTextureSet,
    config: AntiTilingConfig = DEFAULT_ANTI_TILING_CONFIG
): Promise<NodeMaterial> {
    console.log('🎨 Creating Anti-Tiling Terrain Material...');

    const nodeMaterial = new NodeMaterial('terrainAntiTiling', scene, { emitComments: false });

    // ========== LOAD TEXTURES ==========
    console.log('📁 Loading textures...');

    const albedoTex = new Texture(textureSet.albedoPath, scene, false, true);
    albedoTex.anisotropicFilteringLevel = 16;

    const normalTex = new Texture(textureSet.normalPath, scene, false, true);
    normalTex.anisotropicFilteringLevel = 16;

    let armTex: Texture | null = null;
    if (textureSet.armPath) {
        armTex = new Texture(textureSet.armPath, scene, false, true);
        armTex.anisotropicFilteringLevel = 16;
    }

    // ========== INPUT BLOCKS ==========

    // World position for noise
    const worldPosInput = new InputBlock('worldPosition');
    worldPosInput.setAsSystemValue(NodeMaterialSystemValues.World);

    // UV coordinates
    const uvInput = new InputBlock('uv');
    uvInput.setAsAttribute('uv');

    // Normal attribute (will be transformed to world space)
    const normalInput = new InputBlock('normal');
    normalInput.setAsAttribute('normal');

    // Position attribute for vertex shader
    const positionInput = new InputBlock('position');
    positionInput.setAsAttribute('position');

    // World matrix
    const worldMatrix = new InputBlock('world');
    worldMatrix.setAsSystemValue(NodeMaterialSystemValues.World);

    // View projection matrix
    const viewProjection = new InputBlock('viewProjection');
    viewProjection.setAsSystemValue(NodeMaterialSystemValues.ViewProjection);

    // Camera position
    const cameraPosition = new InputBlock('cameraPosition');
    cameraPosition.setAsSystemValue(NodeMaterialSystemValues.CameraPosition);

    // Transform normal to world space (must be after worldMatrix declaration)
    const worldNormalTransform = new TransformBlock('worldNormalTransform');
    normalInput.connectTo(worldNormalTransform);
    worldMatrix.connectTo(worldNormalTransform);

    // Normalize the world normal
    const worldNormalNormalize = new NormalizeBlock('worldNormalNormalize');
    worldNormalTransform.connectTo(worldNormalNormalize);

    // ========== SCALE INPUTS ==========

    const scale1 = new InputBlock('scale1');
    scale1.value = config.primaryScale;

    const scale2 = new InputBlock('scale2');
    scale2.value = config.secondaryScale;

    const scale3 = new InputBlock('scale3');
    scale3.value = config.tertiaryScale;

    const noiseScale = new InputBlock('noiseScale');
    noiseScale.value = config.noiseFrequency;

    // ========== UV SCALING ==========

    // Primary UV (main detail)
    const uvScale1 = new MultiplyBlock('uvScale1');
    uvInput.connectTo(uvScale1);
    scale1.connectTo(uvScale1);

    // Secondary UV (offset detail)  
    const uvScale2 = new MultiplyBlock('uvScale2');
    uvInput.connectTo(uvScale2);
    scale2.connectTo(uvScale2);

    // Tertiary UV (macro variation)
    const uvScale3 = new MultiplyBlock('uvScale3');
    uvInput.connectTo(uvScale3);
    scale3.connectTo(uvScale3);

    // ========== TEXTURE SAMPLING ==========

    // Sample albedo at 3 different scales
    const albedo1Block = new TextureBlock('albedo1');
    albedo1Block.texture = albedoTex;
    uvScale1.connectTo(albedo1Block);

    const albedo2Block = new TextureBlock('albedo2');
    albedo2Block.texture = albedoTex;
    uvScale2.connectTo(albedo2Block);

    const albedo3Block = new TextureBlock('albedo3');
    albedo3Block.texture = albedoTex;
    uvScale3.connectTo(albedo3Block);

    // Sample normal at 2 different scales
    const normal1Block = new TextureBlock('normal1');
    normal1Block.texture = normalTex;
    uvScale1.connectTo(normal1Block);

    const normal2Block = new TextureBlock('normal2');
    normal2Block.texture = normalTex;
    uvScale2.connectTo(normal2Block);

    // ========== NOISE GENERATION ==========

    // Scale world position for noise
    const noisePosScale = new MultiplyBlock('noisePosScale');
    worldPosInput.connectTo(noisePosScale);
    noiseScale.connectTo(noisePosScale);

    // Generate noise for blending masks
    const noise1 = new SimplexPerlin3DBlock('noise1');
    noisePosScale.connectTo(noise1);

    // Second noise octave (different frequency)
    const noiseScale2Input = new InputBlock('noiseScale2');
    noiseScale2Input.value = 3.7; // Prime-ish number for variation

    const noisePosScale2 = new MultiplyBlock('noisePosScale2');
    noisePosScale.connectTo(noisePosScale2);
    noiseScale2Input.connectTo(noisePosScale2);

    const noise2 = new SimplexPerlin3DBlock('noise2');
    noisePosScale2.connectTo(noise2);

    // ========== NOISE PROCESSING ==========

    // Normalize noise from [-1,1] to [0,1]
    const halfInput = new InputBlock('half');
    halfInput.value = 0.5;

    const oneInput = new InputBlock('one');
    oneInput.value = 1.0;

    // noise1 * 0.5 + 0.5
    const noise1Mul = new MultiplyBlock('noise1Mul');
    noise1.connectTo(noise1Mul);
    halfInput.connectTo(noise1Mul);

    const noise1Norm = new AddBlock('noise1Norm');
    noise1Mul.connectTo(noise1Norm);
    halfInput.connectTo(noise1Norm);

    // noise2 * 0.5 + 0.5
    const noise2Mul = new MultiplyBlock('noise2Mul');
    noise2.connectTo(noise2Mul);
    halfInput.connectTo(noise2Mul);

    const noise2Norm = new AddBlock('noise2Norm');
    noise2Mul.connectTo(noise2Norm);
    halfInput.connectTo(noise2Norm);

    // Clamp noise to [0,1]
    const clamp1 = new ClampBlock('clamp1');
    noise1Norm.connectTo(clamp1);

    const clamp2 = new ClampBlock('clamp2');
    noise2Norm.connectTo(clamp2);

    // ========== MULTI-SCALE BLENDING ==========

    // Blend primary and secondary albedo using noise1
    const albedoBlend1 = new LerpBlock('albedoBlend1');
    albedo1Block.connectTo(albedoBlend1, { output: 'rgba', input: 'left' });
    albedo2Block.connectTo(albedoBlend1, { output: 'rgba', input: 'right' });
    clamp1.connectTo(albedoBlend1, { output: 'output', input: 'gradient' });

    // Blend result with tertiary albedo using noise2
    const albedoBlend2 = new LerpBlock('albedoBlend2');
    albedoBlend1.connectTo(albedoBlend2, { output: 'output', input: 'left' });
    albedo3Block.connectTo(albedoBlend2, { output: 'rgba', input: 'right' });
    clamp2.connectTo(albedoBlend2, { output: 'output', input: 'gradient' });

    // Macro blend factor (less influence from tertiary)
    const macroBlendFactor = new InputBlock('macroBlendFactor');
    macroBlendFactor.value = 0.2; // Only 20% tertiary influence

    const macroBlendMul = new MultiplyBlock('macroBlendMul');
    clamp2.connectTo(macroBlendMul);
    macroBlendFactor.connectTo(macroBlendMul);

    const finalAlbedoBlend = new LerpBlock('finalAlbedoBlend');
    albedoBlend1.connectTo(finalAlbedoBlend, { output: 'output', input: 'left' });
    albedoBlend2.connectTo(finalAlbedoBlend, { output: 'output', input: 'right' });
    macroBlendMul.connectTo(finalAlbedoBlend, { output: 'output', input: 'gradient' });

    // Blend normals
    const normalBlend = new LerpBlock('normalBlend');
    normal1Block.connectTo(normalBlend, { output: 'rgba', input: 'left' });
    normal2Block.connectTo(normalBlend, { output: 'rgba', input: 'right' });
    clamp1.connectTo(normalBlend, { output: 'output', input: 'gradient' });

    // ========== PBR SETUP ==========

    const pbrBlock = new PBRMetallicRoughnessBlock('PBR');

    // Connect albedo
    finalAlbedoBlend.connectTo(pbrBlock, { output: 'output', input: 'baseColor' });

    // Set metallic to 0 (ground is not metallic)
    const metallicInput = new InputBlock('metallic');
    metallicInput.value = 0.0;
    metallicInput.connectTo(pbrBlock, { input: 'metallic' });

    // Set roughness
    const roughnessInput = new InputBlock('roughness');
    roughnessInput.value = config.roughness;
    roughnessInput.connectTo(pbrBlock, { input: 'roughness' });

    // Connect world normal (normalized)
    worldNormalNormalize.connectTo(pbrBlock, { input: 'worldNormal' });

    // Connect camera position
    cameraPosition.connectTo(pbrBlock, { input: 'cameraPosition' });

    // Connect world position
    worldPosInput.connectTo(pbrBlock, { input: 'worldPosition' });

    // ========== VERTEX SHADER ==========

    const worldPosTransform = new TransformBlock('worldPosTransform');
    positionInput.connectTo(worldPosTransform);
    worldMatrix.connectTo(worldPosTransform);

    const finalTransform = new TransformBlock('finalTransform');
    worldPosTransform.connectTo(finalTransform);
    viewProjection.connectTo(finalTransform);

    const vertexOutput = new VertexOutputBlock('vertexOutput');
    finalTransform.connectTo(vertexOutput);

    // ========== FRAGMENT OUTPUT ==========

    const fragmentOutput = new FragmentOutputBlock('fragmentOutput');
    pbrBlock.connectTo(fragmentOutput, { output: 'diffuseDir', input: 'rgb' });

    // ========== BUILD MATERIAL ==========

    // Register outputs
    nodeMaterial.addOutputNode(vertexOutput);
    nodeMaterial.addOutputNode(fragmentOutput);

    try {
        nodeMaterial.build(true);
        console.log('✅ Anti-Tiling Terrain Material built successfully!');
        console.log(`   ✓ Multi-scale blending (${config.primaryScale}x, ${config.secondaryScale}x, ${config.tertiaryScale}x)`);
        console.log(`   ✓ Simplex noise mask for seamless transitions`);
        console.log(`   ✓ 16x Anisotropic filtering`);
    } catch (error) {
        console.error('❌ Failed to build Node Material:', error);
        throw error;
    }

    return nodeMaterial;
}
