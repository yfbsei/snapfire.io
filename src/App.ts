import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { HDRCubeTexture } from '@babylonjs/core/Materials/Textures/hdrCubeTexture';

// Terrain system
import { TerrainSystem, TerrainConfig } from './terrain';

// Character controller
import { CharacterController } from './character-controller';

// HDRI Configuration
import { CURRENT_HDRI, AVAILABLE_HDRIS } from './hdri-config';

// Photorealistic Rendering Systems
import { CURRENT_PRESET } from './rendering-config';
import { LightSystem, DEFAULT_LIGHT_CONFIG } from './light-system';
import { ShadowSystem } from './shadow-system';
import { AtmosphereSystem } from './atmosphere-system';
import { RenderingPipeline } from './rendering-pipeline';

// Vegetation System
import { VegetationSystem } from './vegetation-system';
import { VEGETATION_CONFIG } from './vegetation-config';

// Inspector import (optional - remove if not needed)
import '@babylonjs/inspector';

export class App {
    private engine!: WebGPUEngine;
    private scene!: Scene;
    private canvas: HTMLCanvasElement;
    private terrainSystem!: TerrainSystem;
    private camera!: ArcRotateCamera;

    // Photorealistic rendering systems
    private lightSystem!: LightSystem;
    private shadowSystem!: ShadowSystem;
    private atmosphereSystem!: AtmosphereSystem;
    private renderingPipeline!: RenderingPipeline;

    // Character controller
    private characterController!: CharacterController;

    // Vegetation system
    private vegetationSystem!: VegetationSystem;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async init(): Promise<void> {
        await this.initEngine();
        await this.createScene();
        this.startRenderLoop();
    }

    private async initEngine(): Promise<void> {
        console.log('🚀 Initializing WebGPU Engine...');

        // Check WebGPU support
        if (!navigator.gpu) {
            throw new Error(
                'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, or another WebGPU-compatible browser.'
            );
        }

        // Create WebGPU engine with extended limits for photorealistic rendering
        this.engine = new WebGPUEngine(this.canvas, {
            adaptToDeviceRatio: true,
            antialias: true,
            stencil: true,
            // Request higher limits for advanced rendering features and large assets
            deviceDescriptor: {
                requiredLimits: {
                    maxColorAttachmentBytesPerSample: 128, // Support SSAO, SSR, and other MRT effects
                    maxBufferSize: 2147483648,            // 2GB buffer size for large vegetation models
                },
            },
        });

        // Initialize WebGPU
        await this.engine.initAsync();

        console.log('✅ WebGPU Engine initialized');
    }

    private async createScene(): Promise<void> {
        console.log('🎬 Creating scene...');

        // Create scene
        this.scene = new Scene(this.engine);
        // Night-time clear color (very dark, close to black)
        this.scene.clearColor = new Color3(0.01, 0.01, 0.02).toColor4();

        // Create camera - ArcRotateCamera for easy terrain exploration
        this.camera = new ArcRotateCamera(
            'camera',
            -Math.PI / 2,    // Alpha: horizontal rotation (start facing forward)
            Math.PI / 3,     // Beta: vertical rotation (look down at terrain)
            250,             // Radius: distance from target (start further out to see more terrain)
            new Vector3(0, 50, 0),  // Target: center of terrain at some height
            this.scene
        );

        // Enable camera controls (mouse drag to rotate, scroll to zoom, right-click to pan)
        this.camera.attachControl(this.canvas, true);

        // Camera limits
        this.camera.lowerRadiusLimit = 5;     // Min zoom (can get close)
        this.camera.upperRadiusLimit = 2000;  // Max zoom (can see entire 2km terrain)
        this.camera.lowerBetaLimit = 0.1;     // Prevent camera going below ground
        this.camera.upperBetaLimit = Math.PI / 2 - 0.1;  // Prevent flipping over

        // Camera movement speed
        this.camera.wheelPrecision = 50;       // Mouse wheel zoom sensitivity
        this.camera.panningSensibility = 50;    // Right-click pan sensitivity
        this.camera.angularSensibilityX = 500;  // Rotation sensitivity
        this.camera.angularSensibilityY = 500;

        // CRITICAL: Set minZ for large terrain to prevent Z-fighting/vibration
        // Default minZ (0.1) causes depth buffer precision issues on large terrains
        this.camera.minZ = 1;  // 1 meter near clip prevents jitter

        // Setup WASD keyboard controls for camera movement
        this.setupKeyboardControls();

        // ===== PHOTOREALISTIC HDRI LIGHTING =====
        console.log('💡 Setting up photorealistic HDRI lighting...');

        // Load .env environment texture (prefiltered format for best performance)
        const hdrTexture = CubeTexture.CreateFromPrefilteredData(
            CURRENT_HDRI.path,
            this.scene
        );

        // Apply HDRI as environment texture for realistic reflections and lighting
        this.scene.environmentTexture = hdrTexture;

        // Enable image-based lighting (IBL) for photorealistic rendering
        this.scene.createDefaultSkybox(hdrTexture, true, 10000, CURRENT_HDRI.skyboxBlur);

        // Adjust environment intensity from configuration
        this.scene.environmentIntensity = CURRENT_HDRI.intensity;

        console.log(`✅ HDRI lighting applied: ${CURRENT_HDRI.name}`);
        console.log(`   ${CURRENT_HDRI.description}`);
        console.log(`   Intensity: ${CURRENT_HDRI.intensity}, Skybox Blur: ${CURRENT_HDRI.skyboxBlur}`);
        console.log('');
        console.log('ℹ️  To switch HDRI, edit src/hdri-config.ts and change CURRENT_HDRI index:');
        AVAILABLE_HDRIS.forEach((hdri, index) => {
            const current = hdri === CURRENT_HDRI ? '← ACTIVE' : '';
            console.log(`   ${index}: ${hdri.name} ${current}`);
        });

        // ===== PHOTOREALISTIC LIGHTING & SHADOWS =====
        console.log('');
        console.log('🌟 Setting up photorealistic rendering systems...');

        // Night-time mode: Disable sunlight and shadows
        // For night scenes, we rely purely on HDRI ambient lighting and moon light
        console.log('☁️ Overcast day mode: Soft diffused sunlight enabled');

        // Disable sunlight for night-time
        this.lightSystem = new LightSystem(this.scene);
        const sunLight = this.lightSystem.setupLights(DEFAULT_LIGHT_CONFIG);

        // Initialize shadow system with optimized settings for terrain
        this.shadowSystem = new ShadowSystem(this.scene, CURRENT_PRESET.shadows);
        const shadowGenerator = this.shadowSystem.setupShadows(sunLight, []);

        // ===== ATMOSPHERIC EFFECTS =====

        // Setup atmospheric fog
        this.atmosphereSystem = new AtmosphereSystem(this.scene, CURRENT_PRESET.atmosphere);
        this.atmosphereSystem.setup();

        // ===== POST-PROCESSING PIPELINE =====

        // Setup main rendering pipeline with all post-processing effects
        this.renderingPipeline = new RenderingPipeline(this.scene, CURRENT_PRESET.postProcess);
        this.renderingPipeline.setup(this.camera);

        // Create terrain from heightmap
        const terrainConfig: TerrainConfig = {
            width: 2000,              // 2km width
            height: 2000,             // 2km height
            subdivisions: 256,        // High detail for 4k heightmap
            maxHeight: 200,           // Maximum elevation (adjust as needed)
            minHeight: 0,             // Minimum elevation
            heightmapPath: '/src/asset/heightmap/heightmap.png',
        };

        this.terrainSystem = new TerrainSystem(this.scene, terrainConfig);
        const terrain = await this.terrainSystem.createTerrain();

        // Enable shadows on terrain
        if (terrain) {
            // Terrain both receives and casts shadows for full shadow system
            terrain.receiveShadows = true;
            this.shadowSystem.addShadowCaster(terrain);
            console.log('🌓 Terrain added as shadow caster');
        }

        console.log('✅ Terrain loaded from 4k heightmap');
        console.log('📐 Terrain size: 2km x 2km');

        // ===== VEGETATION SYSTEM =====
        console.log('');
        console.log('🌲 Setting up vegetation system...');

        this.vegetationSystem = new VegetationSystem(this.scene, VEGETATION_CONFIG);
        await this.vegetationSystem.loadAssets();
        this.vegetationSystem.distributeVegetation(terrain);

        // ===== CHARACTER CONTROLLER =====
        console.log('🧍 Setting up character controller...');

        // Create character controller on the terrain
        this.characterController = new CharacterController(this.scene, terrain, {
            spawnPosition: new Vector3(0, 150, 0),  // Start above terrain center
        });
        await this.characterController.init();

        // Lock camera to follow the character
        this.camera.lockedTarget = this.characterController.getMesh();

        // Adjust camera settings for third-person view
        this.camera.radius = 15;  // Distance from character
        this.camera.lowerRadiusLimit = 3;  // Min zoom (close to character)
        this.camera.upperRadiusLimit = 50;  // Max zoom (can see surroundings)
        this.camera.beta = Math.PI / 3;  // Default viewing angle

        console.log('✅ Third-person character controller ready');
        console.log('🌲 Ready for forest procedural generation');

        // Show inspector AND scene explorer automatically on startup
        // Scene explorer will be on the left, inspector on the right
        await this.scene.debugLayer.show({
            embedMode: false,  // Set to false to show both panels properly
        });

        console.log('🔍 Inspector + Scene Explorer enabled (press Shift+Ctrl+Alt+I to toggle)');
        console.log('⌨️  WASD to move character | Mouse to rotate camera | Scroll to zoom');

        // Enable inspector toggle with Shift+Ctrl+Alt+I
        window.addEventListener('keydown', (event) => {
            if (event.shiftKey && event.ctrlKey && event.altKey && event.key === 'I') {
                if (this.scene.debugLayer.isVisible()) {
                    this.scene.debugLayer.hide();
                } else {
                    this.scene.debugLayer.show();
                }
            }
        });
    }

    private setupKeyboardControls(): void {
        // Keyboard controls are now handled by the CharacterController
        // This method is kept for any future camera-specific controls
        console.log('⌨️  Keyboard controls delegated to character controller');
    }

    private startRenderLoop(): void {
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.engine.resize();
        });

        console.log('🎮 Render loop started');
    }

    public dispose(): void {
        // Dispose rendering systems
        this.renderingPipeline?.dispose();
        this.atmosphereSystem?.dispose();
        this.shadowSystem?.dispose();
        this.lightSystem?.dispose();

        // Dispose character controller
        this.characterController?.dispose();

        // Dispose vegetation system
        this.vegetationSystem?.dispose();

        // Dispose scene systems
        this.terrainSystem?.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }
}
