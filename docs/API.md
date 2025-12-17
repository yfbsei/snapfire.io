# OpenWorld Game Engine - API Documentation

A Three.js wrapper for creating open-world FPS/TPS games with **WebGPU support** and AAA-quality rendering.

> **v0.4.0 Features**: Path Tracing (via `three-gpu-pathtracer`), Animation Timeline Editor, Terrain Editor with brush tools, Scene Settings Panel, Build Wizard, plus all v0.3.0 features (SSGI, Contact Shadows, Material Library, GPU Physics, VFX Graph, Advanced Audio, Animation Layers + IK).

## Table of Contents

### Getting Started
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Basic Concepts](#basic-concepts)

### Core Documentation
- [**Core Systems**](./core-systems.md) - GameEngine, GameObject, Scripts, Scene Management
- [**Rendering**](./rendering.md) - Post-processing, Materials, Lighting, Shadows
- [**Animation**](./animation.md) - Animation Controller, IK, Procedural Animation
- [**Physics**](./physics.md) - Rigid Bodies, Raycasting, GPU Compute Physics
- [**World Systems**](./world-systems.md) - Chunks, Terrain, Vegetation, Sky, Water, Weather
- [**Audio**](./audio.md) - 3D Audio, Occlusion, Mixing, Reverb Zones
- [**VFX**](./vfx.md) - VFX Graph, Particles, Trails, Mesh Particles
- [**Optimization**](./optimization.md) - LOD, Instancing, Culling, Object Pooling
- [**Editor**](./editor.md) - Built-in Editor, Panels, Export

---

## Quick Start

```javascript
import { GameEngine, Script, GameObject } from './index.js';

// Create and initialize engine (async for WebGPU)
const engine = new GameEngine({ preferWebGPU: true });
await engine.init(document.getElementById('game'));

// Create a player
const player = engine.createPrimitive('capsule', { name: 'Player' });
player.transform.setPosition(0, 1, 0);

// Setup FPS camera
engine.setupFPSCamera({ target: player.object3D });

// Add player controller script
class PlayerController extends Script {
  start() {
    this.speed = 5;
  }
  
  update(delta) {
    const move = this.input.getMovementInput();
    if (move.x !== 0 || move.z !== 0) {
      const dir = engine.cameraController.getMoveDirection(move);
      this.transform.position.addScaledVector(dir, this.speed * delta);
    }
    
    if (this.input.isActionPressed('jump')) {
      console.log('Jump!');
    }
  }
}

player.addScript(PlayerController, engine);

// Start game
engine.requestPointerLock();
engine.start();
```

---

## Installation

```bash
npm install
npm run dev
```

### Requirements
- Modern browser with WebGL2 support
- **Recommended**: Chrome/Edge 113+ for WebGPU features

---

## Basic Concepts

### GameEngine
The main entry point. Manages the game loop, rendering, physics, and all subsystems.

```javascript
const engine = new GameEngine({
    preferWebGPU: true,    // Try WebGPU first, fallback to WebGL
    antialias: true,
    shadows: true
});
await engine.init(container);
```

### GameObject
The fundamental entity in the engine. Contains a Transform and supports Components and Scripts.

```javascript
const obj = engine.createGameObject('MyObject');
obj.transform.setPosition(0, 5, 0);
obj.addScript(MyBehavior, engine);
```

### Scripts
Attach custom logic to GameObjects using the Script class.

```javascript
class MyBehavior extends Script {
    start() { /* Called once */ }
    update(deltaTime) { /* Called every frame */ }
    onDestroy() { /* Cleanup */ }
}
```

### Components
Modular functionality (Colliders, AudioSources, etc.) attached to GameObjects.

```javascript
const rb = obj.addComponent(RigidBody, { mass: 1 });
```

---

## Engine Capabilities

| Feature | WebGPU | WebGL2 |
|---------|--------|--------|
| TAA (Temporal AA) | ✅ Full | ✅ Full |
| SSR (Reflections) | ✅ Full | ✅ Full |
| SSGI (Global Illumination) | ✅ Full | ⚠️ Reduced |
| Volumetric Lighting | ✅ Full | ✅ Full |
| Motion Blur | ✅ Full | ✅ Full |
| Temporal Upscaling | ✅ Full | ✅ Full |
| GPU Particles (100k+) | ✅ Full | ⚠️ 10k limit |
| Cloth Simulation | ✅ GPU | ⚠️ CPU |
| Soft Body Physics | ✅ GPU | ❌ Disabled |
| Contact Shadows | ✅ Full | ✅ Full |
| Cascaded Shadows | ✅ Full | ✅ Full |
| Hair Rendering | ✅ Full | ✅ Full |

---

## Architecture Overview

```
GameEngine
├── Renderer (WebGPU/WebGL)
│   ├── PostProcessing
│   │   ├── SSRPass, TAAPass, VolumetricPass
│   │   ├── SSGIPass, ContactShadowsPass, MotionBlurPass
│   │   ├── TemporalUpscalePass
│   │   └── Bloom, GTAO, DOF
│   ├── MaterialLibrary
│   └── HairSystem
├── SceneManager
│   └── GameObjects[]
├── Physics
│   ├── RigidBodies, Raycasting
│   ├── VehicleSystem, DestructionSystem
│   └── GPU Compute (Particles, Cloth, SoftBody)
├── Input
├── Audio (3D, Occlusion, Mixer)
├── World
│   ├── ChunkManager, Terrain
│   ├── Vegetation, Sky
│   └── Water, Weather
└── Optimization
    ├── LODManager
    ├── FrustumCuller
    ├── InstancedRenderer
    └── SpatialIndex
```
