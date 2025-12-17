# Physics System Documentation

The engine provides a unified physics API that supports multiple backends. The default backend is **Rapier** (WASM-based) for high performance, falling back to a simple internal solver if needed.

## Physics World

The `PhysicsWorld` class manages the simulation and all physical bodies.

**Initialization:**
```javascript
// Usually handled by GameEngine automatically
await engine.physics.init(); 
```

**Global Methods:**
- `setGravity(x, y, z)`: Configure global gravity.
- `raycast(origin, dir, maxDist)`: Cast a ray into the scene.

### Raycasting
Essential for shooting mechanics and interaction.

```javascript
const hit = engine.physics.raycast(cameraPos, forwardDir, 100);

if (hit) {
    console.log('Hit point:', hit.point);
    console.log('Hit normal:', hit.normal);
    console.log('Hit body:', hit.body); // The RigidBody instance
}
```

## Rigid Bodies

A `RigidBody` represents a physical object in the simulation.

**Creation:**
```javascript
const body = engine.physics.createRigidBody({
    object: myMesh,             // Link to visual mesh
    type: 'dynamic',            // 'dynamic', 'static', 'kinematic'
    shape: 'box',               // 'box', 'sphere', 'capsule', 'mesh'
    mass: 1.0,
    friction: 0.5,
    restitution: 0.1            // Bounciness
});
```

**Manipulation:**
```javascript
// Apply exact force
body.applyForce({ x: 0, y: 10, z: 0 });

// Apply sudden impulse (jumping/explosions)
body.applyImpulse({ x: 0, y: 5, z: 0 });

// Direct velocity control
body.velocity = { x: 5, y: 0, z: 0 };
```

**Synchronization:**
The engine automatically synchronizes the `RigidBody` position/rotation with its attached `THREE.Mesh` (and the `GameObject`'s Transform) every frame.

---

## GPU Compute Physics

Advanced physics simulations using WebGPU compute shaders. Requires WebGPU-capable browser (Chrome 113+, Edge 113+).

### GPU Particle System

High-performance particles (100k+) with GPU physics:

```javascript
import { GPUParticleSystem, ParticleEmitter } from './index.js';

const particles = new GPUParticleSystem({ maxParticles: 100000 });
await particles.init(engine.renderer);

particles.addEmitter({
    position: new THREE.Vector3(0, 5, 0),
    direction: new THREE.Vector3(0, 1, 0),
    spread: 0.5,           // Cone angle
    rate: 5000,            // Particles/sec
    lifetime: [1, 3],      // Min/max seconds
    velocity: [5, 10],     // Min/max speed
    gravity: new THREE.Vector3(0, -9.8, 0)
});

engine.scene.add(particles.mesh);

// In game loop
particles.update(deltaTime);
```

### Cloth Simulation

GPU Verlet-based cloth with constraints and collisions:

```javascript
import { ClothSimulation } from './index.js';

const cloth = new ClothSimulation({
    width: 30,              // Grid cells X
    height: 30,             // Grid cells Y
    restDistance: 0.25,
    stiffness: 0.95,
    iterations: 5
});
await cloth.init(engine.renderer);

// Pin top corners
cloth.pinVertex(0);
cloth.pinVertex(29);

// Add wind
cloth.setWind(new THREE.Vector3(1, 0, 0.5), 3.0);

// Add sphere collider
cloth.addSphereCollider(new THREE.Vector3(0, -2, 0), 1.5);

engine.scene.add(cloth.mesh);

// In game loop
cloth.update(deltaTime);
```

### Soft Body Simulation

Deformable objects using Position-Based Dynamics:

```javascript
import { SoftBodySimulation } from './index.js';

const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshStandardMaterial({ color: 0xff6600 })
);

const softBody = new SoftBodySimulation({
    stiffness: 0.7,
    pressure: 1.5,      // Volume preservation
    iterations: 4
});
await softBody.init(engine.renderer, sphere);

engine.scene.add(softBody.mesh);

// Apply impact
softBody.applyImpulse(hitPoint, direction, 20, 0.5);

// In game loop
softBody.update(deltaTime);
```

> **Note**: On WebGL-only browsers, particles fall back to CPU (10k limit), cloth uses CPU Verlet, and soft bodies are disabled.

---

## Vehicle System

AAA-quality raycast vehicle physics with engine, transmission, and drivetrain simulation.

### Basic Setup
```javascript
import { VehicleSystem } from './index.js';

const vehicleSystem = new VehicleSystem(engine.physics);

// Create vehicle from chassis body
const car = vehicleSystem.createVehicle(chassisBody, {
    enginePower: 300,      // HP
    drivetrain: 'RWD',     // 'FWD', 'RWD', 'AWD'
    maxSteerAngle: 0.6,    // Radians
    suspensionStiffness: 30.0,
    tireGrip: 2.5
});

// Add 4 wheels (position, isFront, isPowered, visualMesh)
car.addWheel(new THREE.Vector3(-0.8, 0, 1.2), true, false, wheelMesh);  // FL
car.addWheel(new THREE.Vector3(0.8, 0, 1.2), true, false, wheelMesh);   // FR
car.addWheel(new THREE.Vector3(-0.8, 0, -1.2), false, true, wheelMesh); // RL
car.addWheel(new THREE.Vector3(0.8, 0, -1.2), false, true, wheelMesh);  // RR
```

### Controls
```javascript
// In game loop
car.setInput(throttle, steering, brake, handbrake);
// throttle: -1 to 1 (negative for reverse)
// steering: -1 to 1 (left to right)
// brake: 0 to 1
// handbrake: 0 to 1

vehicleSystem.update(deltaTime);
```

### Vehicle Stats
```javascript
const stats = car.getStats();
console.log(stats.rpm);           // Engine RPM
console.log(stats.gear);          // Current gear (1-6)
console.log(stats.speed);         // km/h
console.log(stats.wheelsOnGround);
```

---

## Destruction System

Voronoi-based mesh fracturing with debris physics.

### Basic Setup
```javascript
import { DestructionSystem } from './index.js';

const destruction = new DestructionSystem(engine.physics, engine.scene);

// Register destructible object
destruction.register(wall, wallBody, {
    health: 100,
    impulseThreshold: 15,
    fractureCount: 12,        // Number of shards
    onDestruction: () => console.log('Wall destroyed!')
});
```

### Manual Destruction
```javascript
// Destroy with optional explosion
destruction.destroy(wall, explosionCenter, 500);
```

### Collision-Based Destruction
```javascript
// Hook into physics collision events
engine.physics.onCollision((event) => {
    destruction.onCollision(event);
});
```

