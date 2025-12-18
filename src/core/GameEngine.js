/**
 * GameEngine - Unified game engine with all systems integrated
 * This is the main entry point for game development
 * 
 * Supports WebGPU (preferred) with automatic fallback to WebGL
 */
import * as THREE from 'three';
import { InputManager } from './input/InputManager.js';
import { ScriptManager } from './scripting/Script.js';
import { AssetLoader } from './assets/AssetLoader.js';
import { AudioManager } from './audio/AudioManager.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { GameObject } from './GameObject.js';
import { SkySystem } from './world/SkySystem.js';
// VegetationSystem is dynamically imported when WebGPU is available (uses TSL)
import { HLODSystem } from './world/HLODSystem.js';
import { WorldStreamer } from './world/WorldStreamer.js';
import { IKSystem } from './animation/IKSystem.js';
import { FPSCamera, TPSCamera, OrbitCamera } from './camera/CameraControllers.js';
import { AnimationController } from './animation/AnimationController.js';
import { LightingManager } from './rendering/LightingManager.js';
import { WebGPUAdapter } from './rendering/WebGPUAdapter.js';
import { PostProcessing } from './rendering/PostProcessing.js';
import { ScreenRecorder } from './rendering/ScreenRecorder.js';
// WebGPUPostProcessing is dynamically imported when WebGPU renderer is used

/**
 * GameEngine - Complete game engine for open-world FPS/TPS games
 */
export class GameEngine {
    constructor(options = {}) {
        // Core Three.js
        this.renderer = null;
        this.rendererAdapter = null;
        this.rendererType = null; // 'webgpu', 'webgl2', or 'webgl'
        this.scene = new THREE.Scene();
        this.camera = null;

        // Lighting
        this.lighting = null;

        // Post-Processing
        this.postProcessing = null;

        // Screen Recorder
        this.screenRecorder = null;

        // Game systems
        this.scripts = new ScriptManager(this);
        this.assets = new AssetLoader();
        this.audio = new AudioManager();
        this.input = new InputManager();
        this.physics = new PhysicsWorld({ useRapier: true });

        // Camera controller
        this.cameraController = null;

        // Game objects
        this.gameObjects = new Map();
        this.rootObjects = [];

        // Animation controllers
        this.animators = new Set();

        // Timing
        this.clock = new THREE.Clock();
        this.time = 0;
        this.deltaTime = 0;
        this.fixedDeltaTime = 1 / 60;

        // State
        this.isRunning = false;
        this.isPaused = false;

        // Stats
        this.stats = {
            fps: 0,
            frameTime: 0,
            gameObjects: 0
        };

        // Options
        this.options = {
            antialias: true,
            shadows: true,
            shadowMapSize: 2048,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
            preferWebGPU: true, // Try WebGPU first, fallback to WebGL
            ...options
        };
    }

    /**
     * Initialize the engine (async for WebGPU support)
     * @param {HTMLElement} container - Container element for the renderer
     * @returns {Promise<GameEngine>}
     */
    async init(container) {
        // Create renderer using WebGPU adapter (with fallback)
        this.rendererAdapter = new WebGPUAdapter();
        this.renderer = await this.rendererAdapter.init(container, {
            preferWebGPU: this.options.preferWebGPU,
            antialias: this.options.antialias,
            pixelRatio: this.options.pixelRatio
        });
        this.rendererType = this.rendererAdapter.rendererType;

        // Configure shadows (WebGL-specific, WebGPU handles differently)
        if (this.options.shadows && this.renderer.shadowMap) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        // Create default camera
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
        this.camera.position.set(0, 5, 10);

        // Initialize input
        this.input.init(this.renderer.domElement);

        // Initialize audio
        this.audio.init(this.camera);

        // Initialize physics (async)
        await this.physics.init();

        // Initialize Lighting (CSM)
        this.lighting = new LightingManager(this);

        // Initialize Post-Processing (skip if disabled via options)
        if (this.options.postProcessing !== false) {
            if (this.rendererType === 'webgpu') {
                // Dynamic import for WebGPU post-processing (requires WebGPU-specific three.js exports)
                try {
                    const { WebGPUPostProcessing } = await import('./rendering/WebGPUPostProcessing.js');
                    this.postProcessing = new WebGPUPostProcessing(this.renderer, this.scene, this.camera);
                } catch (err) {
                    console.warn('WebGPU PostProcessing not available, post-processing disabled for WebGPU:', err.message);
                    // Standard EffectComposer is NOT compatible with WebGPU renderer, so we skip it
                    this.postProcessing = null;
                }
            } else {
                this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
            }
        } else {
            this.postProcessing = null;
            // console.log('PostProcessing: Disabled via options');
        }

        // Default scene setup
        this._setupDefaultScene();

        // Handle resize
        this._setupResize(container);

        // Initialize Screen Recorder
        this.screenRecorder = new ScreenRecorder(this);
        this.screenRecorder.init();

        // Log renderer info
        // console.log(`GameEngine initialized with ${this.rendererType} renderer`);

        // Expose globally for systems like IK
        window.gameEngine = this;

        return this;
    }

    /**
     * Setup default scene lighting and environment
     */
    _setupDefaultScene() {
        // Sky System (Handles Sun & Atmosphere)
        this.skySystem = new SkySystem(this, {
            timeScale: 0.0 // Static by default, can be enabled
        });

        // Vegetation System (TSL-based, WebGPU only)
        // Dynamically imported to avoid TSL loading errors on WebGL
        this.vegetation = null;
        if (this.rendererType === 'webgpu') {
            import('./world/VegetationSystem.js').then(({ VegetationSystem }) => {
                this.vegetation = new VegetationSystem(this, {
                    grassCount: 50000, // AAA Density
                    range: 100
                });
            }).catch(err => {
                console.warn('VegetationSystem: Failed to load (TSL not available)', err);
            });
        } else {
            // console.log('VegetationSystem: Skipped (requires WebGPU)');
        }

        // HLOD System (Static Batching)
        this.hlod = new HLODSystem(this);

        // Advanced Animation (IK)
        this.ik = new IKSystem(this);

        // World Streaming
        this.streamer = new WorldStreamer(this);
    }

    /**
     * Setup window resize handler
     */
    _setupResize(container) {
        const resize = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);

            // Update Post-Processing size
            if (this.postProcessing) {
                this.postProcessing.setSize(width, height);
            }

            // Update volumetric pass if it exists
            if (this.lighting && this.lighting.volumetricPass) {
                this.lighting.volumetricPass.setSize(width, height);
            }
        };

        window.addEventListener('resize', resize);
        new ResizeObserver(resize).observe(container);
    }

    // ==================== Game Objects ====================

    /**
     * Create a new GameObject
     * @param {string} name
     * @returns {GameObject}
     */
    createGameObject(name = 'GameObject') {
        const go = new GameObject(name);
        this.addGameObject(go);
        return go;
    }

    /**
     * Add a GameObject to the scene
     * @param {GameObject} gameObject
     * @param {GameObject} parent - Optional parent
     */
    addGameObject(gameObject, parent = null) {
        this.gameObjects.set(gameObject.uuid, gameObject);

        if (parent) {
            parent.addChild(gameObject);
        } else {
            this.rootObjects.push(gameObject);
            this.scene.add(gameObject.object3D);
        }

        this.stats.gameObjects = this.gameObjects.size;
    }

    /**
     * Remove a GameObject
     * @param {GameObject} gameObject
     */
    removeGameObject(gameObject) {
        gameObject.destroy(this);
        this.gameObjects.delete(gameObject.uuid);

        const rootIndex = this.rootObjects.indexOf(gameObject);
        if (rootIndex !== -1) {
            this.rootObjects.splice(rootIndex, 1);
            this.scene.remove(gameObject.object3D);
        }

        this.stats.gameObjects = this.gameObjects.size;
    }

    /**
     * Find GameObject by name
     * @param {string} name
     * @returns {GameObject|null}
     */
    findGameObject(name) {
        for (const [, go] of this.gameObjects) {
            if (go.name === name) return go;
        }
        return null;
    }

    /**
     * Find GameObjects with tag
     * @param {string} tag
     * @returns {GameObject[]}
     */
    findGameObjectsWithTag(tag) {
        const result = [];
        for (const [, go] of this.gameObjects) {
            if (go.tag === tag) result.push(go);
        }
        return result;
    }

    // ==================== Primitives ====================

    /**
     * Create a primitive mesh GameObject
     * @param {string} type - 'box', 'sphere', 'cylinder', 'plane', 'capsule'
     * @param {Object} options
     * @returns {GameObject}
     */
    createPrimitive(type, options = {}) {
        const go = GameObject.createPrimitive(type, options);
        this.addGameObject(go);
        return go;
    }

    /**
     * Create ground plane
     * @param {number} size
     * @param {Object} options
     */
    createGround(size = 100, options = {}) {
        const geometry = new THREE.PlaneGeometry(size, size);
        const material = new THREE.MeshStandardMaterial({
            color: options.color || 0x3a7d44,
            roughness: options.roughness ?? 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.receiveShadow = true;
        mesh.name = 'Ground';

        const go = new GameObject('Ground');
        go.object3D.add(mesh);
        this.addGameObject(go);

        return go;
    }

    // ==================== Camera ====================

    /**
     * Setup FPS camera
     * @param {Object} options
     */
    setupFPSCamera(options = {}) {
        this.cameraController = new FPSCamera(this.camera, {
            input: this.input,
            ...options
        });
        return this.cameraController;
    }

    /**
     * Setup TPS camera
     * @param {THREE.Object3D} target - Object to follow
     * @param {Object} options
     */
    setupTPSCamera(target, options = {}) {
        this.cameraController = new TPSCamera(this.camera, target, {
            input: this.input,
            physics: this.physics,
            ...options
        });
        return this.cameraController;
    }

    /**
     * Setup orbit camera
     * @param {Object} options
     */
    setupOrbitCamera(options = {}) {
        this.cameraController = new OrbitCamera(this.camera, options);
        return this.cameraController;
    }

    // ==================== Loading ====================

    /**
     * Load a 3D model and create a GameObject
     * @param {string} path
     * @param {Object} options
     * @returns {Promise<GameObject>}
     */
    async loadModel(path, options = {}) {
        const model = await this.assets.loadModel(path, options);

        const go = new GameObject(options.name || 'Model');
        go.object3D.add(model);

        // Setup materials for CSM
        if (this.lighting) {
            const materials = [];
            model.traverse(child => {
                if (child.isMesh && child.material) {
                    materials.push(child.material);
                    // Ensure shadows are cast/received
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.lighting.setupMaterials(materials);
        }

        // Setup animator if model has animations
        if (model.userData?.animations && options.animations !== false) {
            const animator = new AnimationController(model, model.userData.animations);
            go._animator = animator;
            this.animators.add(animator);
        }

        if (options.addToScene !== false) {
            this.addGameObject(go);
        }

        return go;
    }

    /**
     * Set skybox from HDR
     * @param {string} path
     */
    async setSkybox(path) {
        const texture = await this.assets.loadHDR(path);
        this.scene.background = texture;
        this.scene.environment = texture;
    }

    // ==================== Game Loop ====================

    /**
     * Start the game loop
     */
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.clock.start();
        this._loop();
    }

    /**
     * Stop the game loop
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Pause the game
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume the game
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Main game loop
     */
    _loop() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this._loop());

        this.deltaTime = this.clock.getDelta();
        this.time = this.clock.getElapsedTime();

        // Update stats
        this.stats.frameTime = this.deltaTime * 1000;
        this.stats.fps = 1 / this.deltaTime;

        if (!this.isPaused) {
            this._update(this.deltaTime);
        }

        this._render();

        // Update input at end of frame
        this.input.update();
    }

    /**
     * Update game logic
     */
    _update(deltaTime) {
        // Update scripts
        this.scripts.update(deltaTime);

        // Update physics
        this.physics.update(deltaTime);

        // Update World Streaming
        if (this.streamer) {
            this.streamer.update(deltaTime);
        }

        // Update camera controller
        if (this.cameraController) {
            this.cameraController.update(deltaTime);
        }

        // Update animators
        for (const animator of this.animators) {
            animator.update(deltaTime);
        }

        // Late update
        this.scripts.lateUpdate(deltaTime);
    }

    /**
     * Render the scene
     */
    _render() {
        // Update lighting (CSM needs camera update)
        if (this.lighting) {
            this.lighting.update();
        }

        // Render via Post-Processing if enabled
        if (this.postProcessing && this.postProcessing.enabled) {
            this.postProcessing.render();
        } else {
            if (this.rendererAdapter && this.rendererAdapter.isWebGPU) {
                this.rendererAdapter.renderAsync(this.scene, this.camera);
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }
    }

    // ==================== Utility ====================

    /**
     * Request pointer lock for FPS controls
     */
    requestPointerLock() {
        this.input.requestPointerLock(this.renderer.domElement);
    }

    /**
     * Get mouse position in normalized device coordinates
     */
    getMouseNDC() {
        const pos = this.input.getMousePosition();
        const rect = this.renderer.domElement.getBoundingClientRect();
        return {
            x: ((pos.x - rect.left) / rect.width) * 2 - 1,
            y: -((pos.y - rect.top) / rect.height) * 2 + 1
        };
    }

    /**
     * Raycast from screen position
     * @param {Object} screenPos - {x, y} in NDC
     * @returns {Object|null}
     */
    raycastFromScreen(screenPos = null) {
        const raycaster = new THREE.Raycaster();
        const pos = screenPos || this.getMouseNDC();

        raycaster.setFromCamera(new THREE.Vector2(pos.x, pos.y), this.camera);

        const objects = this.rootObjects.map(go => go.object3D);
        const intersects = raycaster.intersectObjects(objects, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            // Find the GameObject
            let obj = hit.object;
            while (obj && !obj.userData.gameObject) {
                obj = obj.parent;
            }

            return {
                point: hit.point,
                normal: hit.face?.normal,
                distance: hit.distance,
                gameObject: obj?.userData.gameObject,
                object: hit.object
            };
        }

        return null;
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.stop();

        // Dispose systems
        this.input.dispose();
        this.audio.dispose();
        this.assets.dispose();
        this.scripts.dispose();
        this.physics.dispose();
        if (this.screenRecorder) {
            this.screenRecorder.dispose();
        }

        // Dispose game objects
        for (const go of this.rootObjects) {
            go.destroy(this);
        }

        // Dispose renderer adapter
        if (this.rendererAdapter) {
            this.rendererAdapter.dispose();
        }
    }

    /**
     * Get renderer information and capabilities
     * @returns {Object}
     */
    getRendererInfo() {
        if (this.rendererAdapter) {
            return this.rendererAdapter.getInfo();
        }
        return null;
    }

    /**
     * Check if a specific rendering feature is available
     * @param {string} feature - Feature name (computeShaders, rayTracing, etc.)
     * @returns {boolean}
     */
    hasFeature(feature) {
        if (this.rendererAdapter) {
            return this.rendererAdapter.hasFeature(feature);
        }
        return false;
    }

    /**
     * Check if using WebGPU renderer
     * @returns {boolean}
     */
    get isWebGPU() {
        return this.rendererAdapter?.isWebGPU || false;
    }
}

// Export all classes for direct use
export { InputManager } from './input/InputManager.js';
export { Script, ScriptManager } from './scripting/Script.js';
export { AssetLoader } from './assets/AssetLoader.js';
export { AudioManager } from './audio/AudioManager.js';
export { PhysicsWorld, RigidBody } from './physics/PhysicsWorld.js';
export { CharacterController } from './physics/CharacterController.js';
export { GameObject, Transform } from './GameObject.js';
export { AnimationController } from './animation/AnimationController.js';
export { FPSCamera, TPSCamera, OrbitCamera } from './camera/CameraControllers.js';
export { WebGPUAdapter } from './rendering/WebGPUAdapter.js';
