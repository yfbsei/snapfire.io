/**
 * MaterialLibrary - Pre-built AAA material presets and utilities
 * Includes PBR materials, layered materials, and specialized shaders
 */
import * as THREE from 'three';

/**
 * Parallax Occlusion Mapping Shader Chunk
 */
const POMShaderChunk = {
    uniforms: {
        heightMap: { value: null },
        heightScale: { value: 0.05 },
        minLayers: { value: 8.0 },
        maxLayers: { value: 32.0 }
    },

    vertexShaderChunk: /* glsl */`
        varying vec3 vViewPosition;
        varying vec3 vTangent;
        varying vec3 vBitangent;
    `,

    vertexShaderMain: /* glsl */`
        vViewPosition = -mvPosition.xyz;
        vTangent = normalize(normalMatrix * tangent.xyz);
        vBitangent = normalize(cross(vNormal, vTangent) * tangent.w);
    `,

    fragmentShaderChunk: /* glsl */`
        uniform sampler2D heightMap;
        uniform float heightScale;
        uniform float minLayers;
        uniform float maxLayers;
        
        varying vec3 vViewPosition;
        varying vec3 vTangent;
        varying vec3 vBitangent;
        
        vec2 parallaxMapping(vec2 texCoords, vec3 viewDir) {
            float numLayers = mix(maxLayers, minLayers, abs(dot(vec3(0.0, 0.0, 1.0), viewDir)));
            float layerDepth = 1.0 / numLayers;
            float currentLayerDepth = 0.0;
            
            vec2 P = viewDir.xy / viewDir.z * heightScale;
            vec2 deltaTexCoords = P / numLayers;
            
            vec2 currentTexCoords = texCoords;
            float currentDepthMapValue = 1.0 - texture2D(heightMap, currentTexCoords).r;
            
            for (int i = 0; i < 32; i++) {
                if (currentLayerDepth >= currentDepthMapValue) break;
                currentTexCoords -= deltaTexCoords;
                currentDepthMapValue = 1.0 - texture2D(heightMap, currentTexCoords).r;
                currentLayerDepth += layerDepth;
            }
            
            vec2 prevTexCoords = currentTexCoords + deltaTexCoords;
            float afterDepth = currentDepthMapValue - currentLayerDepth;
            float beforeDepth = (1.0 - texture2D(heightMap, prevTexCoords).r) - currentLayerDepth + layerDepth;
            float weight = afterDepth / (afterDepth - beforeDepth);
            
            return prevTexCoords * weight + currentTexCoords * (1.0 - weight);
        }
    `
};

/**
 * MaterialLibrary - Factory for AAA material presets
 */
export class MaterialLibrary {
    constructor() {
        this.presets = new Map();
        this.customShaders = new Map();
        this._createPresets();
    }

    _createPresets() {
        // Metal - Polished Steel
        this.presets.set('metalPolished', () => new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.2,
            metalness: 1.0
        }));

        // Metal - Brushed Steel
        this.presets.set('metalBrushed', () => new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.4,
            metalness: 1.0
        }));

        // Metal - Rusty
        this.presets.set('metalRusty', () => new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.8,
            metalness: 0.6
        }));

        // Metal - Gold
        this.presets.set('metalGold', () => new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.3,
            metalness: 1.0
        }));

        // Metal - Copper
        this.presets.set('metalCopper', () => new THREE.MeshStandardMaterial({
            color: 0xb87333,
            roughness: 0.35,
            metalness: 1.0
        }));

        // Glass - Clear
        this.presets.set('glassClear', () => new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.0,
            metalness: 0.0,
            transmission: 0.95,
            thickness: 0.5,
            ior: 1.5,
            transparent: true
        }));

        // Glass - Frosted
        this.presets.set('glassFrosted', () => new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.0,
            transmission: 0.8,
            thickness: 0.5,
            ior: 1.5,
            transparent: true
        }));

        // Glass - Tinted
        this.presets.set('glassTinted', () => new THREE.MeshPhysicalMaterial({
            color: 0x88ccff,
            roughness: 0.0,
            metalness: 0.0,
            transmission: 0.9,
            thickness: 0.5,
            ior: 1.5,
            transparent: true
        }));

        // Skin - Human
        this.presets.set('skinHuman', () => new THREE.MeshPhysicalMaterial({
            color: 0xdbb99d,
            roughness: 0.6,
            metalness: 0.0,
            sheen: 0.5,
            sheenRoughness: 0.5,
            sheenColor: new THREE.Color(0xff9999)
        }));

        // Fabric - Cloth
        this.presets.set('fabricCloth', () => new THREE.MeshPhysicalMaterial({
            color: 0x4466aa,
            roughness: 0.9,
            metalness: 0.0,
            sheen: 0.3,
            sheenRoughness: 0.8,
            sheenColor: new THREE.Color(0xffffff)
        }));

        // Fabric - Leather
        this.presets.set('fabricLeather', () => new THREE.MeshStandardMaterial({
            color: 0x4a3728,
            roughness: 0.7,
            metalness: 0.0
        }));

        // Fabric - Velvet
        this.presets.set('fabricVelvet', () => new THREE.MeshPhysicalMaterial({
            color: 0x800020,
            roughness: 0.95,
            metalness: 0.0,
            sheen: 1.0,
            sheenRoughness: 0.3,
            sheenColor: new THREE.Color(0xff6666)
        }));

        // Stone - Marble
        this.presets.set('stoneMarble', () => new THREE.MeshStandardMaterial({
            color: 0xf0f0f0,
            roughness: 0.15,
            metalness: 0.0
        }));

        // Stone - Concrete
        this.presets.set('stoneConcrete', () => new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.9,
            metalness: 0.0
        }));

        // Stone - Brick
        this.presets.set('stoneBrick', () => new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.85,
            metalness: 0.0
        }));

        // Wood - Polished
        this.presets.set('woodPolished', () => new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.3,
            metalness: 0.0
        }));

        // Wood - Rough
        this.presets.set('woodRough', () => new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8,
            metalness: 0.0
        }));

        // Plastic - Glossy
        this.presets.set('plasticGlossy', () => new THREE.MeshStandardMaterial({
            color: 0xff0000,
            roughness: 0.1,
            metalness: 0.0
        }));

        // Plastic - Matte
        this.presets.set('plasticMatte', () => new THREE.MeshStandardMaterial({
            color: 0x0066cc,
            roughness: 0.6,
            metalness: 0.0
        }));

        // Water/Liquid
        this.presets.set('water', () => new THREE.MeshPhysicalMaterial({
            color: 0x4488ff,
            roughness: 0.0,
            metalness: 0.0,
            transmission: 0.9,
            thickness: 2.0,
            ior: 1.33,
            transparent: true
        }));

        // Emissive - Neon
        this.presets.set('emissiveNeon', () => new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.5,
            metalness: 0.0,
            emissive: new THREE.Color(0x00ffff),
            emissiveIntensity: 2.0
        }));

        // Car Paint - Metallic
        this.presets.set('carPaint', () => new THREE.MeshPhysicalMaterial({
            color: 0xff0000,
            roughness: 0.3,
            metalness: 0.8,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        }));

        // Carbon Fiber
        this.presets.set('carbonFiber', () => new THREE.MeshPhysicalMaterial({
            color: 0x222222,
            roughness: 0.4,
            metalness: 0.0,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2
        }));
    }

    /**
     * Get a material preset by name
     * @param {string} name
     * @returns {THREE.Material}
     */
    get(name) {
        const factory = this.presets.get(name);
        if (!factory) {
            console.warn(`MaterialLibrary: Unknown preset "${name}"`);
            return new THREE.MeshStandardMaterial();
        }
        return factory();
    }

    /**
     * Get all preset names
     * @returns {string[]}
     */
    getPresetNames() {
        return Array.from(this.presets.keys());
    }

    /**
     * Create a layered material (blends between two materials based on mask)
     * @param {THREE.Material} baseMaterial
     * @param {THREE.Material} topMaterial
     * @param {THREE.Texture} maskTexture - R channel = blend factor
     * @returns {THREE.ShaderMaterial}
     */
    createLayeredMaterial(baseMaterial, topMaterial, maskTexture) {
        // This is a simplified version - full implementation would use custom shader
        console.warn('MaterialLibrary: Full layered materials require custom shader. Using weighted blend.');

        const blendedMaterial = baseMaterial.clone();

        // Mix colors
        if (baseMaterial.color && topMaterial.color) {
            blendedMaterial.color = new THREE.Color().lerpColors(
                baseMaterial.color,
                topMaterial.color,
                0.5
            );
        }

        // Average roughness/metalness
        if (baseMaterial.roughness !== undefined && topMaterial.roughness !== undefined) {
            blendedMaterial.roughness = (baseMaterial.roughness + topMaterial.roughness) / 2;
        }
        if (baseMaterial.metalness !== undefined && topMaterial.metalness !== undefined) {
            blendedMaterial.metalness = (baseMaterial.metalness + topMaterial.metalness) / 2;
        }

        return blendedMaterial;
    }

    /**
     * Create a material with Parallax Occlusion Mapping
     * @param {Object} options
     * @returns {THREE.MeshStandardMaterial}
     */
    createPOMMaterial(options = {}) {
        const material = new THREE.MeshStandardMaterial({
            map: options.diffuseMap ?? null,
            normalMap: options.normalMap ?? null,
            roughnessMap: options.roughnessMap ?? null,
            metalnessMap: options.metalnessMap ?? null,
            color: options.color ?? 0xffffff,
            roughness: options.roughness ?? 0.5,
            metalness: options.metalness ?? 0.0
        });

        // Store POM settings for later use
        material.userData.pom = {
            heightMap: options.heightMap ?? null,
            heightScale: options.heightScale ?? 0.05,
            enabled: true
        };

        // Note: Full POM requires shader modification via onBeforeCompile
        // This is a simplified version that stores the data
        if (options.heightMap) {
            material.displacementMap = options.heightMap;
            material.displacementScale = options.heightScale * 0.1; // Simple displacement fallback
        }

        return material;
    }

    /**
     * Create a wet/dry blending material
     * @param {THREE.Material} dryMaterial
     * @param {number} wetness - 0 = dry, 1 = fully wet
     * @returns {THREE.Material}
     */
    createWetMaterial(dryMaterial, wetness = 0) {
        const wetMaterial = dryMaterial.clone();

        // Wet surfaces are darker and more reflective
        if (wetMaterial.color) {
            const darken = 1 - wetness * 0.3;
            wetMaterial.color.multiplyScalar(darken);
        }

        // Reduce roughness (wet = shinier)
        if (wetMaterial.roughness !== undefined) {
            wetMaterial.roughness = THREE.MathUtils.lerp(
                wetMaterial.roughness,
                0.1,
                wetness
            );
        }

        return wetMaterial;
    }

    /**
     * Create a damage/wear material
     * @param {THREE.Material} cleanMaterial
     * @param {number} damageLevel - 0 = pristine, 1 = fully damaged
     * @returns {THREE.Material}
     */
    createDamagedMaterial(cleanMaterial, damageLevel = 0) {
        const damagedMaterial = cleanMaterial.clone();

        // Increase roughness with damage
        if (damagedMaterial.roughness !== undefined) {
            damagedMaterial.roughness = THREE.MathUtils.lerp(
                damagedMaterial.roughness,
                0.95,
                damageLevel
            );
        }

        // Desaturate color
        if (damagedMaterial.color) {
            const gray = damagedMaterial.color.getHSL({}).l;
            const grayColor = new THREE.Color(gray, gray, gray);
            damagedMaterial.color.lerp(grayColor, damageLevel * 0.5);
        }

        return damagedMaterial;
    }

    /**
     * Get preset names by category
     * @returns {Object}
     */
    getPresetsByCategory() {
        return {
            metal: ['metalPolished', 'metalBrushed', 'metalRusty', 'metalGold', 'metalCopper'],
            glass: ['glassClear', 'glassFrosted', 'glassTinted'],
            fabric: ['fabricCloth', 'fabricLeather', 'fabricVelvet', 'skinHuman'],
            stone: ['stoneMarble', 'stoneConcrete', 'stoneBrick'],
            wood: ['woodPolished', 'woodRough'],
            plastic: ['plasticGlossy', 'plasticMatte'],
            special: ['water', 'emissiveNeon', 'carPaint', 'carbonFiber']
        };
    }
}

// Singleton instance
export const materialLibrary = new MaterialLibrary();
export default MaterialLibrary;
