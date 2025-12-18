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

            const terrainMaterial = new THREE.MeshStandardMaterial({
                map: diffuseMap,
                normalMap: normalMap,
                normalScale: new THREE.Vector2(2.0, 2.0),
                roughnessMap: armMap,
                roughness: 0.15,
                metalness: 0.0,
                envMapIntensity: 0.3
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
        const [foliagePack, treePack, tablePack, butterflyPack] = await Promise.all([
            this.engine.loadModel(AssetCatalog.foliage.pack, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.foliage.blueSpruce, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.props.picnicTable, { addToScene: false, animations: false }),
            this.engine.loadModel(AssetCatalog.insects.butterfly, { addToScene: false, animations: false })
        ]);

        // Create and register PropSystem
        this.propSystem = new PropSystem(this, {
            foliage: foliagePack,
            trees: treePack,
            tables: tablePack,
            butterflies: butterflyPack
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
            // Load the HDRI texture
            const hdriTexture = await this.engine.assets.loadHDR(AssetCatalog.environment.hdri);

            // Create a large sphere for the sky (must be within camera far plane)
            const skyGeometry = new THREE.SphereGeometry(9000, 32, 32);

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

        // Fog disabled

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
// ----------------------------------------------------------------------------
// PROPSYSTEM - Handles per-chunk asset generation
// ----------------------------------------------------------------------------

class PropSystem {
    constructor(game, assets) {
        this.game = game;
        this.assets = assets;
        this.materialCache = new Map();

        // Configuration
        this.grassPerChunk = 20000;
        this.treesPerChunk = 4;
        this.tablesPerChunk = 0.5; // 50% chance
        this.butterfliesPerChunk = 3;

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
        this._spawnButterflies(chunk, worldX, worldZ, chunkSize);
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
            const s = 0.8 + rz * 0.4;
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
        if (this._getSeededRandom(worldX, worldZ, 999) > this.tablesPerChunk) return;
        const rx = this._getSeededRandom(worldX, worldZ, 333);
        const rz = this._getSeededRandom(worldX, worldZ, 444);
        const lx = rx * size;
        const lz = rz * size;
        const gx = worldX + lx;
        const gz = worldZ + lz;
        const y = this.game.terrain ? this.game.terrain.getHeightAt(gx, gz) : 0;

        this.tableMeshes.forEach(proto => {
            const mat = new THREE.MeshLambertMaterial({ map: proto.material.map, color: 0x8B4513 });
            const mesh = new THREE.Mesh(proto.geometry, mat);
            mesh.position.set(lx, y, lz);
            mesh.rotation.set(-Math.PI / 2, 0, rx * Math.PI * 2);
            mesh.scale.set(0.02, 0.02, 0.02);
            chunk.group.add(mesh);
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
            im.frustumCulled = false;
            im.castShadow = true;
            im.receiveShadow = false;

            // Large manual bounding sphere to prevent culling issues
            im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(50, 0, 50), 100);

            im.userData = { instances: butterflyInstances, worldX, worldZ };
            this.activeButterflies.push(im);
            butterflyGroup.add(im);
        });
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
        // Use MeshStandardMaterial for better lighting response (Standard material handles PBR better)
        // Ensure we use the color from the original GLB material
        let mat = new THREE.MeshStandardMaterial({
            map: original.map,
            color: original.color.clone(),
            transparent: true,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.0
        });
        if (this.game.grassWindSystem) mat = this.game.grassWindSystem.createWindMaterial(mat, { strengthMultiplier: 0.3, useUVForHeight: true });
        this.materialCache.set(original.uuid, mat);
        return mat;
    }

    _getTreeMaterial(original, name) {
        const key = original.uuid + (name || '');
        if (this.materialCache.has(key)) return this.materialCache.get(key);
        // Use MeshStandardMaterial for trees to match environment lighting
        let mat = new THREE.MeshStandardMaterial({
            map: original.map,
            color: original.color.clone(),
            side: THREE.DoubleSide,
            alphaTest: 0.5,
            roughness: 0.8,
            metalness: 0.0
        });

        // Enhanced branch detection (covers needles, leaves, foliage)
        const lowerName = (name || '').toLowerCase();
        const lowerMatName = (original.name || '').toLowerCase();
        const isBranch = lowerName.includes('branch') || lowerName.includes('needle') ||
            lowerName.includes('leaf') || lowerName.includes('foliage') ||
            lowerMatName.includes('branch') || lowerMatName.includes('needle') ||
            lowerMatName.includes('leaf') || lowerMatName.includes('foliage');

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

        for (const im of this.activeButterflies) {
            if (im.material.uniforms) im.material.uniforms.uTime.value = time;
            const data = im.userData;
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
