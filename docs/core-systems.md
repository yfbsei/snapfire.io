# Core Systems Documentation

This document covers the fundamental architecture of the OpenWorld Game Engine, including GameEngine, GameObject, Scripts, Scene Management, and Input handling.

## GameEngine

The `GameEngine` class is the main entry point and orchestrates all engine subsystems.

### Initialization
```javascript
import { GameEngine } from './index.js';

const engine = new GameEngine({
    preferWebGPU: true,    // Try WebGPU first (Chrome 113+)
    antialias: true,
    shadows: true,
    toneMapping: true
});

// Async init for WebGPU support
await engine.init(document.getElementById('game-container'));
```

### Key Properties
| Property | Type | Description |
|----------|------|-------------|
| `renderer` | THREE.WebGLRenderer | The underlying Three.js renderer |
| `scene` | THREE.Scene | Main scene |
| `camera` | THREE.Camera | Active camera |
| `input` | InputManager | Input handling |
| `physics` | PhysicsWorld | Physics simulation |
| `audio` | AudioManager | Audio system |
| `postProcessing` | PostProcessing | Post-processing stack |

### Key Methods
```javascript
// Create game objects
const obj = engine.createGameObject('Player');
const cube = engine.createPrimitive('box', { size: 2, color: 0xff0000 });

// Add to scene
engine.addGameObject(obj);
engine.addGameObject(cube, parentObj); // With parent

// Find objects
const player = engine.findGameObject('Player');
const enemies = engine.findGameObjectsWithTag('enemy');

// Camera setup
engine.setupFPSCamera({ sensitivity: 0.002 });
engine.setupTPSCamera(target, { distance: 5, height: 2 });
engine.setupOrbitCamera({ minDistance: 2, maxDistance: 50 });

// Game loop control
engine.start();
engine.pause();
engine.resume();
engine.stop();

// Raycasting from screen
const hit = engine.raycastFromScreen(); // From center
const hit2 = engine.raycastFromScreen({ x: 0.5, y: 0.5 }); // NDC coords

// Pointer lock for FPS
engine.requestPointerLock();

// Feature detection
if (engine.hasFeature('computeShaders')) { /* WebGPU available */ }
if (engine.isWebGPU()) { /* Using WebGPU renderer */ }
```

---

## GameObject

The `GameObject` class is the primary entity type. It wraps a THREE.Object3D and provides a Transform, Component system, and Script support.

### Creation
```javascript
import { GameObject } from './index.js';

// Via engine (recommended)
const player = engine.createGameObject('Player');

// Direct instantiation
const obj = new GameObject('MyObject');
engine.addGameObject(obj);
```

### Transform
```javascript
// Position
obj.transform.setPosition(10, 5, 0);
obj.transform.position.x += 1; // THREE.Vector3

// Rotation (in degrees)
obj.transform.setRotation(0, 90, 0);
obj.transform.rotate(0, 45, 0);

// Scale
obj.transform.setScale(2);       // Uniform
obj.transform.setScale(1, 2, 1); // Per-axis

// Movement
obj.transform.translateZ(-5);   // Move forward
obj.transform.translateX(2);    // Move right

// Direction vectors
const forward = obj.transform.getForward();
const right = obj.transform.getRight();
const up = obj.transform.getUp();
const worldPos = obj.transform.getWorldPosition();

// Look at
obj.transform.lookAt(targetPosition);
```

### Hierarchy
```javascript
// Parent/child
const arm = engine.createGameObject('Arm');
player.add(arm);              // arm is now a child
player.remove(arm);

// Access
const parent = arm.parent;
const children = player.children;
```

### Active State
```javascript
obj.active = false;   // Disables updates and rendering
if (obj.active) { }
```

---

## Component System

The engine uses a composition-based architecture where logic is attached to GameObjects via components.

### Component Base Class
```javascript
import { Component } from './index.js';

class HealthComponent {
    constructor(gameObject, options = {}) {
        this.gameObject = gameObject;
        this.maxHealth = options.maxHealth ?? 100;
        this.health = this.maxHealth;
    }
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) this.die();
    }
    
    update(deltaTime) {
        // Called every frame
    }
    
    dispose() {
        // Cleanup
    }
}

// Usage
const health = player.addComponent(HealthComponent, { maxHealth: 150 });
health.takeDamage(25);

const h = player.getComponent(HealthComponent);
player.removeComponent(HealthComponent);
```

---

## Script System

Scripts provide a Unity-like scripting API for custom behaviors.

### Script Lifecycle
```javascript
import { Script } from './index.js';

class PlayerController extends Script {
    // Called once when script starts
    start() {
        this.speed = 5;
        this.jumpForce = 8;
        console.log('PlayerController started on', this.gameObject.name);
    }
    
    // Called every frame
    update(deltaTime) {
        this.handleMovement(deltaTime);
    }
    
    // Called at fixed interval (physics)
    fixedUpdate(fixedDelta) {
        // Physics-related movement
    }
    
    // Called after all updates
    lateUpdate(deltaTime) {
        // Camera follow, etc.
    }
    
    // Called when script is destroyed
    onDestroy() {
        console.log('Cleaning up...');
    }
    
    handleMovement(dt) {
        const move = this.input.getMovementInput();
        // move.x = strafe, move.z = forward/back
        
        if (this.input.isActionPressed('jump')) {
            // Jump logic
        }
    }
}

// Attach to GameObject
player.addScript(PlayerController, engine);

// Access
const ctrl = player.getScript(PlayerController);
player.removeScript(PlayerController);
```

### Script Properties
Inside a Script, you have access to:
- `this.gameObject` - The owning GameObject
- `this.transform` - Shortcut to gameObject.transform
- `this.engine` - Reference to GameEngine
- `this.input` - InputManager
- `this.time` - Delta time utilities

---

## Scene Manager

The `SceneManager` handles the lifecycle of the THREE.Scene and all entities.

### Object Management
```javascript
// Add objects (raw THREE or GameObject)
engine.sceneManager.addObject(gameObject);
engine.sceneManager.addObject(threeJsMesh);

// Remove and dispose
engine.sceneManager.removeObject(object);

// Clear everything
engine.sceneManager.clearScene();
```

### Primitive Creation
```javascript
// Create primitives via SceneManager
const primitives = ['box', 'sphere', 'cylinder', 'plane', 'capsule', 'cone', 'torus'];

for (const type of primitives) {
    const obj = engine.createPrimitive(type, {
        name: type,
        size: 1,
        color: 0x00ff00,
        position: { x: 0, y: 1, z: 0 }
    });
}
```

---

## Input Manager

The `InputManager` provides a unified interface for Keyboard, Mouse, and Gamepad input with Action Mapping support.

### Basic Input
```javascript
// Keyboard
if (engine.input.isKeyDown('Space')) { /* Held */ }
if (engine.input.isKeyPressed('Space')) { /* Just pressed */ }
if (engine.input.isKeyReleased('Space')) { /* Just released */ }

// Mouse
if (engine.input.isMouseButtonDown(0)) { /* Left button held */ }
const delta = engine.input.getMouseDelta(); // { x, y }

// Pointer lock
engine.input.requestPointerLock();
```

### Action Mapping (Recommended)
```javascript
// Check mapped actions (abstracts physical keys)
if (engine.input.isActionDown('jump')) { }
if (engine.input.isActionPressed('fire')) { }

// Get analog input (WASD/Left Stick)
const move = engine.input.getMovementInput(); // { x, z } normalized
```

### Default Action Bindings
| Action | Default Keys | Description |
|--------|--------------|-------------|
| `moveForward` | W, ArrowUp | Forward movement |
| `moveBackward` | S, ArrowDown | Backward movement |
| `moveLeft` | A, ArrowLeft | Strafe left |
| `moveRight` | D, ArrowRight | Strafe right |
| `jump` | Space | Jump |
| `sprint` | Shift | Sprint modifier |
| `crouch` | C, Ctrl | Crouch |
| `interact` | E, F | Interact with objects |
| `fire` | Mouse Left | Primary fire |
| `aim` | Mouse Right | Aim down sights |
| `reload` | R | Reload weapon |

### Custom Bindings
```javascript
engine.input.setActionBinding('dodge', ['Q', 'Gamepad4']); // Custom action
```

---

## Serialization

The engine supports saving and loading scenes via the `Serializer`.

```javascript
// Save scene to JSON
const saveData = engine.serializer.save();
localStorage.setItem('savedGame', JSON.stringify(saveData));

// Load scene from JSON
const loadData = JSON.parse(localStorage.getItem('savedGame'));
engine.serializer.load(loadData);
```
