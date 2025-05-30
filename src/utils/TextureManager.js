import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'; // ⬅️ Add this line

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.exrLoader = new EXRLoader();
        this.textures = new Map();
        this.materials = new Map();

        // Texture configuration for different surface types
        this.textureConfigs = {
            // Ground/Terrain textures
            grass: {
                baseUrl: '/textures/grass',
                files: {
                    diffuse: 'forest_ground_diff_1k.jpg',
                    normal: 'forest_ground_nor_gl_1k.exr',
                    roughness: 'forest_ground_rough_1k.exr',
                    ao: 'forest_ground_ao_1k.jpg'
                },
                repeat: [16, 16],
                roughness: 0.8
            },

            dirt: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'leafy_grass_diff_1k.jpg',
                    normal: 'leafy_grass_nor_gl_1k.exr',
                    roughness: 'leafy_grass_rough_1k.exr',
                    ao: 'leafy_grass_ao_1k.jpg'
                },
                repeat: [12, 12],
                roughness: 0.9
            },

            rock: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'rock_ground_diff_1k.jpg',
                    normal: 'rock_ground_nor_gl_1k.exr',
                    roughness: 'rock_ground_rough_1k.exr',
                    ao: 'rock_ground_ao_1k.jpg'
                },
                repeat: [8, 8],
                roughness: 0.7
            },

            // Building textures
            concrete: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'concrete_wall_007_diff_1k.jpg',
                    normal: 'concrete_wall_007_nor_gl_1k.exr',
                    roughness: 'concrete_wall_007_rough_1k.exr',
                    ao: 'concrete_wall_007_ao_1k.jpg'
                },
                repeat: [2, 2],
                roughness: 0.8
            },

            brick: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'mixed_brick_wall_diff_1k.jpg',
                    normal: 'mixed_brick_wall_nor_gl_1k.exr',
                    roughness: 'mixed_brick_wall_rough_1k.exr',
                    ao: 'mixed_brick_wall_ao_1k.jpg'
                },
                repeat: [4, 4],
                roughness: 0.7
            },

            metal: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'metal_plate_diff_1k.jpg',
                    normal: 'metal_plate_nor_gl_1k.exr',
                    roughness: 'metal_plate_rough_1k.exr',
                    metallic: 'metal_plate_metal_1k.exr',
                    ao: 'metal_plate_ao_1k.jpg'
                },
                repeat: [3, 3],
                roughness: 0.3,
                metalness: 0.9
            },

            // Tree textures
            bark: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'pine_bark_diff_1k.jpg',
                    normal: 'pine_bark_nor_gl_1k.exr',
                    roughness: 'pine_bark_rough_1k.exr',
                    ao: 'pine_bark_ao_1k.jpg'
                },
                repeat: [1, 3],
                roughness: 0.9
            },

            leaves: {
                baseUrl: '/textures/',
                files: {
                    diffuse: 'leafy_grass_diff_1k.jpg',
                    normal: 'leafy_grass_nor_gl_1k.exr',
                    roughness: 'leafy_grass_rough_1k.exr',
                    ao: 'leafy_grass_ao_1k.jpg'
                },
                repeat: [2, 2],
                roughness: 0.8,
                transparent: true
            }
        };
    }

    async init() {
        console.log('🎨 Initializing Texture Manager...');

        // Load all texture sets
        for (const [name, config] of Object.entries(this.textureConfigs)) {
            try {
                await this.loadTextureSet(name, config);
                console.log(`✅ Loaded texture set: ${name}`);
            } catch (error) {
                console.warn(`⚠️ Failed to load texture set ${name}:`, error);
                // Create fallback material
                this.createFallbackMaterial(name);
            }
        }

        console.log('✅ Texture Manager initialized');
    }

    async loadTextureSet(name, config) {
        const textures = {};
        const promises = [];

        // Load each texture file
        for (const [type, filename] of Object.entries(config.files)) {
            const url = config.baseUrl + filename;
            promises.push(
                this.loadTexture(url).then(texture => {
                    textures[type] = texture;
                    this.configureTexture(texture, config);
                })
            );
        }

        await Promise.all(promises);
        this.textures.set(name, textures);

        // Create material from loaded textures
        this.createMaterial(name, textures, config);
    }

    loadTexture(url) {
        console.log('🔍 Attempting to load texture:', url);
        const isEXR = url.toLowerCase().endsWith('.exr');
        const loader = isEXR ? this.exrLoader : this.loader;

        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (texture) => {
                    console.log('✅ Successfully loaded:', url);

                    if (isEXR) {
                        // EXR-specific configuration
                        texture.encoding = THREE.LinearEncoding;
                        texture.type = THREE.FloatType;
                        texture.minFilter = THREE.LinearFilter;
                        texture.magFilter = THREE.LinearFilter;
                        texture.generateMipmaps = false;
                    }

                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error('❌ Failed to load texture:', url, error);
                    reject(error);
                }
            );
        });
    }

    configureTexture(texture, config) {
        // Set texture repeat
        if (config.repeat) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(config.repeat[0], config.repeat[1]);
        }

        // Improve texture quality
        texture.anisotropy = 16;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
    }

    createMaterial(name, textures, config) {
        const material = new THREE.MeshStandardMaterial({
            map: textures.diffuse || null,
            normalMap: textures.normal || null,
            roughnessMap: textures.roughness || null,
            aoMap: textures.ao || null,
            metalnessMap: textures.metallic || null,

            // Set material properties
            roughness: config.roughness || 0.5,
            metalness: config.metalness || 0.0,

            // Handle transparency
            transparent: config.transparent || false,
            alphaTest: config.transparent ? 0.5 : undefined,

            // Enable AO if available
            aoMapIntensity: textures.ao ? 1.0 : 0
        });

        this.materials.set(name, material);
        return material;
    }

    createFallbackMaterial(name) {
        // Create simple colored material as fallback
        const colors = {
            grass: 0x4a7c59,
            dirt: 0x8B4513,
            rock: 0x696969,
            concrete: 0xBBBBBB,
            brick: 0xB22222,
            metal: 0x888888,
            bark: 0x8B4513,
            leaves: 0x228B22
        };

        const material = new THREE.MeshStandardMaterial({
            color: colors[name] || 0x888888,
            roughness: 0.8
        });

        this.materials.set(name, material);
        console.log(`📦 Created fallback material for: ${name}`);
    }

    // Get material by name
    getMaterial(name) {
        return this.materials.get(name) || this.materials.get('grass'); // Default fallback
    }

    // Get a random building material
    getRandomBuildingMaterial() {
        const buildingMaterials = ['concrete', 'brick', 'metal'];
        const randomType = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)];
        return this.getMaterial(randomType);
    }

    // Dispose of all textures and materials
    dispose() {
        // Dispose textures
        for (const textureSet of this.textures.values()) {
            for (const texture of Object.values(textureSet)) {
                texture.dispose();
            }
        }

        // Dispose materials
        for (const material of this.materials.values()) {
            material.dispose();
        }

        this.textures.clear();
        this.materials.clear();

        console.log('🎨 Texture Manager disposed');
    }
}