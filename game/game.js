/**
 * Game - Minimal game setup with terrain, sky, and player
 * Avoids texture slot limits by minimizing loaded assets
 */

import * as THREE from 'three';
import { GameEngine, DualModePlayer, TerrainSystem, WindAnimationSystem } from '../src/index.js';
import { AssetCatalog } from './systems/AssetCatalog.js';
import { HUDManager } from './systems/HUDManager.js';
import { FPSCounter } from './systems/FPSCounter.js';

export class Game {
    constructor() {
        this.engine = null;
        this.terrain = null;
        this.player = null;
        this.playerScript = null;
        this.hudManager = null;
        this.fpsCounter = null;

        // Game state
        this.playerHealth = 100;
        this.playerStamina = 100;
        this.collectiblesCount = 0;
        this.isRunning = false;




        // Wind animation system for foliage
        this.windSystem = null;

        // Separate wind system for grass (independent from foliage)
        this.grassWindSystem = null;

        // Separate wind system for tree branches (slower, heavier sway)
        this.treeWindSystem = null;

        // Butterflies with animations
        this.butterflies = [];
        this.butterflyMixers = [];
        this.butterflyVelocities = []; // Movement velocities for each butterfly
    }

    async init() {
        // console.log('🎮 Initializing OpenWorld Explorer (Minimal)...');

        try {
            this._updateLoadingText('Initializing Engine...');
            this._updateLoadingBar(10);

            // Create engine with minimal settings - NO post-processing
            this.engine = new GameEngine({
                preferWebGPU: false,
                postProcessing: false,
                antialias: true,
                shadows: true,
                shadowMapSize: 1024
            });

            const container = document.getElementById('game-container');
            await this.engine.init(container);

            // console.log('✅ Engine initialized');
            this._updateLoadingBar(30);

            // Setup terrain with heightmap and texture
            this._updateLoadingText('Generating Terrain...');
            await this._setupTerrain();
            this._updateLoadingBar(50);

            // Setup sky
            this._updateLoadingText('Setting up Sky...');
            await this._setupSky();
            this._updateLoadingBar(70);

            // Setup player
            this._updateLoadingText('Spawning Player...');
            await this._setupPlayer();
            this._updateLoadingBar(85);

            // Setup simple lighting
            this._setupLighting();

            // Initialize wind animation system BEFORE placing vegetation
            this.windSystem = new WindAnimationSystem({
                windStrength: 0.4,
                windSpeed: 1.5,
                turbulence: 0.15
            });
            // console.log('💨 Wind animation system initialized');

            // Separate wind system for grass (faster, lighter movement)
            this.grassWindSystem = new WindAnimationSystem({
                windStrength: 0.25,  // Lighter than foliage
                windSpeed: 2.5,      // Faster movement for grass
                turbulence: 0.1
            });

            // Separate wind system for tree branches (slower, heavier sway)
            this.treeWindSystem = new WindAnimationSystem({
                windStrength: 0.15,   // Subtle movement for heavy branches
                windSpeed: 0.4,       // Slower sway (was 0.8)
                turbulence: 0.03      // Very low turbulence for smooth motion
            });

            // Place vegetation on terrain
            this._updateLoadingText('Placing Vegetation...');
            await this._placeVegetation();
            this._updateLoadingBar(88);

            // Place trees
            this._updateLoadingText('Placing Trees...');
            await this._placeTrees();
            this._updateLoadingBar(91);




            // Place picnic tables
            this._updateLoadingText('Placing Props...');
            await this._placePicnicTables();
            this._updateLoadingBar(95);

            // Place butterflies
            this._updateLoadingText('Releasing Butterflies...');
            await this._placeButterflies();
            this._updateLoadingBar(96);

            // Initialize systems
            this._updateLoadingText('Initializing Systems...');
            this._setupSystems();
            this._updateLoadingBar(97);

            // Setup event listeners
            this._setupEventListeners();
            this._updateLoadingBar(100);

            // Show start screen
            this._showStartScreen();

            // console.log('✅ Game initialized successfully!');

        } catch (error) {
            console.error('❌ Failed to initialize game:', error);
            this._updateLoadingText(`Error: ${error.message}`);
            throw error;
        }
    }

    async _setupTerrain() {
        // console.log('🏔️ Setting up terrain...');

        // Create terrain system with procedural heightmap
        // (heightmap causes NaN issues, so using procedural instead)
        this.terrain = new TerrainSystem(this.engine, {
            chunkSize: 64,
            chunkWorldSize: 100,
            maxHeight: 25,
            viewDistance: 5  // 5x5 chunks = 500x500 units = 0.5km x 0.5km
        });

        // Load PBR brown mud textures for terrain (diffuse, normal, specular)
        try {
            const textureLoader = new THREE.TextureLoader();

            // Helper to load texture with repeat wrapping
            const loadTexture = (path, isSRGB = false) => new Promise((resolve, reject) => {
                textureLoader.load(
                    path,
                    (texture) => {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(15, 15);
                        // Diffuse textures need sRGB encoding for correct colors
                        if (isSRGB) {
                            texture.colorSpace = THREE.SRGBColorSpace;
                        }
                        resolve(texture);
                    },
                    undefined,
                    (err) => reject(err)
                );
            });

            // Load all PBR textures in parallel (diffuse with sRGB, others linear)
            const [diffuseMap, normalMap, armMap] = await Promise.all([
                loadTexture(AssetCatalog.ground.mudForest.diffuse, true),  // sRGB for color
                loadTexture(AssetCatalog.ground.mudForest.normal, false),  // Linear for normal
                loadTexture(AssetCatalog.ground.mudForest.arm, false)      // Linear for ARM
            ]);

            // Use MeshStandardMaterial for PBR rendering
            const terrainMaterial = new THREE.MeshStandardMaterial({
                map: diffuseMap,
                normalMap: normalMap,
                normalScale: new THREE.Vector2(2.0, 2.0),  // Strong normal for pronounced depth
                roughnessMap: armMap,
                roughness: 0.15,  // Slightly higher = wider, larger specular glare
                metalness: 0.0,   // Non-metallic for organic surface
                envMapIntensity: 0.3  // Subtle environment reflections
            });

            this.terrain.setMaterial(terrainMaterial);
            // console.log('✅ PBR terrain texture applied');
        } catch (err) {
            console.warn('⚠️ Terrain texture not found:', err);
            this.terrain.setMaterial(new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, metalness: 0 }));
        }

        // Load initial chunks around origin (5x5 grid for 0.5km terrain)
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                this.terrain._loadChunk(x, z);
            }
        }

        // console.log('✅ Terrain created with', this.terrain.chunks.size, 'chunks');
    }

    async _setupSky() {
        // console.log('🌤️ Setting up sky...');

        // Remove the engine's built-in SkySystem sky object
        if (this.engine.skySystem && this.engine.skySystem.sky) {
            this.engine.scene.remove(this.engine.skySystem.sky);
        }

        // Load HDR sunset sky as a custom sky sphere (separate brightness from scene)
        try {
            // Load the HDRI texture
            const hdriTexture = await this.engine.assets.loadHDR(AssetCatalog.environment.hdri);

            // Create a large sphere for the sky
            const skyGeometry = new THREE.SphereGeometry(500, 32, 32);

            // Custom shader to darken only the sky, not scene textures
            const skyMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    skyTexture: { value: hdriTexture },
                    brightness: { value: 0.3 }  // 0.3 = 30% brightness (darken sky)
                },
                vertexShader: `
                    varying vec3 vWorldPosition;
                    void main() {
                        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                        vWorldPosition = worldPosition.xyz;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D skyTexture;
                    uniform float brightness;
                    varying vec3 vWorldPosition;
                    
                    const float PI = 3.14159265359;
                    
                    // Reinhard tone mapping to compress bright HDR values
                    vec3 toneMap(vec3 color) {
                        return color / (color + vec3(1.0));
                    }
                    
                    void main() {
                        // Convert world position to spherical UV coordinates
                        vec3 dir = normalize(vWorldPosition);
                        float u = 0.5 + atan(dir.z, dir.x) / (2.0 * PI);
                        float v = 0.5 - asin(dir.y) / PI;
                        
                        vec4 texColor = texture2D(skyTexture, vec2(u, v));
                        
                        // Apply tone mapping to compress bright sun spot
                        vec3 mapped = toneMap(texColor.rgb);
                        
                        // Apply brightness multiplier to darken the sky
                        gl_FragColor = vec4(mapped * brightness, 1.0);
                    }
                `,
                side: THREE.BackSide,  // Render inside of sphere
                depthWrite: false,
                depthTest: false  // Don't test depth - always render behind everything
            });

            const skySphere = new THREE.Mesh(skyGeometry, skyMaterial);
            skySphere.name = 'CustomSkySphere';
            skySphere.renderOrder = -1000;  // Render first (behind everything)
            skySphere.frustumCulled = false;  // Always render, never cull
            this.engine.scene.add(skySphere);

            // Clear the scene background so our sphere shows
            this.engine.scene.background = null;
            this.engine.scene.environment = null;

            // console.log('✅ HDR sunset sky loaded with custom brightness control');
        } catch (err) {
            console.warn('⚠️ HDR sky not found, using dark sunset color');
            this.engine.scene.background = new THREE.Color(0x2a1a3a);  // Dark purple sunset
        }
    }

    _setupLighting() {
        const scene = this.engine.scene;

        // Warm sunset fog color - light purple twilight (more transparent)
        scene.fog = new THREE.Fog(0x8a7a9a, 150, 500);  // Far fog = more transparent
        // console.log('🌫️ Fog enabled (150-500)');

        // Warm ambient light for sunset atmosphere
        const ambient = new THREE.AmbientLight(0x8a6a5a, 0.6);  // Warm orange-brown tint
        scene.add(ambient);

        // Sunset directional sun - warm orange, high intensity for specular
        const sun = new THREE.DirectionalLight(0xff7744, 2.0);  // Strong for specular highlights
        sun.position.set(300, 30, 0);  // Low sunset angle - max specular when looking toward sun
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        // Optimized shadow camera - smaller bounds = better performance
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 150;
        sun.shadow.camera.left = -40;
        sun.shadow.camera.right = 40;
        sun.shadow.camera.top = 40;
        sun.shadow.camera.bottom = -40;

        scene.add(sun);

        // console.log('✅ Lighting setup (high ambient for even coloring)');
    }

    async _setupPlayer() {
        // console.log('👤 Setting up player...');

        const spawnX = 0;
        const spawnZ = 0;
        // Spawn high and let gravity bring player down to terrain
        const spawnY = 50;

        // Create a ground height function for the player to use
        const terrain = this.terrain;
        const getGroundHeight = (x, z) => {
            if (terrain && terrain.getHeightAt) {
                return terrain.getHeightAt(x, z);
            }
            return 0;
        };

        // DualModePlayer expects x, y, z (not position Vector3)
        const playerResult = DualModePlayer.create(this.engine, {
            x: spawnX,
            y: spawnY,
            z: spawnZ,
            height: 1.8,
            radius: 0.4,
            speed: 5,
            sprintMultiplier: 2,
            jumpForce: 8,
            startMode: 'fps',
            getGroundHeight: getGroundHeight
        });
        // DualModePlayer.create returns the GameObject directly
        this.player = playerResult;

        // Get the script from the player
        this.playerScript = this.player.scripts ? this.player.scripts[0] : null;

        // Configure the script for falling
        if (this.playerScript) {
            this.playerScript.terrain = terrain;
            this.playerScript.getGroundHeight = getGroundHeight;
            // Force isGrounded to false so gravity applies immediately
            this.playerScript.isGrounded = false;
        }

        // console.log('✅ Player spawned at y=' + spawnY);
    }

    async _placeVegetation() {
        // console.log('🌿 Placing forest grass patches with SPATIAL PARTITIONING...');

        const terrainHalfSize = 250;
        const totalGrassCount = 300000;

        // Chunking settings for optimization
        const CHUNKS_X = 8;
        const CHUNKS_Z = 8;
        const chunkSizeX = (terrainHalfSize * 2) / CHUNKS_X;
        const chunkSizeZ = (terrainHalfSize * 2) / CHUNKS_Z;

        try {
            // Load the foliage pack
            const foliageGO = await this.engine.loadModel(AssetCatalog.foliage.pack, { addToScene: false });



            // Collect all meshes
            const allMeshes = [];
            foliageGO.object3D.traverse(child => {
                if (child.isMesh) allMeshes.push(child);
            });

            // Only use these 2 blended grass meshes
            const allowedMeshNames = ['green-material', 'mid-material'];
            const grassMeshes = allMeshes.filter(m => allowedMeshNames.includes(m.name));

            if (grassMeshes.length === 0) {
                console.warn('❌ No grass meshes found for vegetation');
                return;
            }

            // Find specific meshes by name
            const greenMaterial = grassMeshes.find(m => m.name === 'green-material');
            const midMaterial = grassMeshes.find(m => m.name === 'mid-material');

            // Get indices for bucket keys
            const greenMaterialIdx = grassMeshes.indexOf(greenMaterial);
            const midMaterialIdx = grassMeshes.indexOf(midMaterial);

            // Noise function for blending
            const noise2D = (x, z, freq) => {
                const nx = Math.sin(x * freq) * Math.cos(z * freq * 0.7);
                const nz = Math.cos(x * freq * 0.8) * Math.sin(z * freq);
                return (nx + nz + 2) / 4;
            };

            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();

            // Prepare buckets: grid key -> array of matrices
            // Key format: "typeIndex_chunkX_chunkZ"
            const buckets = new Map();

            let totalPlaced = 0;

            // Helper to add grass instance to bucket
            const addToBucket = (typeIndex, x, z) => {
                const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
                position.set(x, y, z);

                const euler = new THREE.Euler(0, Math.random() * Math.PI * 2, 0);
                quaternion.setFromEuler(euler);

                const baseScale = 0.8 + Math.random() * 0.4;
                scale.set(baseScale, baseScale * (0.8 + Math.random() * 0.4), baseScale);

                matrix.compose(position, quaternion, scale);

                const offsetX = x + terrainHalfSize;
                const offsetZ = z + terrainHalfSize;
                const cx = Math.min(CHUNKS_X - 1, Math.floor(offsetX / chunkSizeX));
                const cz = Math.min(CHUNKS_Z - 1, Math.floor(offsetZ / chunkSizeZ));

                const bucketKey = `${typeIndex}_${cx}_${cz}`;
                if (!buckets.has(bucketKey)) {
                    buckets.set(bucketKey, []);
                }
                buckets.get(bucketKey).push(matrix.clone());
                totalPlaced++;
            };

            // CLUSTER-BASED GRASS PLACEMENT
            // Create dense clumps of grass scattered across the terrain
            const numClusters = 10000; // Number of grass cluster centers (increased density)
            const grassPerCluster = 60; // Grass instances per cluster (increased density)
            const minClusterRadius = 2.0; // Minimum cluster radius (tight packing)
            const maxClusterRadius = 4.0; // Maximum cluster radius

            for (let cluster = 0; cluster < numClusters; cluster++) {
                // Random cluster center position
                const clusterX = (Math.random() - 0.5) * 2 * terrainHalfSize;
                const clusterZ = (Math.random() - 0.5) * 2 * terrainHalfSize;

                // Vary cluster size slightly for natural look
                const clusterRadius = minClusterRadius + Math.random() * (maxClusterRadius - minClusterRadius);

                // Use noise at cluster center to determine blend for entire cluster
                // This keeps each clump more uniform in type
                const blendNoise = noise2D(clusterX, clusterZ, 0.15);
                const detailNoise = noise2D(clusterX * 2.3, clusterZ * 2.3, 0.4);
                const clusterNoise = blendNoise * 0.5 + detailNoise * 0.3 + Math.random() * 0.2;
                const threshold = 0.50;
                const clusterTypeIdx = clusterNoise > threshold ? greenMaterialIdx : midMaterialIdx;

                // Spawn grass instances within the cluster
                for (let i = 0; i < grassPerCluster; i++) {
                    // Random offset from cluster center using gaussian-like distribution
                    // (sum of 2 randoms gives more center-weighted distribution)
                    const angle = Math.random() * Math.PI * 2;
                    const distance = (Math.random() + Math.random()) * 0.5 * clusterRadius;

                    const x = clusterX + Math.cos(angle) * distance;
                    const z = clusterZ + Math.sin(angle) * distance;

                    // Occasionally mix in the other type for more natural look (10% chance)
                    let typeIdx = clusterTypeIdx;
                    if (Math.random() < 0.1) {
                        typeIdx = typeIdx === greenMaterialIdx ? midMaterialIdx : greenMaterialIdx;
                    }

                    addToBucket(typeIdx, x, z);
                }
            }

            // SCATTERED RANDOM GRASS PLACEMENT
            // Add grass randomly across terrain to fill gaps between clusters
            const scatteredGrassCount = 100000; // Random grass outside clusters
            for (let i = 0; i < scatteredGrassCount; i++) {
                const x = (Math.random() - 0.5) * 2 * terrainHalfSize;
                const z = (Math.random() - 0.5) * 2 * terrainHalfSize;

                // Use noise to blend types for scattered grass
                const blendNoise = noise2D(x, z, 0.15);
                const detailNoise = noise2D(x * 2.3, z * 2.3, 0.4);
                const combined = blendNoise * 0.5 + detailNoise * 0.3 + Math.random() * 0.2;
                const typeIdx = combined > 0.5 ? greenMaterialIdx : midMaterialIdx;

                addToBucket(typeIdx, x, z);
            }

            // console.log(`  ✅ Calculated ${totalPlaced} positions. Constructing chunks...`);

            // Creates meshes from buckets
            const vegetationGroup = new THREE.Group();
            vegetationGroup.name = 'Vegetation_Chunks';

            // Materials cache: UUID -> MeshLambertMaterial (for fog support)
            // This ensures we reuse the same material instance if multiple meshes share the original material
            const materialCache = new Map();

            let totalChunks = 0;

            for (const [key, matrices] of buckets) {
                const [typeIdxStr, cx, cz] = key.split('_');
                const typeIndex = parseInt(typeIdxStr);
                const grassMesh = grassMeshes[typeIndex];

                // Get the original material (handle array materials just in case)
                const originalMat = Array.isArray(grassMesh.material) ? grassMesh.material[0] : grassMesh.material;
                const matKey = originalMat.uuid;

                // Create or reuse material with fog support AND grass wind
                if (!materialCache.has(matKey)) {
                    let baseMat = new THREE.MeshLambertMaterial({
                        map: originalMat.map || null,
                        color: originalMat.color || 0x4a7c2f,
                        transparent: false,  // Disable transparency to avoid depth sorting issues
                        alphaTest: 0.5,
                        side: THREE.DoubleSide
                    });

                    // Apply grass-specific wind (separate from foliage wind)
                    if (this.grassWindSystem) {
                        baseMat = this.grassWindSystem.createWindMaterial(baseMat, {
                            strengthMultiplier: 0.3,
                            useUVForHeight: true  // Use UV.y for height-based stiffness (tips move, base anchored)
                        });
                    }
                    materialCache.set(matKey, baseMat);
                    // console.log(`    🎨 Created optimized material with grass wind for ID: ${matKey}`);
                }

                const instancedMesh = new THREE.InstancedMesh(
                    grassMesh.geometry,
                    materialCache.get(matKey),
                    matrices.length
                );

                // Fill matrices
                for (let i = 0; i < matrices.length; i++) {
                    instancedMesh.setMatrixAt(i, matrices[i]);
                }

                instancedMesh.instanceMatrix.needsUpdate = true;

                // IMPORTANT: Frustum culling enabled
                instancedMesh.frustumCulled = true;

                // We must compute bounding sphere for culling to work
                instancedMesh.computeBoundingSphere();

                // Disable shadows for performance
                instancedMesh.castShadow = false;
                instancedMesh.receiveShadow = false;

                vegetationGroup.add(instancedMesh);
                totalChunks++;
            }

            this.engine.scene.add(vegetationGroup);
            // console.log(`✅ Vegetation complete: ${totalChunks} spatial chunks created.`);

        } catch (error) {
            console.error('⚠️ Failed to place grass:', error);
        }
    }

    async _placeTrees() {
        console.log('🌲 Placing blue spruce trees around terrain...');

        const terrainHalfSize = 250; // 0.5km terrain
        const treeCount = 300; // Number of trees to scatter
        const minTreeDistance = 25; // Minimum distance between trees (meters)

        try {
            // Load the blue spruce model
            const treeGO = await this.engine.loadModel(AssetCatalog.foliage.blueSpruce, { addToScene: false });

            console.log('Tree model loaded:', treeGO);
            console.log('Tree object3D:', treeGO.object3D);

            // Collect all meshes from the tree model
            const treeMeshes = [];
            treeGO.object3D.traverse(child => {
                console.log('  Child:', child.type, child.name);
                if (child.isMesh) {
                    treeMeshes.push(child);
                    console.log('    -> Mesh found! Geometry:', child.geometry, 'Material:', child.material);
                }
            });

            console.log(`Found ${treeMeshes.length} mesh(es) in blue spruce model`);

            if (treeMeshes.length === 0) {
                console.warn('⚠️ No tree meshes found');
                return;
            }

            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();

            // Generate spread-out positions with minimum distance between trees
            const treePositions = [];
            const maxAttempts = 50; // Max attempts to find valid position per tree

            for (let i = 0; i < treeCount; i++) {
                let placed = false;

                for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
                    const x = (Math.random() - 0.5) * 2 * terrainHalfSize;
                    const z = (Math.random() - 0.5) * 2 * terrainHalfSize;

                    // Check distance to all existing trees
                    let tooClose = false;
                    for (const existing of treePositions) {
                        const dx = x - existing.x;
                        const dz = z - existing.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist < minTreeDistance) {
                            tooClose = true;
                            break;
                        }
                    }

                    if (!tooClose) {
                        const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
                        const rotY = Math.random() * Math.PI * 2;
                        const baseScale = 5 + Math.random() * 5; // Scale: 5 to 10x
                        treePositions.push({ x, y, z, rotY, baseScale });
                        placed = true;
                    }
                }

                // If we couldn't find a valid spot after maxAttempts, skip this tree
                if (!placed) {
                    console.log(`  Could not place tree ${i} after ${maxAttempts} attempts`);
                }
            }

            console.log(`Placed ${treePositions.length} trees with ${minTreeDistance}m minimum spacing`);

            // Create instanced mesh for each tree mesh component
            for (let meshIndex = 0; meshIndex < treeMeshes.length; meshIndex++) {
                const treeMesh = treeMeshes[meshIndex];
                const originalMat = treeMesh.material;

                // Check material name for branch detection (material name contains "Branches" or "Needles")
                const matName = originalMat.name ? originalMat.name.toLowerCase() : '';
                const meshName = treeMesh.name.toLowerCase();
                const isBranch = matName.includes('branch') || matName.includes('needle') || meshName.includes('branch') || meshName.includes('needle');

                console.log(`  Processing mesh: "${treeMesh.name}", material: "${originalMat.name}" - isBranch: ${isBranch}`);

                // Use MeshLambertMaterial for fog support
                const baseMat = new THREE.MeshLambertMaterial({
                    map: originalMat.map || null,
                    color: originalMat.color || 0x2d5a27,
                    side: THREE.DoubleSide,
                    alphaTest: 0.5
                });

                // Apply wind animation only to branches, not trunk
                let mat;
                if (isBranch && this.treeWindSystem) {
                    // Get geometry bounds for proper height calculation
                    treeMesh.geometry.computeBoundingBox();
                    const bbox = treeMesh.geometry.boundingBox;
                    const minY = bbox ? bbox.min.y : 0;
                    const maxY = bbox ? bbox.max.y : 10;

                    mat = this.treeWindSystem.createWindMaterial(baseMat, {
                        strengthMultiplier: 1.0,     // Stronger effect
                        useUVForHeight: false,       // Use position-based instead
                        minY: minY,
                        maxY: maxY
                    });
                    console.log(`    -> Applied tree wind animation (bounds: ${minY.toFixed(1)} to ${maxY.toFixed(1)})`);
                    console.log('    Material:', mat);
                } else {
                    mat = baseMat;
                }

                const instancedMesh = new THREE.InstancedMesh(
                    treeMesh.geometry,
                    mat,
                    treePositions.length  // Use actual placed count, not target count
                );
                instancedMesh.castShadow = true;
                instancedMesh.receiveShadow = true;
                instancedMesh.frustumCulled = true;
                instancedMesh.name = `BlueSpruce_${treeMesh.name}_${meshIndex}`;

                // Place trees at the pre-generated positions
                for (let i = 0; i < treePositions.length; i++) {
                    const pos = treePositions[i];
                    position.set(pos.x, pos.y, pos.z);

                    // Rotate -90 degrees on X to stand upright, then random Y rotation
                    const euler = new THREE.Euler(
                        -Math.PI / 2,  // -90 degrees on X to stand upright
                        0,
                        pos.rotY       // Random rotation around Z (which is now vertical)
                    );
                    quaternion.setFromEuler(euler);

                    scale.set(pos.baseScale, pos.baseScale, pos.baseScale);

                    matrix.compose(position, quaternion, scale);
                    instancedMesh.setMatrixAt(i, matrix);
                }

                instancedMesh.instanceMatrix.needsUpdate = true;
                instancedMesh.computeBoundingSphere();
                this.engine.scene.add(instancedMesh);
            }

            // console.log(`✅ Placed ${treeCount} blue spruce trees`);

        } catch (error) {
            console.error('⚠️ Failed to place trees:', error);
        }
    }






    async _placePicnicTables() {
        // console.log('🪑 Placing picnic tables around terrain...');

        const terrainHalfSize = 250; // 0.5km terrain
        const tableCount = 150; // Scaled up for 0.5km terrain

        try {
            // Load the picnic table model
            const tableGO = await this.engine.loadModel(AssetCatalog.props.picnicTable, { addToScene: false });

            // Collect all meshes from the table model
            const tableMeshes = [];
            tableGO.object3D.traverse(child => {
                if (child.isMesh) {
                    tableMeshes.push(child);
                }
            });

            // console.log(`  Found ${tableMeshes.length} mesh(es) in picnic table model`);

            if (tableMeshes.length === 0) {
                console.warn('⚠️ No picnic table meshes found');
                return;
            }

            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();

            // Create instanced mesh for each table mesh component
            for (let meshIndex = 0; meshIndex < tableMeshes.length; meshIndex++) {
                const tableMesh = tableMeshes[meshIndex];

                // Use MeshLambertMaterial for fog support
                const mat = new THREE.MeshLambertMaterial({
                    map: tableMesh.material.map || null,
                    color: tableMesh.material.color || 0x8B4513,
                    side: THREE.FrontSide
                });

                const instancedMesh = new THREE.InstancedMesh(
                    tableMesh.geometry,
                    mat,
                    tableCount
                );
                instancedMesh.castShadow = false;
                instancedMesh.receiveShadow = false;
                instancedMesh.frustumCulled = true;
                instancedMesh.name = `PicnicTable_${tableMesh.name}_${meshIndex} `;

                // Place tables randomly across terrain
                for (let i = 0; i < tableCount; i++) {
                    const x = (Math.random() - 0.5) * 2 * terrainHalfSize;
                    const z = (Math.random() - 0.5) * 2 * terrainHalfSize;
                    const y = this.terrain ? this.terrain.getHeightAt(x, z) : 0;

                    position.set(x, y, z);

                    // First rotate -90 degrees on X to stand upright, then random Y rotation
                    const euler = new THREE.Euler(
                        -Math.PI / 2,  // -90 degrees on X to stand upright
                        0,
                        Math.random() * Math.PI * 2  // Random rotation around Z (which is now vertical)
                    );
                    quaternion.setFromEuler(euler);

                    // Much smaller scale for realistic table size
                    const baseScale = 0.02 + Math.random() * 0.01; // 0.02 to 0.03
                    scale.set(baseScale, baseScale, baseScale);

                    matrix.compose(position, quaternion, scale);
                    instancedMesh.setMatrixAt(i, matrix);
                }

                instancedMesh.instanceMatrix.needsUpdate = true;
                this.engine.scene.add(instancedMesh);

                // console.log(`  ✅ Placed ${tableCount} picnic table instances`);
            }

            // console.log(`✅ Placed picnic tables around terrain`);

        } catch (error) {
            console.error('⚠️ Failed to place picnic tables:', error);
        }
    }

    async _placeButterflies() {
        // console.log('🦋 Placing animated butterflies...');

        const terrainHalfSize = 250; // 0.5km terrain
        const butterflyCount = 300; // Scaled up for 0.5km terrain
        const minHeight = 0.5;  // Minimum height above terrain (lower)
        const maxHeight = 2;    // Maximum height above terrain (lower)

        try {
            // Use GLTFLoader directly to get fresh animation clips for each butterfly
            const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
            // Import SkeletonUtils for proper cloning of animated/skinned meshes
            const SkeletonUtilsModule = await import('three/addons/utils/SkeletonUtils.js');
            const skeletonClone = SkeletonUtilsModule.clone || SkeletonUtilsModule.SkeletonUtils?.clone || SkeletonUtilsModule.default?.clone;
            const loader = new GLTFLoader();
            const butterflyPath = AssetCatalog.insects.butterfly;

            // Load the butterfly model once to get the template
            const gltf = await new Promise((resolve, reject) => {
                loader.load(butterflyPath, resolve, undefined, reject);
            });

            // console.log(`  Found ${gltf.animations.length} animation(s) in butterfly model`);
            if (gltf.animations.length > 0) {
                // console.log(`  Animation names: ${gltf.animations.map(a => a.name).join(', ')} `);
            }

            // Check if model has skinned meshes
            let hasSkinnedMesh = false;
            gltf.scene.traverse(child => {
                if (child.isSkinnedMesh) hasSkinnedMesh = true;
            });
            // console.log(`  Uses skeletal animation: ${hasSkinnedMesh} `);

            for (let i = 0; i < butterflyCount; i++) {
                // Use SkeletonUtils.clone for proper skeleton binding with animated models
                const butterfly = skeletonClone(gltf.scene);

                // Place first 10 butterflies near spawn for easier visibility
                let x, z;
                if (i < 10) {
                    // Near spawn point (within 30m radius)
                    x = (Math.random() - 0.5) * 60;
                    z = (Math.random() - 0.5) * 60;
                } else {
                    // Random position on terrain
                    x = (Math.random() - 0.5) * 2 * terrainHalfSize;
                    z = (Math.random() - 0.5) * 2 * terrainHalfSize;
                }
                const terrainY = this.terrain ? this.terrain.getHeightAt(x, z) : 0;
                const y = terrainY + minHeight + Math.random() * (maxHeight - minHeight);

                // Set position
                butterfly.position.set(x, y, z);

                // Random Y rotation
                butterfly.rotation.y = Math.random() * Math.PI * 2;

                // Scale the butterfly - smaller size
                const scale = 0.15 + Math.random() * 0.1; // 0.15 to 0.25 (smaller)
                butterfly.scale.set(scale, scale, scale);

                // Store a random velocity for wandering movement
                const speed = 1 + Math.random() * 2; // 1-3 units/second
                const angle = Math.random() * Math.PI * 2;
                this.butterflyVelocities.push({
                    vx: Math.cos(angle) * speed,
                    vz: Math.sin(angle) * speed,
                    wanderTimer: Math.random() * 30, // Random initial timer (up to 30 sec)
                    baseHeight: minHeight + Math.random() * (maxHeight - minHeight)
                });

                // Debug: log first butterfly position
                if (i === 0) {
                    // console.log(`  📍 First butterfly at: x = ${x.toFixed(1)}, y = ${y.toFixed(1)}, z = ${z.toFixed(1)}, scale = ${scale.toFixed(2)} `);

                    // Debug mesh info
                    let meshCount = 0;
                    butterfly.traverse(child => {
                        if (child.isMesh) {
                            meshCount++;
                            const mat = child.material;
                            // console.log(`    Mesh "${child.name}": visible = ${child.visible}, ` +
                            //     `material = ${mat?.type}, color = ${mat?.color?.getHexString()}, ` +
                            //     `opacity = ${mat?.opacity}, transparent = ${mat?.transparent}, ` +
                            //     `side = ${mat?.side} `);
                        }
                    });
                    // console.log(`    Total meshes in butterfly: ${meshCount} `);
                }

                // Make sure all meshes are visible and have working materials
                butterfly.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        child.visible = true;
                        child.frustumCulled = false; // Disable culling for debugging

                        // Clone material to avoid shared reference issues
                        if (child.material) {
                            child.material = child.material.clone();
                            child.material.transparent = false;
                            child.material.opacity = 1;
                            child.material.depthWrite = true;
                            child.material.depthTest = true;
                            child.material.side = THREE.DoubleSide;
                        }
                    }
                });

                // Add to scene
                this.engine.scene.add(butterfly);

                // Create animation mixer for this butterfly using the ORIGINAL clips
                if (gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(butterfly);
                    this.butterflyMixers.push(mixer);

                    // Find the flying animation or use first available
                    let flyingClip = gltf.animations.find(clip =>
                        clip.name.toLowerCase().includes('fly') ||
                        clip.name.toLowerCase().includes('flying')
                    );

                    // If no 'flying' animation found, use the first one
                    if (!flyingClip && gltf.animations.length > 0) {
                        flyingClip = gltf.animations[0];
                    }

                    if (flyingClip) {
                        const action = mixer.clipAction(flyingClip);
                        action.setLoop(THREE.LoopRepeat);
                        // Randomize start time to desync butterflies
                        action.time = Math.random() * flyingClip.duration;
                        // Slight speed variation
                        action.timeScale = 0.8 + Math.random() * 0.4;
                        action.play();
                    }
                }

                this.butterflies.push(butterfly);

                // Log progress every 25 butterflies
                // if ((i + 1) % 25 === 0) {
                //     console.log(`  🦋 Placed ${i + 1}/${butterflyCount} butterflies...`);
                // }
            }

            // console.log(`✅ Placed ${butterflyCount} animated butterflies`);

        } catch (error) {
            console.error('⚠️ Failed to place butterflies:', error);
        }
    }

    _setupSystems() {
        // Wind system is already initialized earlier (before vegetation placement)

        this.hudManager = new HUDManager(this);
        this.fpsCounter = new FPSCounter();

        this._lastTime = performance.now();
        this._boundGameLoop = this._gameLoop.bind(this);
    }

    _gameLoop() {
        if (!this.isRunning) return;

        requestAnimationFrame(this._boundGameLoop);

        const now = performance.now();
        const deltaTime = (now - this._lastTime) / 1000;
        this._lastTime = now;

        this._update(deltaTime);
    }

    _update(deltaTime) {


        // Update wind animation system
        if (this.windSystem) {
            this.windSystem.update(deltaTime);
        }

        // Update grass wind animation system (separate from foliage)
        if (this.grassWindSystem) {
            this.grassWindSystem.update(deltaTime);
        }

        // Update tree branch wind animation system (separate from grass)
        if (this.treeWindSystem) {
            this.treeWindSystem.update(deltaTime);
        }


        // Update butterfly animations and movement (OPTIMIZED)
        if (this.butterflies.length > 0) {
            const terrainHalfSize = 250; // 0.5km terrain
            const cameraPos = this.engine.camera.position;

            // Batch animation mixer updates: only update 25 per frame
            if (!this._butterflyUpdateIndex) this._butterflyUpdateIndex = 0;
            const batchSize = 25;
            const startIdx = this._butterflyUpdateIndex;
            const endIdx = Math.min(startIdx + batchSize, this.butterflies.length);

            // Update animation mixers in batches (expensive operation)
            for (let i = startIdx; i < endIdx; i++) {
                const mixer = this.butterflyMixers[i];
                if (mixer) {
                    mixer.update(deltaTime * (this.butterflies.length / batchSize));
                }
            }
            this._butterflyUpdateIndex = endIdx >= this.butterflies.length ? 0 : endIdx;

            // Update ALL butterfly positions every frame (cheap, keeps movement smooth)
            for (let i = 0; i < this.butterflies.length; i++) {
                const butterfly = this.butterflies[i];
                const vel = this.butterflyVelocities[i];

                // Update position (movement) - every frame for smooth motion
                butterfly.position.x += vel.vx * deltaTime;
                butterfly.position.z += vel.vz * deltaTime;

                // Update target terrain height every second
                if (!vel.heightTimer) vel.heightTimer = 0;
                vel.heightTimer -= deltaTime;
                if (vel.heightTimer <= 0) {
                    vel.targetTerrainY = this.terrain ? this.terrain.getHeightAt(butterfly.position.x, butterfly.position.z) : 0;
                    vel.heightTimer = 1.0;
                }

                // Smoothly interpolate current height to target (prevents jitter)
                if (vel.cachedTerrainY === undefined) vel.cachedTerrainY = vel.targetTerrainY || 0;
                vel.cachedTerrainY += (vel.targetTerrainY - vel.cachedTerrainY) * deltaTime * 2; // Smooth lerp

                // Bobbing motion - stay above terrain
                const bobAmount = Math.sin(performance.now() * 0.003 + i) * 0.02;
                butterfly.position.y = vel.cachedTerrainY + vel.baseHeight + bobAmount;

                // Face movement direction
                butterfly.rotation.y = Math.atan2(vel.vx, vel.vz);

                // Wander timer
                vel.wanderTimer -= deltaTime;
                if (vel.wanderTimer <= 0) {
                    const newAngle = Math.random() * Math.PI * 2;
                    const speed = 1 + Math.random() * 2;
                    vel.vx = Math.cos(newAngle) * speed;
                    vel.vz = Math.sin(newAngle) * speed;
                    vel.wanderTimer = 25 + Math.random() * 10;
                    // Update terrain height when changing direction
                    vel.cachedTerrainY = this.terrain ? this.terrain.getHeightAt(butterfly.position.x, butterfly.position.z) : 0;
                }

                // Wrap around terrain bounds
                if (butterfly.position.x > terrainHalfSize) butterfly.position.x = -terrainHalfSize;
                if (butterfly.position.x < -terrainHalfSize) butterfly.position.x = terrainHalfSize;
                if (butterfly.position.z > terrainHalfSize) butterfly.position.z = -terrainHalfSize;
                if (butterfly.position.z < -terrainHalfSize) butterfly.position.z = terrainHalfSize;

                // Distance culling
                const dx = butterfly.position.x - cameraPos.x;
                const dz = butterfly.position.z - cameraPos.z;
                butterfly.visible = (dx * dx + dz * dz) < 2500;
            }
        }

        if (this.hudManager) {
            this.hudManager.update();
        }

        if (this.fpsCounter) {
            this.fpsCounter.update();
        }

        if (this.playerStamina < 100) {
            this.playerStamina = Math.min(100, this.playerStamina + 10 * deltaTime);
        }
    }

    _setupEventListeners() {
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.addEventListener('click', () => this.start());
        }

        // F9: Toggle screen recording (1080p by default)
        // F10: Toggle 4K recording
        window.addEventListener('keydown', (e) => {
            if (e.code === 'F9') {
                e.preventDefault();
                if (this.engine.screenRecorder) {
                    const isRecording = this.engine.screenRecorder.toggle({ resolution: '1080p' });
                    console.log(isRecording ? '🔴 Recording started (1080p)' : '⏹️ Recording stopped');
                }
            }
            if (e.code === 'F10') {
                e.preventDefault();
                if (this.engine.screenRecorder) {
                    const isRecording = this.engine.screenRecorder.toggle({ resolution: '4k' });
                    console.log(isRecording ? '🔴 Recording started (4K)' : '⏹️ Recording stopped');
                }
            }
        });
    }

    start() {
        // console.log('🚀 Starting game...');

        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.style.display = 'none';
        }

        const hud = document.getElementById('hud');
        if (hud) {
            hud.style.display = 'block';
        }

        this.engine.requestPointerLock();
        this.engine.start();
        this.isRunning = true;
        this._lastTime = performance.now();
        this._gameLoop();

        // console.log('✅ Game started!');
    }

    _updateLoadingText(text) {
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    _updateLoadingBar(percent) {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            loadingBar.style.width = `${percent}% `;
        }
    }

    _showStartScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }

        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.style.display = 'flex';
        }
    }

    dispose() {
        if (this.engine) {
            this.engine.dispose();
        }
    }
}

export default Game;
