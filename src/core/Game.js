import * as THREE from 'three';
import { Player } from './Player.js';
import { World } from './World.js';
import { InputManager } from './InputManager.js';
import { GameConfig } from './GameConfig.js';

export class Game {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.world = null;
    this.inputManager = null;

    this.isRunning = false;
    this.clock = new THREE.Clock();
    this.frameId = null;

    // Lighting components for PBR
    this.environmentMap = null;
    this.lights = [];
  }

  async init() {
    try {
      console.log('🎮 Initializing enhanced game with PBR rendering...');

      // Initialize Three.js components
      this.initScene();
      this.initRenderer();
      this.initLighting();
      this.initEnvironment();

      // Verify basic setup
      if (!this.scene || !this.camera || !this.renderer) {
        throw new Error('Failed to initialize Three.js components');
      }

      // Initialize game systems
      console.log('👤 Creating player...');
      this.player = new Player(this.camera);

      console.log('🌍 Creating enhanced world...');
      this.world = new World(this.scene);

      console.log('🎮 Creating input manager...');
      this.inputManager = new InputManager();

      // Generate world with textures
      console.log('🏗️ Generating world with realistic textures...');
      await this.world.generate();

      // Set up input handlers
      console.log('⌨️ Setting up input handlers...');
      this.setupInputHandlers();

      // Verify player position
      console.log('📍 Player position:', this.player.getPosition());

      console.log('✅ Enhanced game initialized successfully');
    } catch (error) {
      console.error('❌ Game initialization failed:', error);
      throw error;
    }
  }

  initScene() {
    this.scene = new THREE.Scene();

    // Enhanced sky color for better PBR rendering
    const skyColor = new THREE.Color(GameConfig.GRAPHICS.SKY_COLOR);
    this.scene.background = skyColor;

    // Enhanced fog for atmospheric perspective
    this.scene.fog = new THREE.Fog(
      skyColor,
      GameConfig.GRAPHICS.FOG_NEAR,
      GameConfig.GRAPHICS.FOG_FAR
    );

    // Camera with enhanced settings
    this.camera = new THREE.PerspectiveCamera(
      GameConfig.CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      GameConfig.CAMERA.NEAR,
      GameConfig.CAMERA.FAR
    );

    // Set camera position
    this.camera.position.set(0, GameConfig.PLAYER.HEIGHT, 0);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: GameConfig.GRAPHICS.ANTIALIAS,
      powerPreference: 'high-performance',
      alpha: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GameConfig.PERFORMANCE.MAX_PIXEL_RATIO));

    // Enhanced rendering settings for PBR
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Enhanced shadow settings
    if (GameConfig.GRAPHICS.SHADOWS_ENABLED) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Add to DOM
    const container = document.getElementById('gameContainer');
    if (container) {
      container.appendChild(this.renderer.domElement);
    } else {
      console.error('Game container not found!');
    }
  }

  initLighting() {
    console.log('💡 Setting up enhanced PBR lighting...');

    // Ambient light - reduced for more dramatic lighting
    const ambientLight = new THREE.AmbientLight(
      GameConfig.LIGHTING.AMBIENT_COLOR,
      GameConfig.LIGHTING.AMBIENT_INTENSITY * 0.8
    );
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);

    // Main directional light (sun)
    const sunLight = new THREE.DirectionalLight(
      GameConfig.LIGHTING.SUN_COLOR,
      GameConfig.LIGHTING.SUN_INTENSITY
    );

    // Position sun for dramatic shadows
    sunLight.position.set(100, 150, 50);
    sunLight.castShadow = GameConfig.GRAPHICS.SHADOWS_ENABLED;

    if (GameConfig.GRAPHICS.SHADOWS_ENABLED) {
      // Enhanced shadow camera settings
      const shadowCamera = sunLight.shadow.camera;
      shadowCamera.near = 0.1;
      shadowCamera.far = 500;
      shadowCamera.left = shadowCamera.bottom = -150;
      shadowCamera.right = shadowCamera.top = 150;

      // High quality shadow map
      sunLight.shadow.mapSize.width = GameConfig.PERFORMANCE.SHADOW_MAP_SIZE;
      sunLight.shadow.mapSize.height = GameConfig.PERFORMANCE.SHADOW_MAP_SIZE;
      sunLight.shadow.bias = -0.0001;
      sunLight.shadow.normalBias = 0.02;
    }

    this.scene.add(sunLight);
    this.lights.push(sunLight);

    // Add secondary fill light for better illumination
    const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.3);
    fillLight.position.set(-50, 80, -100);
    this.scene.add(fillLight);
    this.lights.push(fillLight);

    // Add hemisphere light for sky lighting
    const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x4a7c59, 0.4);
    this.scene.add(hemiLight);
    this.lights.push(hemiLight);
  }

  initEnvironment() {
    console.log('🌍 Setting up environment mapping...');

    // Create simple environment cube map for reflections
    this.createEnvironmentMap();
  }

  createEnvironmentMap() {
    // Create a simple gradient cube map for basic reflections
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);

    // Simple sky gradient
    const skyGeometry = new THREE.SphereGeometry(500);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x87CEEB) },
        bottomColor: { value: new THREE.Color(0x4a7c59) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
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
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `
    });

    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);

    // Temporarily add sky for environment capture
    this.scene.add(skyMesh);
    cubeCamera.position.set(0, 0, 0);
    cubeCamera.update(this.renderer, this.scene);
    this.scene.remove(skyMesh);

    // Set as scene environment
    this.scene.environment = cubeRenderTarget.texture;
    this.environmentMap = cubeRenderTarget.texture;

    // Clean up
    skyGeometry.dispose();
    skyMaterial.dispose();
  }

  setupInputHandlers() {
    // Mouse movement
    this.inputManager.onMouseMove((deltaX, deltaY) => {
      if (this.isRunning) {
        this.player.handleMouseMove(deltaX, deltaY);
      }
    });

    // Mouse click (shooting)
    this.inputManager.onMouseClick(() => {
      if (this.isRunning) {
        this.player.shoot(this.scene);
      }
    });

    // Pointer lock events
    this.inputManager.onPointerLockChange((isLocked) => {
      if (!isLocked && this.isRunning) {
        this.pause();
      }
    });
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.inputManager.requestPointerLock(this.renderer.domElement);
    this.gameLoop();

    console.log('🎮 Enhanced game started');
  }

  pause() {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    // Show pause screen
    const startScreen = document.getElementById('startScreen');
    if (startScreen) {
      startScreen.style.display = 'flex';
      startScreen.innerHTML = `
        <h1 class="text-6xl font-black mb-4 text-transparent bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text">
          GAME PAUSED
        </h1>
        <p class="text-xl mb-8 text-gray-300">Mouse pointer lock was lost</p>
        <button id="resumeButton" class="px-8 py-4 bg-game-primary hover:bg-green-400 text-black font-bold text-xl rounded-lg transition-all duration-200 transform hover:scale-105">
          RESUME GAME
        </button>
      `;

      const resumeButton = document.getElementById('resumeButton');
      if (resumeButton) {
        resumeButton.addEventListener('click', () => {
          this.resume();
        });
      }
    }
  }

  resume() {
    const startScreen = document.getElementById('startScreen');
    if (startScreen) {
      startScreen.style.display = 'none';
    }

    this.inputManager.requestPointerLock(this.renderer.domElement);
    this.start();
  }

  gameLoop() {
    if (!this.isRunning) return;

    const deltaTime = this.clock.getDelta();

    // Update game systems
    if (this.player && this.world && this.inputManager) {
      this.player.update(deltaTime, this.inputManager.getKeys(), this.world);
      this.world.update(deltaTime);
    }

    // Update lighting based on time of day (future feature)
    this.updateLighting();

    // Render with enhanced settings
    this.renderer.render(this.scene, this.camera);

    // Schedule next frame
    this.frameId = requestAnimationFrame(() => this.gameLoop());
  }

  updateLighting() {
    // Future: Dynamic time of day lighting
    // For now, keep static lighting

    // Example of dynamic sun position:
    // const time = Date.now() * 0.0001;
    // this.lights[1].position.x = Math.cos(time) * 100;
    // this.lights[1].position.y = Math.sin(time) * 50 + 100;
  }

  handleResize() {
    if (!this.camera || !this.renderer) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    console.log('🔄 Game resized');
  }

  dispose() {
    console.log('🗑️ Disposing game resources...');

    this.isRunning = false;

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    // Dispose world first (includes texture manager)
    if (this.world) {
      this.world.dispose();
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();

      // Remove canvas from DOM
      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    }

    // Dispose input manager
    if (this.inputManager) {
      this.inputManager.dispose();
    }

    // Dispose environment map
    if (this.environmentMap) {
      this.environmentMap.dispose();
    }

    // Clear references
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.world = null;
    this.inputManager = null;
    this.lights = [];

    console.log('✅ Game disposed');
  }
}