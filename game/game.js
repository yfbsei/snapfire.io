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


        // World settings
        this.worldSize = 2000;
        this.worldHalfSize = 1000;

        // Sky sphere reference
        this.skySphere = null;
    }

    async init() {
        // console.log('🎮 Initializing OpenWorld Explorer (Minimal)...');

        try {
            this._updateLoadingText('Initializing Engine...');
            this._updateLoadingBar(10);

            // Create engine with optimizations - NO WebGPU per request
            this.engine = new GameEngine({
                preferWebGPU: false,
                postProcessing: false,
                antialias: false, // Disabled for extreme performance
                shadows: false, // Disabled to eliminate light hotspot artifact
                shadowMapSize: 1024
            });

            const container = document.getElementById('game-container');
            await this.engine.init(container);

            // FORCE DISABLE all shadows at renderer level
            if (this.engine.renderer && this.engine.renderer.shadowMap) {
                this.engine.renderer.shadowMap.enabled = false;
            }

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

            // Configure engine lighting for sunset (replaces manual setup to avoid redundant suns)
            this._configureEngineLighting();

            // Initialize wind animation system
            this._setupWind();

            // Setup World Streaming for ALL assets
            this._setupStreaming();

            // Initialize systems
            this._setupSystems();

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
        // Create terrain system with procedural heightmap
        this.terrain = new TerrainSystem(this.engine, {
            chunkSize: 64,
            chunkWorldSize: 100,
            maxHeight: 25
        });

        // Load PBR brown mud textures for terrain
        try {
            const textureLoader = new THREE.TextureLoader();
            const loadTexture = (path, isSRGB = false) => new Promise((resolve, reject) => {
                textureLoader.load(path, (texture) => {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(15, 15);
                    if (isSRGB) texture.colorSpace = THREE.SRGBColorSpace;
                    resolve(texture);
                }, undefined, reject);
            });

            const [diffuseMap, normalMap, armMap] = await Promise.all([
                loadTexture(AssetCatalog.ground.mudForest.diffuse, true),
                loadTexture(AssetCatalog.ground.mudForest.normal, false),
                loadTexture(AssetCatalog.ground.mudForest.arm, false)
            ]);

            // Restored PBR material - WITHOUT normal map (suspected cause of light hotspot)
            const terrainMaterial = new THREE.MeshStandardMaterial({
                map: diffuseMap,
                // normalMap: normalMap,  // DISABLED - suspected cause of light hotspot artifact
                // normalScale: new THREE.Vector2(0.5, 0.5),
                roughness: 1.0,  // Maximum matte to prevent specular
                metalness: 0.0,
                envMapIntensity: 0.0  // No environment reflections
            });

            this.terrain.setMaterial(terrainMaterial);
        } catch (err) {
            this.terrain.setMaterial(new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
        }
    }

    _setupWind() {
        this.windSystem = new WindAnimationSystem({
            windStrength: 0.4,
            windSpeed: 1.5,
            turbulence: 0.15
        });

        this.grassWindSystem = new WindAnimationSystem({
            windStrength: 0.25,
            windSpeed: 2.5,
            turbulence: 0.1
        });

        this.treeWindSystem = new WindAnimationSystem({
            windStrength: 0.1,
            windSpeed: 0.8,
            turbulence: 0.02
        });
    }

    async _setupStreaming() {
        if (!this.engine.streamer) return;

        // Configure World Streaming for 2km x 2km map
        this.engine.streamer.params.chunkSize = 100;
        this.engine.streamer.params.loadDistance = 3;
        this.engine.streamer.params.unloadDistance = 5;
        this.engine.streamer.params.worldBounds = {
            minX: -this.worldHalfSize,
            maxX: this.worldHalfSize,
            minZ: -this.worldHalfSize,
            maxZ: this.worldHalfSize
        };

        // Register Terrain first
        this.engine.streamer.registerSystem(this.terrain);

        // Load assets for PropSystem
        this._updateLoadingText('Loading Assets for Streaming...');
        const [foliagePack, treePack, tablePack, butterflyPack, outpostPack] = await Promise.all([
            this.engine.loadModel(AssetCatalog.foliage.pack, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.foliage.blueSpruce, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.props.picnicTable, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.insects.butterfly, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.props.outpost, { addToScene: false, animations: false })
        ]);

        // Create and register PropSystem
        this.propSystem = new PropSystem(this, {
            foliage: foliagePack,
            trees: treePack,
            tables: tablePack,
            butterflies: butterflyPack,
            outposts: outpostPack
        });
        this.engine.streamer.registerSystem(this.propSystem);
    }

    async _setupSky() {
        // console.log('🌤️ Setting up sky...');

        // Remove the engine's built-in SkySystem sky object
        if (this.engine.skySystem && this.engine.skySystem.sky) {
            this.engine.scene.remove(this.engine.skySystem.sky);
        }

        // Load HDR sunset sky as a custom sky sphere (separate brightness from scene)
        try {
            const hdriTexture = await this.engine.assets.loadHDR(AssetCatalog.environment.hdri);

            // 1. Convert Equirectangular HDR to CubeMap for hardware-accelerated mapping
            // This is the most efficient way to render a skybox: it has NO seams and is EXTREMELY fast.
            const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(hdriTexture.image.height);
            cubeRenderTarget.fromEquirectangularTexture(this.engine.renderer, hdriTexture);
            const cubeMap = cubeRenderTarget.texture;

            // 2. Create sphere geometry for the sky
            const skyGeometry = new THREE.SphereGeometry(5000, 16, 16); // Reduced from 32x32 for performance

            // 3. Custom shader to optimize performance:
            //    Uses native samplerCube lookup (no per-pixel math like atan/asin)
            //    Render LAST with depthTest=true to avoid overdraw
            const skyMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    skyTexture: { value: cubeMap },
                    brightness: { value: 0.5 } // Reduced to 0.5 for balanced look
                },
                vertexShader: `
                    varying vec3 vDirection;
                    void main() {
                        // Use local position as direction for cubemap lookup
                        vDirection = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform samplerCube skyTexture;
                    uniform float brightness;
                    varying vec3 vDirection;
                    
                    vec3 toneMap(vec3 color) {
                        return color / (color + vec3(1.0));
                    }
                    
                    void main() {
                        // Hardware-accelerated cubemap lookup
                        vec4 texColor = textureCube(skyTexture, vDirection);
                        vec3 mapped = toneMap(texColor.rgb);
                        gl_FragColor = vec4(mapped * brightness, 1.0);
                    }
                `,
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: true  // Optimization: Only render where depth is clear
            });

            // Clean up original texture since we now have the CubeMap
            hdriTexture.dispose();

            this.skySphere = new THREE.Mesh(skyGeometry, skyMaterial);
            this.skySphere.name = 'CustomSkySphere';
            this.skySphere.renderOrder = 1000;  // Render LAST to avoid overdraw
            this.skySphere.frustumCulled = false;
            this.engine.scene.add(this.skySphere);

            // Clear the scene background so our sphere shows
            this.engine.scene.background = null;
            this.engine.scene.environment = null;

            // *** CRITICAL: Disable SkySystem to prevent it from regenerating environment maps ***
            // SkySystem._updateEnvMap sets scene.environment, which causes specular reflections
            if (this.engine.skySystem) {
                this.engine.skySystem.isReady = false; // Prevents update() from running
            }

            // console.log('✅ HDR sunset sky loaded with custom brightness control');
        } catch (err) {
            console.warn('⚠️ HDR sky not found, using dark sunset color', err);
            this.engine.scene.background = new THREE.Color(0x2a1a3a);  // Dark purple sunset
        }
    }

    /**
     * Configure engine's built-in lighting system for sunset behavior.
     * Replaces manual _setupLighting to avoid duplicate suns and shadow maps.
     */
    _configureEngineLighting() {
        const lighting = this.engine.lighting;
        if (!lighting) return;

        // 1. REMOVE the Sun (DirectionalLight) entirely - causes light hotspot issues
        if (lighting.sun) {
            this.engine.scene.remove(lighting.sun);
            lighting.sun = null;
        }

        // 2. Configure Ambient atmosphere (Hemisphere Light)
        if (lighting.ambient) {
            lighting.ambient.color.setHex(0xa080a0); // Dusk Purple/Lavender
            lighting.ambient.groundColor.setHex(0x556655); // Neutral bounce
            lighting.ambient.intensity = 2.5; // Compensate for lower sun (was 2.2)
        }

        // console.log('✅ Lighting consolidated (Redundant lights removed)');
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

    _setupSystems() {
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
        // Update PropSystem (butterflies etc)
        if (this.propSystem) {
            this.propSystem.update(deltaTime);
        }

        // Update sky sphere position to follow the camera (locks sky to infinity)
        if (this.skySphere && this.engine.camera) {
            this.skySphere.position.copy(this.engine.camera.position);
        }

        // *** FORCE DISABLE environment reflections every frame ***
        if (this.engine.scene.environment !== null) {
            this.engine.scene.environment = null;
        }

        // NOTE: Sun-following code REMOVED - it was causing specular to follow the player!
        // The sun should stay at a fixed world-space position for proper lighting.

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

    // Re-lock pointer on click if game is running
    _setupPointerLockOnReload() {
        this.engine.renderer.domElement.addEventListener('click', () => {
            if (this.isRunning && !this.engine.input.isPointerLocked) {
                this.engine.requestPointerLock();
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
        this._setupPointerLockOnReload();
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
// ----------------------------------------------------------------------------
// PROPSYSTEM - Handles per-chunk asset generation
// ----------------------------------------------------------------------------

class PropSystem {
    constructor(game, assets) {
        this.game = game;
        this.assets = assets;
        this.materialCache = new Map();

        // Configuration (Optimized)
        this.grassPerChunk = 3000; // Reduced from 6000 for better FPS
        this.treesPerChunk = 4;
        this.tablesPerChunk = 2;
        this.outpostsPerChunk = 0.1;

        this.butterfliesPerChunk = 2;

        // Shared helpers
        this._matrix = new THREE.Matrix4();
        this._position = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._euler = new THREE.Euler();

        // Butterfly state tracking for animation
        this.activeButterflies = [];

        // Prepare Meshes
        this._initMeshes();
    }

    _initMeshes() {
        // Grass
        const foliageMeshes = [];
        this.assets.foliage.object3D.traverse(m => { if (m.isMesh) foliageMeshes.push(m); });
        this.grassMeshes = foliageMeshes.filter(m => ['green-material', 'mid-material'].includes(m.name));

        // Trees
        this.treeMeshes = [];
        this.assets.trees.object3D.traverse(m => { if (m.isMesh) this.treeMeshes.push(m); });

        // Tables
        this.tableMeshes = [];
        this.assets.tables.object3D.traverse(m => { if (m.isMesh) this.tableMeshes.push(m); });

        // Butterflies
        this.butterflyMeshes = [];
        this.assets.butterflies.object3D.traverse(m => { if (m.isMesh) this.butterflyMeshes.push(m); });

        // Outposts
        this.outpostMeshes = [];
        this.assets.outposts.object3D.traverse(m => { if (m.isMesh) this.outpostMeshes.push(m); });
    }

    _getSeededRandom(x, z, seed = 0) {
        const dot = x * 12.9898 + z * 78.233 + seed * 43758.5453;
        const sn = Math.sin(dot) * 43758.5453123;
        return sn - Math.floor(sn);
    }

    onChunkLoad(chunk) {
        const { x, z, group } = chunk;
        const chunkSize = this.game.engine.streamer.params.chunkSize;
        const worldX = x * chunkSize;
        const worldZ = z * chunkSize;

        this._spawnGrass(chunk, worldX, worldZ, chunkSize);
        this._spawnTrees(chunk, worldX, worldZ, chunkSize);
        this._spawnTables(chunk, worldX, worldZ, chunkSize);
        this._spawnOutposts(chunk, worldX, worldZ, chunkSize);
        this._spawnButterflies(chunk, worldX, worldZ, chunkSize);

        // Distance-based optimization: DISABLE shadows for distant chunks
        const playerPos = this.game.engine.camera ? this.game.engine.camera.position : new THREE.Vector3();
        const chunkCenter = new THREE.Vector3(worldX + chunkSize / 2, 0, worldZ + chunkSize / 2);
        const distToPlayer = playerPos.distanceTo(chunkCenter);

        if (distToPlayer > 150) {
            chunk.group.traverse(obj => {
                if (obj.isMesh || obj.isInstancedMesh) {
                    obj.castShadow = false;
                    obj.receiveShadow = false; // Distant objects don't need specular/shadow receiving
                }
            });
        }
    }

    _spawnGrass(chunk, worldX, worldZ, size) {
        if (this.grassMeshes.length === 0) return;
        const grassGroup = new THREE.Group();
        grassGroup.name = 'Grass';
        chunk.group.add(grassGroup);

        const buckets = [[], []];
        const numClusters = 25; // Increase cluster count
        const clusterCenters = [];

        // Define cluster centers for this chunk
        for (let i = 0; i < numClusters; i++) {
            clusterCenters.push({
                x: this._getSeededRandom(worldX, worldZ, i * 1111) * size,
                z: this._getSeededRandom(worldX, worldZ, i * 2222) * size,
                radius: 4 + this._getSeededRandom(worldX, worldZ, i * 3333) * 8 // 4m to 12m clusters
            });
        }

        for (let i = 0; i < this.grassPerChunk; i++) {
            let lx, lz;
            const rx = this._getSeededRandom(worldX, worldZ, i * 1);
            const rz = this._getSeededRandom(worldX, worldZ, i * 2);

            // 85% Clustered, 15% Random Outliers for "much more" density
            if (rx < 0.85) {
                const clusterIdx = Math.floor(this._getSeededRandom(worldX, worldZ, i * 3) * numClusters);
                const cluster = clusterCenters[clusterIdx];

                // Random angle and distance within cluster
                const angle = this._getSeededRandom(worldX, worldZ, i * 4) * Math.PI * 2;
                // Cubic distribution (rand^1.5) for high density at cluster centers
                const randDist = this._getSeededRandom(worldX, worldZ, i * 5);
                const dist = Math.pow(randDist, 1.5) * cluster.radius;

                lx = cluster.x + Math.cos(angle) * dist;
                lz = cluster.z + Math.sin(angle) * dist;
            } else {
                lx = this._getSeededRandom(worldX, worldZ, i * 6) * size;
                lz = this._getSeededRandom(worldX, worldZ, i * 7) * size;
            }

            // Keep within chunk boundaries
            lx = THREE.MathUtils.clamp(lx, 0, size);
            lz = THREE.MathUtils.clamp(lz, 0, size);

            const gx = worldX + lx;
            const gz = worldZ + lz;
            const y = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;
            const typeIdx = (Math.sin(gx * 0.1) + rx) > 0.5 ? 0 : 1;

            this._position.set(lx, y, lz);
            this._euler.set(0, rx * Math.PI * 2, 0);
            this._quaternion.setFromEuler(this._euler);
            // Increased scale slightly (1.2 to 1.8) to maintain visual density with fewer instances
            const s = 1.2 + rz * 0.6;
            this._scale.set(s, s, s);
            this._matrix.compose(this._position, this._quaternion, this._scale);
            buckets[typeIdx].push(this._matrix.clone());
        }

        buckets.forEach((matrices, idx) => {
            if (matrices.length === 0) return;
            const proto = this.grassMeshes[idx];
            const mat = this._getGrassMaterial(proto.material);
            const im = new THREE.InstancedMesh(proto.geometry, mat, matrices.length);
            for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
            im.frustumCulled = true;
            im.computeBoundingSphere();
            grassGroup.add(im);
        });
    }

    _spawnTrees(chunk, worldX, worldZ, size) {
        const treeGroup = new THREE.Group();
        treeGroup.name = 'Trees';
        chunk.group.add(treeGroup);

        const treeInstances = [];
        for (let i = 0; i < this.treesPerChunk; i++) {
            const rx = this._getSeededRandom(worldX, worldZ, i * 10);
            const rz = this._getSeededRandom(worldX, worldZ, i * 20);
            const lx = rx * size;
            const lz = rz * size;
            const gx = worldX + lx;
            const gz = worldZ + lz;
            const y = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;
            treeInstances.push({ pos: [lx, y, lz], rot: rz * Math.PI * 2, scale: 5 + rx * 5 });
        }

        this.treeMeshes.forEach(proto => {
            const mat = this._getTreeMaterial(proto.material, proto.name);
            const im = new THREE.InstancedMesh(proto.geometry, mat, treeInstances.length);
            treeInstances.forEach((inst, i) => {
                this._position.set(...inst.pos);
                this._euler.set(-Math.PI / 2, 0, inst.rot);
                this._quaternion.setFromEuler(this._euler);
                this._scale.set(inst.scale, inst.scale, inst.scale);
                this._matrix.compose(this._position, this._quaternion, this._scale);
                im.setMatrixAt(i, this._matrix);
            });
            im.frustumCulled = true;
            im.computeBoundingSphere();
            treeGroup.add(im);
        });
    }

    _spawnTables(chunk, worldX, worldZ, size) {
        if (this.tablesPerChunk <= 0) return;

        const tableGroup = new THREE.Group();
        tableGroup.name = 'Tables';
        chunk.group.add(tableGroup);

        const tableInstances = [];
        for (let i = 0; i < this.tablesPerChunk; i++) {
            // Use different seeds for each table in the chunk
            const rx = this._getSeededRandom(worldX, worldZ, i * 333 + 777);
            const rz = this._getSeededRandom(worldX, worldZ, i * 444 + 888);
            const lx = rx * size;
            const lz = rz * size;
            const gx = worldX + lx;
            const gz = worldZ + lz;
            const y = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;

            // Random rotation
            const rot = rx * Math.PI * 2;
            // Realistic picnic table scale 
            const scale = 0.05;

            tableInstances.push({ pos: [lx, y, lz], rot, scale });
        }

        this.tableMeshes.forEach(proto => {
            const mat = this._getPropMaterial(proto.material, 0x8B4513, 0.7);

            const im = new THREE.InstancedMesh(proto.geometry, mat, tableInstances.length);

            // Distance check for shadows
            const playerPos = this.game.engine.camera ? this.game.engine.camera.position : new THREE.Vector3();
            const chunkCenter = new THREE.Vector3(worldX + size / 2, 0, worldZ + size / 2);
            const dist = playerPos.distanceTo(chunkCenter);

            im.castShadow = dist < 120; // Only cast shadows if relatively close
            im.receiveShadow = dist < 200;

            tableInstances.forEach((inst, i) => {
                this._position.set(...inst.pos);
                // Models often need -Math.PI/2 rotation on X if exported from Blender
                this._euler.set(-Math.PI / 2, 0, inst.rot);
                this._quaternion.setFromEuler(this._euler);
                this._scale.set(inst.scale, inst.scale, inst.scale);
                this._matrix.compose(this._position, this._quaternion, this._scale);
                im.setMatrixAt(i, this._matrix);
            });

            im.frustumCulled = true;
            im.castShadow = true;
            im.receiveShadow = true;
            im.computeBoundingSphere();
            tableGroup.add(im);
        });
    }

    _spawnOutposts(chunk, worldX, worldZ, size) {
        // 0.5 probability means 1 outpost every 2 chunks on average
        const prob = this._getSeededRandom(worldX, worldZ, 9999);
        if (prob > this.outpostsPerChunk) return;

        const outpostGroup = new THREE.Group();
        outpostGroup.name = 'Outposts';
        chunk.group.add(outpostGroup);

        const rx = this._getSeededRandom(worldX, worldZ, 8888);
        const rz = this._getSeededRandom(worldX, worldZ, 7777);
        const lx = rx * size;
        const lz = rz * size;
        const gx = worldX + lx;
        const gz = worldZ + lz;
        const y = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;

        const rot = rx * Math.PI * 2;
        const scale = 0.05; // Realistic scale (matching picnic table)

        this.outpostMeshes.forEach(proto => {
            const mat = this._getPropMaterial(proto.material);
            const im = new THREE.InstancedMesh(proto.geometry, mat, 1);

            // Distance check for shadows
            const playerPos = this.game.engine.camera ? this.game.engine.camera.position : new THREE.Vector3();
            const chunkCenter = new THREE.Vector3(worldX + size / 2, 0, worldZ + size / 2);
            const dist = playerPos.distanceTo(chunkCenter);

            im.castShadow = dist < 150; // Outposts are larger, shadow distance slightly higher
            im.receiveShadow = dist < 250;

            this._position.set(lx, y, lz);
            this._euler.set(0, rot, 0); // Standing straight up facing the sky
            this._quaternion.setFromEuler(this._euler);
            this._scale.set(0.02, 0.02, 0.02); // Final scale reduction
            this._matrix.compose(this._position, this._quaternion, this._scale);
            im.setMatrixAt(0, this._matrix);

            im.frustumCulled = true;
            im.castShadow = true;
            im.receiveShadow = true;
            im.computeBoundingSphere();
            outpostGroup.add(im);
        });
    }


    _spawnButterflies(chunk, worldX, worldZ, size) {
        const butterflyGroup = new THREE.Group();
        butterflyGroup.name = 'Butterflies';
        chunk.group.add(butterflyGroup);

        const butterflyInstances = [];
        for (let i = 0; i < this.butterfliesPerChunk; i++) {
            const rx = this._getSeededRandom(worldX, worldZ, i * 100);
            const rz = this._getSeededRandom(worldX, worldZ, i * 200);
            const lx = rx * size;
            const lz = rz * size;
            const gx = worldX + lx;
            const gz = worldZ + lz;
            const ty = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;
            const y = ty + 1 + rz * 2;

            butterflyInstances.push({
                x: lx, y: y, z: lz,
                worldX: gx, worldZ: gz,
                vx: (this._getSeededRandom(worldX, worldZ, i * 3) - 0.5) * 2,
                vz: (this._getSeededRandom(worldX, worldZ, i * 4) - 0.5) * 2,
                baseY: y,
                timer: rx * 10
            });
        }

        this.butterflyMeshes.forEach(proto => {
            const mat = this._getButterflyMaterial(proto.material, proto.name);
            const im = new THREE.InstancedMesh(proto.geometry, mat, butterflyInstances.length);
            im.frustumCulled = true; // Was false, causing FPS drops
            im.castShadow = true;
            im.receiveShadow = false;

            // Large manual bounding sphere to prevent culling issues
            im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(50, 0, 50), 100);

            im.userData = { instances: butterflyInstances, worldX, worldZ };
            this.activeButterflies.push(im);
            butterflyGroup.add(im);
        });
    }

    _getPropMaterial(original, colorOverride = null, roughness = 0.8) {
        if (this.materialCache.has(original.uuid)) return this.materialCache.get(original.uuid);

        // Use MeshLambertMaterial for extreme performance (no specular calculations)
        const mat = new THREE.MeshLambertMaterial({
            map: original.map,
            color: colorOverride ? new THREE.Color(colorOverride) : (original.color ? original.color.clone() : 0xffffff),
            side: THREE.FrontSide
        });

        this.materialCache.set(original.uuid, mat);
        return mat;
    }

    _getButterflyMaterial(original, name) {
        if (this.materialCache.has(original.uuid)) return this.materialCache.get(original.uuid);

        const meshName = name ? name.toLowerCase() : '';
        const matName = original.name ? original.name.toLowerCase() : '';
        const isWing = matName.includes('wing') || meshName.includes('wing');
        const hasTexture = !!original.map;

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uMap: { value: original.map || null },
                uColor: { value: original.color ? original.color.clone() : new THREE.Color(0xffffff) },
                uIsWing: { value: isWing ? 1.0 : 0.0 },
                uHasTexture: { value: hasTexture ? 1.0 : 0.0 }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uIsWing;
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    if (uIsWing > 0.5) {
                        float instancePhase = float(gl_InstanceID) * 0.37;
                        float flapSpeed = 10.0 + sin(instancePhase) * 3.0;
                        float flapAngle = sin(uTime * flapSpeed + instancePhase) * 0.7;
                        float wingSide = sign(pos.x);
                        float angle = flapAngle * wingSide;
                        float cosA = cos(angle);
                        float sinA = sin(angle);
                        
                        // Pure rotation around Z axis for wings
                        float px = pos.x;
                        float py = pos.y;
                        pos.x = px * cosA - py * sinA;
                        pos.y = px * sinA + py * cosA;
                    }
                    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D uMap;
                uniform vec3 uColor;
                uniform float uHasTexture;
                varying vec2 vUv;
                void main() {
                    vec4 color = vec4(uColor, 1.0);
                    if (uHasTexture > 0.5) {
                        vec4 texColor = texture2D(uMap, vUv);
                        if (texColor.a < 0.5) discard;
                        color *= texColor;
                    }
                    gl_FragColor = color;
                }
            `,
            side: THREE.DoubleSide,
            transparent: true
        });

        this.materialCache.set(original.uuid, mat);
        return mat;
    }

    _getGrassMaterial(original) {
        if (this.materialCache.has(original.uuid)) return this.materialCache.get(original.uuid);
        // Use MeshLambertMaterial for extreme performance (no specular)
        let mat = new THREE.MeshLambertMaterial({
            map: original.map,
            color: original.color.clone(),
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide
        });
        if (this.game.grassWindSystem) mat = this.game.grassWindSystem.createWindMaterial(mat, { strengthMultiplier: 0.3, useUVForHeight: true });
        this.materialCache.set(original.uuid, mat);
        return mat;
    }

    _getTreeMaterial(original, name) {
        const key = original.uuid + (name || '');
        if (this.materialCache.has(key)) return this.materialCache.get(key);

        // Enhanced branch detection (covers needles, leaves, foliage)
        const lowerName = (name || '').toLowerCase();
        const lowerMatName = (original.name || '').toLowerCase();
        const isBranch = lowerName.includes('branch') || lowerName.includes('needle') ||
            lowerName.includes('leaf') || lowerName.includes('foliage') ||
            lowerMatName.includes('branch') || lowerMatName.includes('needle') ||
            lowerMatName.includes('leaf') || lowerMatName.includes('foliage');

        // Use MeshLambertMaterial for extreme performance (no specular)
        let mat = new THREE.MeshLambertMaterial({
            map: original.map,
            color: original.color.clone(),
            side: isBranch ? THREE.DoubleSide : THREE.FrontSide,
            alphaTest: 0.5
        });

        if (isBranch && this.game.treeWindSystem) {
            // Trees use UV-based wind for natural movement of branch leaves (needles)
            mat = this.game.treeWindSystem.createWindMaterial(mat, {
                strengthMultiplier: 0.5, // Reduced for stability
                useUVForHeight: true
            });
        }
        this.materialCache.set(key, mat);
        return mat;
    }

    update(dt) {
        if (this.game.windSystem) this.game.windSystem.update(dt);
        if (this.game.grassWindSystem) this.game.grassWindSystem.update(dt);
        if (this.game.treeWindSystem) this.game.treeWindSystem.update(dt);

        // Update Butterflies
        this.activeButterflies = this.activeButterflies.filter(im => im.parent !== null);
        const time = performance.now() * 0.001;

        const playerPos = this.game.engine.camera ? this.game.engine.camera.position : new THREE.Vector3();

        for (const im of this.activeButterflies) {
            if (im.material.uniforms) im.material.uniforms.uTime.value = time;

            const data = im.userData;
            // SKIP UPDATE for distant chunks (butterflies are small, don't need CPU cycles if far)
            const chunkWorldPos = new THREE.Vector3(data.worldX + 50, 0, data.worldZ + 50);
            if (playerPos.distanceTo(chunkWorldPos) > 200) continue;

            data.instances.forEach((inst, i) => {
                inst.timer += dt;

                // RANDOM STEERING - Adjust velocity slightly over time for organic movement
                // Trigger exactly once every 2 seconds
                if (Math.floor(inst.timer / 2.0) > Math.floor((inst.timer - dt) / 2.0)) {
                    const angleChange = (this._getSeededRandom(data.worldX, data.worldZ, i + Math.floor(inst.timer)) - 0.5) * 2;
                    const speed = Math.sqrt(inst.vx * inst.vx + inst.vz * inst.vz);
                    const currentAngle = Math.atan2(inst.vx, inst.vz);
                    const newAngle = currentAngle + angleChange;
                    inst.vx = Math.sin(newAngle) * speed;
                    inst.vz = Math.cos(newAngle) * speed;
                }

                inst.x += inst.vx * dt;
                inst.z += inst.vz * dt;

                // BOUNCING - Turn back before hitting chunk edges to prevent teleportation
                const size = this.game.engine.streamer.params.chunkSize;
                const margin = 5; // 5m safety zone
                if (inst.x < margin) { inst.vx = Math.abs(inst.vx); }
                if (inst.x > size - margin) { inst.vx = -Math.abs(inst.vx); }
                if (inst.z < margin) { inst.vz = Math.abs(inst.vz); }
                if (inst.z > size - margin) { inst.vz = -Math.abs(inst.vz); }

                // TERRAIN ALIGNMENT - Sample height at current world position
                const gx = data.worldX + inst.x;
                const gz = data.worldZ + inst.z;
                const terrainY = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;

                // Flight height: oscillates above terrain
                inst.y = terrainY + 1.5 + Math.sin(inst.timer * 2) * 0.5;

                this._position.set(inst.x, inst.y, inst.z);

                // ROTATION - Face travel direction + subtle wobble
                const yaw = Math.atan2(inst.vx, inst.vz); // Face forward (Removed + Math.PI)
                const roll = Math.sin(inst.timer * 4) * 0.1;
                const pitch = Math.sin(inst.timer * 2) * 0.05;

                this._euler.set(pitch, yaw, roll);
                this._quaternion.setFromEuler(this._euler);
                this._scale.set(0.5, 0.5, 0.5);
                this._matrix.compose(this._position, this._quaternion, this._scale);
                im.setMatrixAt(i, this._matrix);
            });
            im.instanceMatrix.needsUpdate = true;
        }
    }

    onChunkUnload(chunk) {
        // EXPLICIT CLEANUP - Remove InstancedMeshes from the active update list
        const butterflyGroup = chunk.group.getObjectByName('Butterflies');
        if (butterflyGroup) {
            butterflyGroup.children.forEach(child => {
                if (child.isInstancedMesh) {
                    const idx = this.activeButterflies.indexOf(child);
                    if (idx !== -1) {
                        this.activeButterflies.splice(idx, 1);
                    }
                }
            });
        }
    }
}

export default Game;
