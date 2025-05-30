import * as THREE from 'three';

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.textures = new Map();
        this.materials = new Map();

        // Try to load external textures, but have good fallbacks
        this.textureConfigs = {
            grass: {
                baseUrl: '/textures/grass/',
                files: {
                    diffuse: 'forest_ground_diff_1k.jpg',
                    ao: 'forest_ground_ao_1k.jpg'
                },
                repeat: [20, 20],
                roughness: 0.85,
                fallbackColor: 0x4a7c59
            },
            dirt: {
                baseUrl: '/textures/dirt/',
                files: {
                    diffuse: 'leafy_grass_diff_1k.jpg',
                    ao: 'leafy_grass_ao_1k.jpg'
                },
                repeat: [15, 15],
                roughness: 0.9,
                fallbackColor: 0x8B4513
            },
            concrete: {
                baseUrl: '/textures/concrete/',
                files: {
                    diffuse: 'concrete_wall_007_diff_1k.jpg',
                    ao: 'concrete_wall_007_ao_1k.jpg'
                },
                repeat: [3, 3],
                roughness: 0.8,
                fallbackColor: 0xBBBBBB
            },
            brick: {
                baseUrl: '/textures/brick/',
                files: {
                    diffuse: 'mixed_brick_wall_diff_1k.jpg',
                    ao: 'mixed_brick_wall_ao_1k.jpg'
                },
                repeat: [5, 5],
                roughness: 0.7,
                fallbackColor: 0xB22222
            },
            metal: {
                baseUrl: '/textures/metal/',
                files: {
                    diffuse: 'metal_plate_diff_1k.jpg',
                    ao: 'metal_plate_ao_1k.jpg'
                },
                repeat: [4, 4],
                roughness: 0.3,
                metalness: 0.9,
                fallbackColor: 0x888888
            },
            bark: {
                baseUrl: '/textures/bark/',
                files: {
                    diffuse: 'pine_bark_diff_1k.jpg',
                    ao: 'pine_bark_ao_1k.jpg'
                },
                repeat: [1, 4],
                roughness: 0.9,
                fallbackColor: 0x8B4513
            },
            leaves: {
                baseUrl: '/textures/leaves/',
                files: {
                    diffuse: 'leafy_grass_diff_1k.jpg',
                    ao: 'leafy_grass_ao_1k.jpg'
                },
                repeat: [3, 3],
                roughness: 0.8,
                fallbackColor: 0x228B22
            },
            rock: {
                baseUrl: '/textures/rock/',
                files: {
                    diffuse: 'rock_ground_diff_1k.jpg',
                    ao: 'rock_ground_ao_1k.jpg'
                },
                repeat: [10, 10],
                roughness: 0.7,
                fallbackColor: 0x696969
            }
        };
    }

    async init() {
        console.log('🎨 Initializing Realistic Texture Manager...');

        // Try to load external textures, create procedural fallbacks
        const loadPromises = [];

        for (const [name, config] of Object.entries(this.textureConfigs)) {
            loadPromises.push(
                this.loadTextureSet(name, config).catch(error => {
                    console.warn(`⚠️ Failed to load ${name}, creating realistic procedural texture`);
                    this.createRealisticProceduralMaterial(name, config);
                })
            );
        }

        await Promise.allSettled(loadPromises);

        // Ensure all materials exist
        this.ensureAllMaterialsExist();

        console.log('✅ Realistic Texture Manager initialized');
    }

    async loadTextureSet(name, config) {
        const textures = {};
        const promises = [];

        // Only try to load JPG files (skip EXR to avoid errors)
        for (const [type, filename] of Object.entries(config.files)) {
            if (!filename.toLowerCase().endsWith('.jpg')) {
                continue; // Skip non-JPG files
            }

            const url = `${config.baseUrl}${filename}`;

            promises.push(
                this.loadTexture(url, type).then(texture => {
                    if (texture) {
                        textures[type] = texture;
                        this.configureTexture(texture, config, type);
                    }
                }).catch(error => {
                    console.warn(`⚠️ Failed to load ${type} texture for ${name}: ${error.message}`);
                })
            );
        }

        const results = await Promise.allSettled(promises);

        if (textures.diffuse) {
            this.textures.set(name, textures);
            this.createMaterialFromTextures(name, textures, config);
            console.log(`✅ Loaded texture set: ${name}`);
        } else {
            throw new Error(`No diffuse texture loaded for ${name}`);
        }
    }

    async loadTexture(url, type) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout loading ${url}`));
            }, 5000); // 5 second timeout

            this.loader.load(
                url,
                (texture) => {
                    clearTimeout(timeout);
                    console.log(`✅ Loaded: ${url}`);

                    // Configure texture properly
                    texture.colorSpace = type === 'diffuse' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
                    texture.generateMipmaps = true;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    resolve(texture);
                },
                undefined,
                (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            );
        });
    }

    configureTexture(texture, config, type) {
        if (config.repeat) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(config.repeat[0], config.repeat[1]);
        }
        texture.anisotropy = 16;
    }

    createMaterialFromTextures(name, textures, config) {
        const material = new THREE.MeshStandardMaterial({
            map: textures.diffuse || null,
            aoMap: textures.ao || null,
            roughness: config.roughness || 0.8,
            metalness: config.metalness || 0.0,
            aoMapIntensity: textures.ao ? 1.0 : 0
        });

        this.materials.set(name, material);
    }

    createRealisticProceduralMaterial(name, config) {
        console.log(`🎨 Creating realistic procedural material for: ${name}`);

        // Create high-quality procedural texture
        const texture = this.createProceduralTexture(name, config);

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: config.fallbackColor,
            roughness: config.roughness || 0.8,
            metalness: config.metalness || 0.0
        });

        // Configure texture properly
        if (config.repeat) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(config.repeat[0], config.repeat[1]);
        }
        texture.anisotropy = 16;

        this.materials.set(name, material);
        this.textures.set(name, { diffuse: texture });
    }

    createProceduralTexture(name, config) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');

        // Create realistic textures based on type
        switch (name) {
            case 'grass':
                this.createRealisticGrassTexture(context, config);
                break;
            case 'dirt':
                this.createRealisticDirtTexture(context, config);
                break;
            case 'concrete':
                this.createRealisticConcreteTexture(context, config);
                break;
            case 'brick':
                this.createRealisticBrickTexture(context, config);
                break;
            case 'metal':
                this.createRealisticMetalTexture(context, config);
                break;
            case 'bark':
                this.createRealisticBarkTexture(context, config);
                break;
            case 'leaves':
                this.createRealisticLeavesTexture(context, config);
                break;
            case 'rock':
                this.createRealisticRockTexture(context, config);
                break;
            default:
                this.createBasicTexture(context, config);
                break;
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = true;

        return texture;
    }

    createRealisticGrassTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base grass color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add natural grass variation
        for (let i = 0; i < 8000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 2 + 0.5;

            // Vary the green color naturally
            const variation = (Math.random() - 0.5) * 0.3;
            const r = Math.floor((baseColor.r + variation * 0.1) * 255);
            const g = Math.floor((baseColor.g + variation) * 255);
            const b = Math.floor((baseColor.b + variation * 0.1) * 255);

            context.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }

        // Add some darker spots for realism
        context.fillStyle = 'rgba(0, 50, 0, 0.1)';
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 10 + 5;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createRealisticDirtTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base dirt color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add dirt particles and variation
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 3 + 1;

            const brightness = 0.7 + Math.random() * 0.6;
            const r = Math.floor(baseColor.r * brightness * 255);
            const g = Math.floor(baseColor.g * brightness * 255);
            const b = Math.floor(baseColor.b * brightness * 255);

            context.fillStyle = `rgb(${r}, ${g}, ${b})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createRealisticConcreteTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base concrete color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add concrete texture with random spots
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 4 + 1;

            const brightness = 0.8 + Math.random() * 0.4;
            const color = Math.floor(baseColor.r * brightness * 255);

            context.fillStyle = `rgb(${color}, ${color}, ${color})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }

        // Add some cracks
        context.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        context.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            context.beginPath();
            context.moveTo(Math.random() * 512, Math.random() * 512);
            context.lineTo(Math.random() * 512, Math.random() * 512);
            context.stroke();
        }
    }

    createRealisticBrickTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base brick color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Draw brick pattern
        const brickWidth = 64;
        const brickHeight = 32;

        context.strokeStyle = 'rgba(100, 50, 50, 0.5)';
        context.lineWidth = 2;

        for (let y = 0; y < 512; y += brickHeight) {
            for (let x = 0; x < 512; x += brickWidth) {
                const offsetX = (Math.floor(y / brickHeight) % 2) * (brickWidth / 2);

                // Add slight color variation to each brick
                const variation = (Math.random() - 0.5) * 0.2;
                const r = Math.floor((baseColor.r + variation) * 255);
                const g = Math.floor((baseColor.g + variation * 0.5) * 255);
                const b = Math.floor((baseColor.b + variation * 0.5) * 255);

                context.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
                context.fillRect(x + offsetX, y, brickWidth - 2, brickHeight - 2);

                context.strokeRect(x + offsetX, y, brickWidth, brickHeight);
            }
        }
    }

    createRealisticMetalTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base metal color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add metal scratches and wear
        context.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        context.lineWidth = 1;

        for (let i = 0; i < 50; i++) {
            context.beginPath();
            context.moveTo(Math.random() * 512, Math.random() * 512);
            context.lineTo(Math.random() * 512, Math.random() * 512);
            context.stroke();
        }

        // Add some rust spots
        context.fillStyle = 'rgba(150, 100, 50, 0.2)';
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 8 + 2;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createRealisticBarkTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base bark color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add vertical bark lines
        context.strokeStyle = 'rgba(100, 70, 30, 0.7)';
        context.lineWidth = 2;

        for (let i = 0; i < 15; i++) {
            const x = (i / 15) * 512 + (Math.random() - 0.5) * 20;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x + (Math.random() - 0.5) * 30, 512);
            context.stroke();
        }

        // Add bark texture details
        for (let i = 0; i < 1000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 2 + 0.5;

            const brightness = 0.6 + Math.random() * 0.8;
            const r = Math.floor(baseColor.r * brightness * 255);
            const g = Math.floor(baseColor.g * brightness * 255);
            const b = Math.floor(baseColor.b * brightness * 255);

            context.fillStyle = `rgb(${r}, ${g}, ${b})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createRealisticLeavesTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base leaf color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add leaf shapes and variation
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 15 + 5;

            const variation = (Math.random() - 0.5) * 0.4;
            const r = Math.floor((baseColor.r + variation * 0.2) * 255);
            const g = Math.floor((baseColor.g + variation) * 255);
            const b = Math.floor((baseColor.b + variation * 0.2) * 255);

            context.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createRealisticRockTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);

        // Fill with base rock color
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);

        // Add rock texture variation
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 4 + 1;

            const brightness = 0.5 + Math.random() * 1.0;
            const color = Math.floor(baseColor.r * brightness * 255);

            context.fillStyle = `rgb(${color}, ${color}, ${color})`;
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }
    }

    createBasicTexture(context, config) {
        const baseColor = new THREE.Color(config.fallbackColor);
        context.fillStyle = `rgb(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255})`;
        context.fillRect(0, 0, 512, 512);
    }

    ensureAllMaterialsExist() {
        // Ensure all required materials exist
        const requiredMaterials = ['grass', 'dirt', 'concrete', 'brick', 'metal', 'bark', 'leaves', 'rock'];

        requiredMaterials.forEach(name => {
            if (!this.materials.has(name)) {
                console.log(`Creating missing material: ${name}`);
                const config = this.textureConfigs[name] || { fallbackColor: 0x888888, roughness: 0.8 };
                this.createRealisticProceduralMaterial(name, config);
            }
        });
    }

    getMaterial(name) {
        const material = this.materials.get(name);
        if (!material) {
            console.warn(`⚠️ Material '${name}' not found, creating fallback`);
            const config = this.textureConfigs[name] || { fallbackColor: 0x888888, roughness: 0.8 };
            this.createRealisticProceduralMaterial(name, config);
            return this.materials.get(name);
        }
        return material;
    }

    getRandomBuildingMaterial() {
        const buildingMaterials = ['concrete', 'brick', 'metal'];
        const randomType = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)];
        return this.getMaterial(randomType);
    }

    isTextureSetLoaded(name) {
        return this.materials.has(name);
    }

    getLoadingStatus() {
        const total = Object.keys(this.textureConfigs).length;
        const loaded = this.materials.size;
        return {
            total,
            loaded,
            percentage: (loaded / total) * 100
        };
    }

    dispose() {
        console.log('🎨 Disposing Realistic Texture Manager...');

        for (const textureSet of this.textures.values()) {
            for (const texture of Object.values(textureSet)) {
                if (texture && texture.dispose) {
                    texture.dispose();
                }
            }
        }

        for (const material of this.materials.values()) {
            if (material && material.dispose) {
                material.dispose();
            }
        }

        this.textures.clear();
        this.materials.clear();

        console.log('✅ Realistic Texture Manager disposed');
    }
}