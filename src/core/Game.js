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
  }

  async init() {
    try {
      console.log('🎮 Initializing game...');

      // Initialize Three.js components
      this.initScene();
      this.initRenderer();
      this.initLighting();

      // Verify basic setup
      if (!this.scene || !this.camera || !this.renderer) {
        throw new Error('Failed to initialize Three.js components');
      }

      // Initialize game systems
      console.log('👤 Creating player...');
      this.player = new Player(this.camera);

      console.log('🌍 Creating world...');
      this.world = new World(this.scene);

      console.log('🎮 Creating input manager...');
      this.inputManager = new InputManager();

      // Generate world
      console.log('🏗️ Generating world...');
      await this.world.generate();

      // Set up input handlers
      console.log('⌨️ Setting up input handlers...');
      this.setupInputHandlers();

      // Verify player position
      console.log('📍 Player position:', this.player.getPosition());

      console.log('✅ Game initialized successfully');
    } catch (error) {
      console.error('❌ Game initialization failed:', error);
      throw error;
    }
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(GameConfig.GRAPHICS.SKY_COLOR);
    this.scene.fog = new THREE.Fog(
      GameConfig.GRAPHICS.SKY_COLOR,
      GameConfig.GRAPHICS.FOG_NEAR,
      GameConfig.GRAPHICS.FOG_FAR
    );

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      GameConfig.CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      GameConfig.CAMERA.NEAR,
      GameConfig.CAMERA.FAR
    );
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: GameConfig.GRAPHICS.ANTIALIAS,
      powerPreference: 'high-performance'
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Enable shadows
    this.renderer.shadowMap.enabled = GameConfig.GRAPHICS.SHADOWS_ENABLED;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Add to DOM
    const container = document.getElementById('gameContainer');
    container.appendChild(this.renderer.domElement);
  }

  initLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(
      GameConfig.LIGHTING.AMBIENT_COLOR,
      GameConfig.LIGHTING.AMBIENT_INTENSITY
    );
    this.scene.add(ambientLight);

    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(
      GameConfig.LIGHTING.SUN_COLOR,
      GameConfig.LIGHTING.SUN_INTENSITY
    );

    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;

    // Shadow camera settings
    const shadowCam = directionalLight.shadow.camera;
    shadowCam.near = 0.5;
    shadowCam.far = 500;
    shadowCam.left = shadowCam.bottom = -100;
    shadowCam.right = shadowCam.top = 100;

    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;

    this.scene.add(directionalLight);
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

    console.log('🎮 Game started');
  }

  pause() {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    // Show pause screen
    document.getElementById('startScreen').style.display = 'flex';
    document.getElementById('startScreen').innerHTML = `
      <h1 class="text-6xl font-black mb-4 text-transparent bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text">
        GAME PAUSED
      </h1>
      <p class="text-xl mb-8 text-gray-300">Mouse pointer lock was lost</p>
      <button id="resumeButton" class="px-8 py-4 bg-game-primary hover:bg-green-400 text-black font-bold text-xl rounded-lg transition-all duration-200 transform hover:scale-105">
        RESUME GAME
      </button>
    `;

    document.getElementById('resumeButton').addEventListener('click', () => {
      this.resume();
    });
  }

  resume() {
    document.getElementById('startScreen').style.display = 'none';
    this.inputManager.requestPointerLock(this.renderer.domElement);
    this.start();
  }

  gameLoop() {
    if (!this.isRunning) return;

    const deltaTime = this.clock.getDelta();

    // Update game systems
    this.player.update(deltaTime, this.inputManager.getKeys(), this.world);
    this.world.update(deltaTime);

    // Render
    this.renderer.render(this.scene, this.camera);

    // Schedule next frame
    this.frameId = requestAnimationFrame(() => this.gameLoop());
  }

  handleResize() {
    if (!this.camera || !this.renderer) return;

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.isRunning = false;

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }

    if (this.world) {
      this.world.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }

    if (this.inputManager) {
      this.inputManager.dispose();
    }
  }
}