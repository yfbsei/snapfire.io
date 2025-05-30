import * as THREE from 'three';
import { Player } from './Player.js';
import { ErangelWorld } from './ErangelWorld.js';
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
    this.isPaused = false;
    this.clock = new THREE.Clock();
    this.frameId = null;

    // PUBG-style lighting
    this.lights = [];
    this.environmentMap = null;
  }

  async init() {
    try {
      console.log('🏝️ Initializing PUBG Erangel Game...');

      this.initScene();
      this.initRenderer();
      this.initPUBGLighting();
      this.initEnvironment();

      if (!this.scene || !this.camera || !this.renderer) {
        throw new Error('Failed to initialize Three.js components');
      }

      console.log('👤 Creating player...');
      this.player = new Player(this.camera);

      console.log('🏝️ Creating static Erangel world...');
      this.world = new ErangelWorld(this.scene);

      console.log('🎮 Creating input manager...');
      this.inputManager = new InputManager();
      this.inputManager.setGameElement(this.renderer.domElement);

      console.log('🏗️ Generating static PUBG Erangel world...');
      await this.world.generate();

      this.setupInputHandlers();

      console.log('📍 Player spawned at position:', this.player.getPosition());
      console.log('✅ PUBG Erangel game initialized successfully');
    } catch (error) {
      console.error('❌ Game initialization failed:', error);
      throw error;
    }
  }

  initScene() {
    this.scene = new THREE.Scene();

    // PUBG-style sky color (more realistic, less saturated)
    const skyColor = new THREE.Color(0xB8D4F0); // Softer blue like PUBG
    this.scene.background = skyColor;

    // PUBG-style atmospheric fog
    this.scene.fog = new THREE.Fog(
      0xC8D8E8, // Slightly hazy color
      200,      // Start closer
      1200      // Extend further for atmosphere
    );

    this.camera = new THREE.PerspectiveCamera(
      GameConfig.CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      GameConfig.CAMERA.NEAR,
      GameConfig.CAMERA.FAR
    );

    this.camera.position.set(0, GameConfig.PLAYER.HEIGHT, 0);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // PUBG-style rendering settings
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0; // Realistic exposure

    // Enhanced shadows for PUBG realism
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // PUBG-style color grading
    this.renderer.gammaFactor = 2.2;

    this.renderer.domElement.style.outline = 'none';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.tabIndex = 1;

    const container = document.getElementById('gameContainer');
    if (container) {
      container.appendChild(this.renderer.domElement);
    } else {
      console.error('Game container not found!');
    }
  }

  initPUBGLighting() {
    console.log('☀️ Setting up PUBG-style realistic lighting...');

    // Ambient light - PUBG has soft ambient lighting
    const ambientLight = new THREE.AmbientLight(
      0x404857, // Cooler ambient color
      0.3       // Lower intensity for more dramatic shadows
    );
    this.scene.add(ambientLight);
    this.lights.push(ambientLight);

    // Main sun light - PUBG has strong directional lighting
    const sunLight = new THREE.DirectionalLight(
      0xFFF8DC, // Warm sunlight color
      1.5       // Strong intensity
    );

    // Position sun for PUBG-style lighting (afternoon sun)
    sunLight.position.set(400, 300, 200);
    sunLight.target.position.set(0, 0, 0);
    sunLight.castShadow = true;

    // PUBG-style shadow settings
    const shadowCamera = sunLight.shadow.camera;
    shadowCamera.near = 1;
    shadowCamera.far = 1500;
    shadowCamera.left = shadowCamera.bottom = -600;
    shadowCamera.right = shadowCamera.top = 600;

    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.02;

    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.lights.push(sunLight);

    // Hemisphere light for natural sky lighting (like PUBG)
    const hemiLight = new THREE.HemisphereLight(
      0xB8D4F0, // Sky color
      0x8B9A77, // Ground color (more muted)
      0.4       // Moderate intensity
    );
    this.scene.add(hemiLight);
    this.lights.push(hemiLight);

    // Soft fill light to prevent completely black shadows
    const fillLight = new THREE.DirectionalLight(
      0x87CEEB, // Cool fill light
      0.15      // Very subtle
    );
    fillLight.position.set(-200, 150, -300);
    this.scene.add(fillLight);
    this.lights.push(fillLight);
  }

  initEnvironment() {
    console.log('🌍 Setting up PUBG environment...');
    this.createPUBGEnvironmentMap();
  }

  createPUBGEnvironmentMap() {
    // Create realistic sky environment for PUBG-style reflections
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512);
    const cubeCamera = new THREE.CubeCamera(0.1, 2000, cubeRenderTarget);

    // PUBG-style sky gradient
    const skyGeometry = new THREE.SphereGeometry(1000);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x87CEEB) },    // Sky blue
        middleColor: { value: new THREE.Color(0xB8D4F0) }, // Horizon
        bottomColor: { value: new THREE.Color(0xE6F2FF) }, // Near ground
        offset: { value: 100 },
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
        uniform vec3 middleColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          vec3 color;
          if (h > 0.5) {
            color = mix(middleColor, topColor, (h - 0.5) * 2.0);
          } else {
            color = mix(bottomColor, middleColor, h * 2.0);
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(skyMesh);
    cubeCamera.position.set(0, 100, 0);
    cubeCamera.update(this.renderer, this.scene);
    this.scene.remove(skyMesh);

    this.scene.environment = cubeRenderTarget.texture;
    this.environmentMap = cubeRenderTarget.texture;

    skyGeometry.dispose();
    skyMaterial.dispose();
  }

  setupInputHandlers() {
    this.inputManager.onMouseMove((deltaX, deltaY) => {
      if (this.isRunning && !this.isPaused) {
        this.player.handleMouseMove(deltaX, deltaY);
      }
    });

    this.inputManager.onMouseClick(() => {
      if (this.isRunning && !this.isPaused) {
        this.player.shoot(this.scene);
      }
    });

    this.inputManager.onPointerLockChange((isLocked) => {
      if (isLocked) {
        if (!this.isRunning) {
          this.start();
        } else if (this.isPaused) {
          this.resume();
        }
      } else {
        if (this.isRunning && !this.isPaused) {
          this.pause();
        }
      }
    });
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.gameLoop();

    console.log('🏝️ PUBG Erangel started - Static world loaded!');
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    console.log('⏸️ Game paused');
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    console.log('▶️ Game resumed');
  }

  gameLoop() {
    if (!this.isRunning) return;

    const deltaTime = this.clock.getDelta();

    if (!this.isPaused) {
      if (this.player && this.world && this.inputManager) {
        this.player.update(deltaTime, this.inputManager.getKeys(), this.world);
        this.world.update(deltaTime);
      }

      // Update lighting for time of day (optional)
      this.updatePUBGLighting();
    }

    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(() => this.gameLoop());
  }

  updatePUBGLighting() {
    // Keep static lighting for now - PUBG has consistent lighting
    // Future: Could add time-of-day changes here
  }

  handleResize() {
    if (!this.camera || !this.renderer) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    console.log('🔄 PUBG game resized');
  }

  isGameRunning() {
    return this.isRunning;
  }

  isGamePaused() {
    return this.isPaused;
  }

  getRenderer() {
    return this.renderer;
  }

  dispose() {
    console.log('🗑️ Disposing PUBG game resources...');

    this.isRunning = false;
    this.isPaused = false;

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    if (this.world) {
      this.world.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();

      const canvas = this.renderer.domElement;
      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    }

    if (this.inputManager) {
      this.inputManager.dispose();
    }

    if (this.environmentMap) {
      this.environmentMap.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.world = null;
    this.inputManager = null;
    this.lights = [];

    console.log('✅ PUBG game disposed');
  }
}