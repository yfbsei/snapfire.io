import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.exrLoader = null; // Will be loaded dynamically
        this.textures = new Map();
        this.materials = new Map();

        // Texture configuration for different surface types
        this.textureConfigs = {
            // Ground/Terrain textures
            grass: {
                baseUrl: '/textures/grass/',
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
                baseUrl: '/textures/dirt/',
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
                baseUrl: '/textures/rock/',
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
                baseUrl: '/textures/concrete/',
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
                baseUrl: '/textures/brick/',
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
                baseUrl: '/textures/metal/',
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
                baseUrl: '/textures/bark/',
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
                baseUrl: '/textures/leaves/',
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

    async loadEXRLoader() {
        if (this.exrLoader) return;

        try {
            // Try different import paths for EXRLoader based on Three.js version
            let EXRLoader;

            try {
                // Modern Three.js (0.150+)
                const module = await import('three/addons/loaders/EXRLoader.js');
                EXRLoader = module.EXRLoader;
            } catch (e) {
                try {
                    // Older Three.js (0.130-0.149)
                    const module = await import('three/examples/jsm/loaders/EXRLoader.js');
                    EXRLoader = module.EXRLoader;
                } catch (e2) {
                    console.warn('⚠️ EXRLoader not available, falling back to regular textures');
                    return;
                }
            }

            this.exrLoader = new EXRLoader();
            console.log('✅ EXRLoader initialized successfully');
        } catch (error) {
            console.warn('⚠️ Failed to load EXRLoader:', error);
        }
    }

    async init() {
        console.log('🎨 Initializing Texture Manager...');

        // Load EXR loader first
        await this.loadEXRLoader();

        // Load all texture sets
        const loadPromises = [];
        for (const [name, config] of Object.entries(this.textureConfigs)) {
            loadPromises.push(
                this.loadTextureSet(name, config).catch(error => {
                    console.warn(`⚠️ Failed to load texture set ${name}:`, error);
                    this.createFallbackMaterial(name);
                })
            );
        }

        await Promise.allSettled(loadPromises);
        console.log('✅ Texture Manager initialized');
    }

    async loadTextureSet(name, config) {
        const textures = {};
        const promises = [];

        // Load each texture file
        for (const [type, filename] of Object.entries(config.files)) {
            const url = `${config.baseUrl}${filename}`;
            promises.push(
                this.loadTexture(url, type).then(texture => {
                    if (texture) {
                        textures[type] = texture;
                        this.configureTexture(texture, config, type);
                    }
                }).catch(error => {
                    console.warn(`⚠️ Failed to load ${type} texture for ${name}:`, error);
                    // Continue without this texture
                })
            );
        }

        await Promise.allSettled(promises);

        // Only create material if we have at least a diffuse texture
        if (textures.diffuse || Object.keys(textures).length > 0) {
            this.textures.set(name, textures);
            this.createMaterial(name, textures, config);
            console.log(`✅ Loaded texture set: ${name} (${Object.keys(textures).length} textures)`);
        } else {
            throw new Error(`No textures loaded for ${name}`);
        }
    }

    async loadTexture(url, type) {
        const isEXR = url.toLowerCase().endsWith('.exr');

        // Skip EXR files if loader is not available
        if (isEXR && !this.exrLoader) {
            console.warn(`⚠️ Skipping EXR texture (no loader): ${url}`);
            return null;
        }

        const loader = isEXR ? this.exrLoader : this.loader;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Texture loading timeout: ${url}`));
            }, 10000); // 10 second timeout

            loader.load(
                url,
                (texture) => {
                    clearTimeout(timeout);
                    console.log(`✅ Successfully loaded: ${url}`);

                    if (isEXR) {
                        this.configureEXRTexture(texture, type);
                    } else {
                        this.configureRegularTexture(texture, type);
                    }

                    resolve(texture);
                },
                (progress) => {
                    // Optional: handle loading progress
                },
                (error) => {
                    clearTimeout(timeout);
                    console.error(`❌ Failed to load texture: ${url}`, error);
                    reject(error);
                }
            );
        });
    }

    configureEXRTexture(texture, type) {
        // Configure EXR textures based on Three.js version
        if (THREE.LinearSRGBColorSpace !== undefined) {
            // Three.js 0.152+
            texture.colorSpace = type === 'diffuse' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        } else if (THREE.LinearEncoding !== undefined) {
            // Three.js 0.150-0.151
            texture.encoding = type === 'diffuse' ? THREE.sRGBEncoding : THREE.LinearEncoding;
        }

        // EXR-specific settings
        texture.type = THREE.FloatType;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.flipY = false; // EXR files usually don't need flipping
    }

    configureRegularTexture(texture, type) {
        // Configure regular textures
        if (THREE.SRGBColorSpace !== undefined) {
            // Three.js 0.152+
            texture.colorSpace = type === 'diffuse' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        } else if (THREE.sRGBEncoding !== undefined) {
            // Three.js 0.150-0.151
            texture.encoding = type === 'diffuse' ? THREE.sRGBEncoding : THREE.LinearEncoding;
        }

        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
    }

    configureTexture(texture, config, type) {
        // Set texture repeat
        if (config.repeat) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(config.repeat[0], config.repeat[1]);
        }

        // Improve texture quality
        if (texture.anisotropy !== undefined) {
            texture.anisotropy = Math.min(16, texture.image?.width || 16);
        }
    }

    createMaterial(name, textures, config) {
        const materialProps = {
            // Basic maps
            map: textures.diffuse || null,
            normalMap: textures.normal || null,
            roughnessMap: textures.roughness || null,
            aoMap: textures.ao || null,
            metalnessMap: textures.metallic || null,

            // Material properties
            roughness: config.roughness || 0.5,
            metalness: config.metalness || 0.0,

            // Handle transparency
            transparent: config.transparent || false,
            side: config.transparent ? THREE.DoubleSide : THREE.FrontSide,

            // Enable AO if available
            aoMapIntensity: textures.ao ? 1.0 : 0
        };

        // Set alpha test for transparent materials
        if (config.transparent) {
            materialProps.alphaTest = 0.5;
        }

        const material = new THREE.MeshStandardMaterial(materialProps);
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
            roughness: 0.8,
            metalness: name === 'metal' ? 0.9 : 0.0
        });

        this.materials.set(name, material);
        console.log(`📦 Created fallback material for: ${name}`);
    }

    // Get material by name
    getMaterial(name) {
        const material = this.materials.get(name);
        if (!material) {
            console.warn(`⚠️ Material '${name}' not found, using fallback`);
            this.createFallbackMaterial(name);
            return this.materials.get(name);
        }
        return material;
    }

    // Get a random building material
    getRandomBuildingMaterial() {
        const buildingMaterials = ['concrete', 'brick', 'metal'];
        const randomType = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)];
        return this.getMaterial(randomType);
    }

    // Check if a texture set is loaded
    isTextureSetLoaded(name) {
        return this.materials.has(name);
    }

    // Get loading status
    getLoadingStatus() {
        const total = Object.keys(this.textureConfigs).length;
        const loaded = this.materials.size;
        return {
            total,
            loaded,
            percentage: (loaded / total) * 100
        };
    }

    // Dispose of all textures and materials
    dispose() {
        console.log('🎨 Disposing Texture Manager...');

        // Dispose textures
        for (const textureSet of this.textures.values()) {
            for (const texture of Object.values(textureSet)) {
                if (texture && texture.dispose) {
                    texture.dispose();
                }
            }
        }

        // Dispose materials
        for (const material of this.materials.values()) {
            if (material && material.dispose) {
                material.dispose();
            }
        }

        this.textures.clear();
        this.materials.clear();

        console.log('✅ Texture Manager disposed');
    }
}