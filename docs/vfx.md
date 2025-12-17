# VFX System Documentation

The OpenWorld Engine provides a comprehensive VFX system including a node-based VFX Graph, GPU particles, trails, and mesh particles.

## VFX Graph

The `VFXGraph` is a node-based system for creating complex visual effects by connecting nodes.

### Basic Structure
```javascript
import { 
    VFXGraph, 
    SpawnNode, 
    InitializeNode, 
    PhysicsNode, 
    ColorNode, 
    SizeNode, 
    RenderNode 
} from './index.js';

const vfx = new VFXGraph();
```

### Creating an Effect
```javascript
// 1. Spawn Node - Controls emission
const spawn = new SpawnNode({
    rate: 100,           // Particles per second
    burst: false,        // or burst mode
    burstCount: 50,
    burstInterval: 0.5
});

// 2. Initialize Node - Set initial particle properties
const init = new InitializeNode({
    position: new THREE.Vector3(0, 0, 0),
    positionSpread: new THREE.Vector3(1, 0.5, 1),
    velocity: new THREE.Vector3(0, 5, 0),
    velocitySpread: new THREE.Vector3(2, 2, 2),
    lifetime: 2.0,
    lifetimeSpread: 0.5,
    size: 0.5,
    sizeSpread: 0.2,
    color: new THREE.Color(1, 0.5, 0)
});

// 3. Physics Node - Apply forces
const physics = new PhysicsNode({
    gravity: new THREE.Vector3(0, -9.8, 0),
    drag: 0.1,
    turbulence: 0.5,
    turbulenceFrequency: 2.0
});

// 4. Color Node - Animate color over lifetime
const color = new ColorNode({
    gradient: [
        { t: 0.0, color: new THREE.Color(1, 1, 0.5) },    // Yellow at birth
        { t: 0.5, color: new THREE.Color(1, 0.2, 0) },    // Orange at middle
        { t: 1.0, color: new THREE.Color(0.2, 0, 0) }     // Dark red at death
    ]
});

// 5. Size Node - Animate size over lifetime
const size = new SizeNode({
    curve: [[0, 1], [0.3, 1.5], [1, 0]]  // Grow then shrink
});

// 6. Render Node - Define rendering
const render = new RenderNode({
    renderType: 'billboard',  // 'point', 'billboard', 'mesh', 'trail'
    blending: 'additive',     // 'additive', 'normal', 'multiply'
    material: customMaterial   // Optional custom material
});

// Connect nodes
spawn.connect('particles', init, 'particles');
init.connect('particles', physics, 'particles');
physics.connect('particles', color, 'particles');
color.connect('particles', size, 'particles');
size.connect('particles', render, 'particles');

// Add to graph
vfx.addNode(spawn);
vfx.addNode(init);
vfx.addNode(physics);
vfx.addNode(color);
vfx.addNode(size);
vfx.addNode(render);

// Add to scene
engine.scene.add(vfx.getObject3D());
```

### Update
```javascript
// In game loop
vfx.update(deltaTime);
```

### Position Control
```javascript
vfx.setPosition(new THREE.Vector3(10, 5, 0));
vfx.getObject3D().position.copy(playerPosition);
```

---

## GPU Particle System

High-performance particle system using GPU compute (100k+ particles with WebGPU).

### Setup
```javascript
import { GPUParticleSystem, ParticleEmitter } from './index.js';

const particles = new GPUParticleSystem({
    maxParticles: 100000,
    textureSize: 512        // Particle data texture size
});

await particles.init(engine.renderer);
```

### Adding Emitters
```javascript
const emitter = particles.addEmitter({
    position: new THREE.Vector3(0, 5, 0),
    direction: new THREE.Vector3(0, 1, 0),
    spread: 0.5,             // Cone angle in radians
    rate: 5000,              // Particles per second
    lifetime: [1, 3],        // [min, max] seconds
    velocity: [5, 10],       // [min, max] speed
    size: [0.1, 0.3],        // [birth, death] size
    color: new THREE.Color(1, 0.5, 0),
    colorEnd: new THREE.Color(0.2, 0, 0),
    gravity: new THREE.Vector3(0, -9.8, 0),
    drag: 0.02
});
```

### Emitter Control
```javascript
// Pause/Resume emission
emitter.enabled = false;

// Update emitter position
emitter.position.copy(gunBarrelPosition);

// Burst mode
emitter.burst(50); // Emit 50 particles immediately

// Remove emitter
particles.removeEmitter(emitter);
```

### Rendering Options
```javascript
particles.setBlending('additive'); // 'additive', 'normal'
particles.setTexture(particleTexture);
particles.setSorting(true); // Enable depth sorting (expensive)
```

### Update & Scene
```javascript
engine.scene.add(particles.mesh);

// In game loop
particles.update(deltaTime);
```

---

## Trail Renderer

Create trailing effects behind moving objects.

### Basic Setup
```javascript
import { TrailRenderer } from './index.js';

const trail = new TrailRenderer({
    maxPoints: 100,       // Trail history length
    width: 0.5,           // Trail width
    color: new THREE.Color(0, 0.5, 1),
    fadeTime: 1.0,        // Fade out duration
    textureMode: 'stretch' // 'stretch', 'tile'
});

engine.scene.add(trail.mesh);
```

### Attach to Object
```javascript
// In game loop
trail.update(delta, rocketPosition);
```

### Width Curve
```javascript
trail.setWidthCurve([
    { t: 0, width: 1.0 },    // Full width at start
    { t: 1, width: 0.0 }     // Zero at end (taper)
]);
```

### Color Gradient
```javascript
trail.setColorCurve([
    { t: 0, color: new THREE.Color(1, 1, 1) },
    { t: 0.5, color: new THREE.Color(1, 0.5, 0) },
    { t: 1, color: new THREE.Color(0.2, 0, 0) }
]);
```

### Texture
```javascript
trail.setTexture(trailTexture);
trail.setTextureMode('tile');
trail.setTiling(10); // Repeat texture 10 times
```

### Control
```javascript
// Start/stop recording
trail.isRecording = true;

// Clear trail
trail.clear();

// Emit from position (fire-and-forget mode)
trail.emit(position);
```

---

## Mesh Particle System

Render 3D meshes as particles instead of billboards.

### Setup
```javascript
import { MeshParticleSystem } from './index.js';

const debris = new MeshParticleSystem({
    mesh: debrisGeometry,
    material: debrisMaterial,
    count: 500,
    instancedMesh: true  // Use GPU instancing
});

engine.scene.add(debris.mesh);
```

### Emission
```javascript
debris.emit({
    position: explosionCenter,
    positionSpread: new THREE.Vector3(2, 2, 2),
    velocity: new THREE.Vector3(0, 10, 0),
    velocitySpread: new THREE.Vector3(5, 5, 5),
    rotation: new THREE.Euler(0, 0, 0),
    rotationVelocity: new THREE.Vector3(5, 5, 5),
    scale: 1,
    scaleSpread: 0.3,
    lifetime: 3,
    count: 50
});
```

### Physics Integration
```javascript
debris.setGravity(new THREE.Vector3(0, -9.8, 0));
debris.setDrag(0.02);
debris.setCollision(true, (particle, hit) => {
    // On collision
    particle.velocity.reflect(hit.normal);
    particle.velocity.multiplyScalar(0.5); // Damping
});
```

### Update
```javascript
// In game loop
debris.update(deltaTime);
```

---

## Common VFX Recipes

### Fire Effect
```javascript
const fire = new VFXGraph();

fire.addNode(new SpawnNode({ rate: 200 }));
fire.addNode(new InitializeNode({
    positionSpread: new THREE.Vector3(0.5, 0, 0.5),
    velocity: new THREE.Vector3(0, 3, 0),
    velocitySpread: new THREE.Vector3(0.5, 1, 0.5),
    lifetime: 1.0,
    size: 0.4
}));
fire.addNode(new PhysicsNode({
    gravity: new THREE.Vector3(0, 2, 0), // Upward pull
    turbulence: 1.0
}));
fire.addNode(new ColorNode({
    gradient: [
        { t: 0, color: new THREE.Color(1, 1, 0.8) },
        { t: 0.3, color: new THREE.Color(1, 0.5, 0) },
        { t: 0.7, color: new THREE.Color(0.8, 0.2, 0) },
        { t: 1, color: new THREE.Color(0.1, 0, 0) }
    ]
}));
fire.addNode(new SizeNode({ curve: [[0, 0.5], [0.3, 1], [1, 0]] }));
fire.addNode(new RenderNode({ blending: 'additive' }));

// Connect nodes...
```

### Explosion
```javascript
const explosion = new GPUParticleSystem({ maxParticles: 10000 });
await explosion.init(renderer);

// Debris
explosion.addEmitter({
    position: explosionPos,
    direction: new THREE.Vector3(0, 1, 0),
    spread: Math.PI,  // Full sphere
    rate: 0,          // Burst only
    lifetime: [2, 4],
    velocity: [10, 30],
    gravity: new THREE.Vector3(0, -9.8, 0),
    color: new THREE.Color(0.5, 0.4, 0.3)
}).burst(200);

// Sparks
explosion.addEmitter({
    position: explosionPos,
    spread: Math.PI,
    lifetime: [0.5, 1.5],
    velocity: [20, 50],
    size: [0.02, 0.05],
    color: new THREE.Color(1, 0.8, 0.3)
}).burst(500);
```

### Smoke Trail
```javascript
const smoke = new TrailRenderer({
    maxPoints: 200,
    width: 2,
    fadeTime: 3.0
});

smoke.setColorCurve([
    { t: 0, color: new THREE.Color(0.9, 0.9, 0.9) },
    { t: 1, color: new THREE.Color(0.3, 0.3, 0.3) }
]);

smoke.setWidthCurve([
    { t: 0, width: 0.2 },
    { t: 0.5, width: 1.0 },
    { t: 1, width: 2.0 }
]);
```

### Blood Splatter
```javascript
const blood = new MeshParticleSystem({
    mesh: new THREE.SphereGeometry(0.05),
    material: new THREE.MeshBasicMaterial({ color: 0x8B0000 }),
    count: 200
});

blood.setGravity(new THREE.Vector3(0, -15, 0));
blood.setDrag(0.1);
blood.setCollision(true, (particle) => {
    // Create decal on hit
    decals.addDecal(particle.position, normal, bloodTexture);
    particle.alive = false;
});

blood.emit({
    position: hitPoint,
    velocity: hitNormal.multiplyScalar(5),
    velocitySpread: new THREE.Vector3(3, 3, 3),
    count: 50
});
```

---

## Performance Tips

### 1. Use GPU Particles for Large Counts
```javascript
// Good for 10k+ particles
const gpu = new GPUParticleSystem({ maxParticles: 100000 });
```

### 2. Disable Sorting When Possible
```javascript
particles.setSorting(false); // Much faster
```

### 3. Pool VFX Objects
```javascript
const explosionPool = new ObjectPool(
    () => createExplosionVFX(),
    (vfx) => vfx.reset(),
    10
);
```

### 4. Use Billboards Over Meshes
```javascript
// Billboards are much cheaper than mesh particles
new RenderNode({ renderType: 'billboard' });
```

### 5. Limit Trail Points
```javascript
new TrailRenderer({ maxPoints: 50 }); // Keep it reasonable
```
