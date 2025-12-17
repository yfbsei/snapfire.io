# Optimization Systems Documentation

To achieve high performance in large open worlds, the engine employs several optimization strategies including LOD, instancing, culling, and spatial indexing.

## Level of Detail (LOD)

The `LODManager` automatically switches between mesh resolutions based on camera distance.

### Basic Usage
```javascript
import { LODManager } from './core/optimization';

const lodManager = engine.optimization.lodManager;

// Register an object with 3 levels of detail
const lodGroup = lodManager.register(myObject, [
    meshHigh,   // LOD 0 - Highest detail
    meshMed,    // LOD 1 - Medium detail
    meshLow     // LOD 2 - Lowest detail
]);

// Customize distance thresholds
lodGroup.distances = [20, 50, 100]; // Switch at these distances
```

### Auto LOD Generation
```javascript
import { LODGenerator } from './core/assets/LODGenerator.js';

// Automatically generate LOD levels
const lodMeshes = await LODGenerator.generate(highPolyMesh, {
    levels: 3,
    ratios: [0.5, 0.25, 0.1], // Reduction ratios
    preserveTexCoords: true
});

lodManager.register(myObject, lodMeshes);
```

### Configuration
```javascript
lodManager.setConfig({
    updateInterval: 0.1,    // Seconds between LOD checks
    hysteresis: 0.9,        // Prevent LOD flickering
    enableFade: true        // Smooth LOD transitions
});
```

---

## Instanced Rendering

For rendering thousands of identical objects (trees, rocks, debris), use the `InstancedRenderer`. This reduces thousands of draw calls to a single one.

### Basic Usage
```javascript
const instancedRenderer = engine.optimization.instancedRenderer;

// Add instances
const matrix = new THREE.Matrix4();
matrix.compose(position, quaternion, scale);

const instanceId = instancedRenderer.addInstance(
    geometry,
    material,
    matrix
);

// Update transform later
instancedRenderer.updateInstanceMatrix(instanceId, newMatrix);

// Remove instance
instancedRenderer.removeInstance(instanceId);
```

### Batch Registration
```javascript
// Add many instances at once
const matrices = positions.map(pos => {
    const m = new THREE.Matrix4();
    m.setPosition(pos);
    return m;
});

const instanceIds = instancedRenderer.addInstances(geometry, material, matrices);
```

### Color Variation
```javascript
// Set per-instance colors
instancedRenderer.setInstanceColor(instanceId, new THREE.Color(0xff0000));
```

### Update
```javascript
// Call when transforms change
instancedRenderer.updateAll();
```

---

## Frustum Culling

The `FrustumCuller` checks if objects are inside the camera's view frustum. Objects outside are not rendered.

### Automatic Mode
The engine handles this automatically for registered entities. Objects outside the frustum are skipped during rendering.

### Manual Usage
```javascript
const culler = engine.optimization.frustumCuller;

// Check single object
if (culler.isVisible(object)) {
    // Object is in view
}

// Check sphere
if (culler.isSphereVisible(center, radius)) {
    // Sphere is in view
}

// Check box
if (culler.isBoxVisible(min, max)) {
    // Box is in view
}
```

### Bulk Culling
```javascript
// Filter array of objects
const visibleObjects = culler.filterVisible(allObjects);
```

### Configuration
```javascript
culler.setConfig({
    enabled: true,
    updatePerFrame: true,    // Auto-update frustum from camera
    margin: 0.1              // Frustum padding
});
```

---

## Spatial Index (Octree)

The `SpatialIndex` organizes objects into a 3D grid (Octree) for ultra-fast spatial queries.

### Setup
```javascript
import { SpatialIndex } from './core/optimization/SpatialIndex.js';

const spatial = new SpatialIndex({
    bounds: new THREE.Box3(
        new THREE.Vector3(-1000, -100, -1000),
        new THREE.Vector3(1000, 1000, 1000)
    ),
    maxDepth: 8,
    maxObjectsPerNode: 16
});
```

### Add Objects
```javascript
spatial.insert(gameObject);

// Bulk insert
spatial.insertAll(gameObjects);

// Update after movement
spatial.update(gameObject);

// Remove
spatial.remove(gameObject);
```

### Spatial Queries

#### Sphere Query
```javascript
// Find all objects within radius
const nearbyObjects = spatial.querySphere(
    center,    // THREE.Vector3
    radius     // number
);
```

#### Box Query
```javascript
const objectsInBox = spatial.queryBox(
    new THREE.Box3(min, max)
);
```

#### Frustum Query
```javascript
// Find all objects visible to camera
const visibleObjects = spatial.queryFrustum(camera);
```

#### Ray Query (Optimized Raycasting)
```javascript
const raycaster = new THREE.Raycaster(origin, direction);
const hits = spatial.queryRay(raycaster, {
    maxDistance: 100,
    firstHitOnly: true
});
```

### Nearest Neighbor
```javascript
// Find N nearest objects
const nearest = spatial.findNearest(position, count);
```

---

## Object Pooling

Micro-optimizations to prevent Garbage Collection spikes. Use `ObjectPool` for frequently created/destroyed objects.

### Basic Usage
```javascript
import { ObjectPool } from './core/optimization/ObjectPool.js';

// Create a pool for bullets
const bulletPool = new ObjectPool(
    () => new Bullet(),           // Factory function
    (bullet) => bullet.reset(),   // Reset function
    50                            // Initial size
);

// Get a bullet from pool
const bullet = bulletPool.acquire();

// Return to pool when done (instead of destroying)
bulletPool.release(bullet);
```

### With GameObjects
```javascript
const enemyPool = new ObjectPool(
    () => {
        const obj = engine.createPrimitive('capsule');
        obj.addScript(EnemyAI, engine);
        return obj;
    },
    (obj) => {
        obj.active = false;
        obj.transform.setPosition(0, -1000, 0); // Move off-screen
        obj.getScript(EnemyAI).reset();
    },
    20
);

// Spawn enemy
const enemy = enemyPool.acquire();
enemy.active = true;
enemy.transform.setPosition(spawnPoint);

// Despawn
enemyPool.release(enemy);
```

### Pool Statistics
```javascript
console.log(bulletPool.activeCount);    // Currently in use
console.log(bulletPool.availableCount); // Ready for reuse
console.log(bulletPool.totalCount);     // Total allocated
```

### Auto-Growth
```javascript
const pool = new ObjectPool(factory, reset, 10, {
    autoGrow: true,      // Grow when depleted
    growthFactor: 1.5,   // Multiply size by this
    maxSize: 1000        // Cap growth
});
```

---

## HLOD System (Hierarchical LOD)

For extremely large worlds, HLOD combines distant objects into simplified meshes.

### Setup
```javascript
import { HLODSystem } from './core/world/HLODSystem.js';

const hlod = new HLODSystem({
    maxDistance: 2000,
    cellSize: 200,
    simplificationRatio: 0.1
});

// Register object groups
hlod.registerCell(cellId, objectsInCell);
```

### Usage
```javascript
// Automatically switches between individual objects and combined meshes
hlod.update(camera);
```

---

## Performance Monitoring

### Built-in Profiler
```javascript
import { Profiler } from './editor/Profiler.js';

const profiler = new Profiler();
profiler.begin('Physics');
// ... physics code
profiler.end('Physics');

// Get stats
const stats = profiler.getStats();
console.log(stats.physics.average); // ms
```

### Memory Tracking
```javascript
const memInfo = engine.renderer.info.memory;
console.log('Geometries:', memInfo.geometries);
console.log('Textures:', memInfo.textures);
```

### Render Stats
```javascript
const renderInfo = engine.renderer.info.render;
console.log('Calls:', renderInfo.calls);
console.log('Triangles:', renderInfo.triangles);
console.log('Points:', renderInfo.points);
```

---

## Optimization Best Practices

### 1. Use Object Pooling
```javascript
// Bad: Creating new objects every frame
function spawnBullet() {
    return new Bullet(); // GC pressure
}

// Good: Pool reuse
function spawnBullet() {
    return bulletPool.acquire();
}
```

### 2. Enable Instancing
```javascript
// Bad: 1000 draw calls for 1000 trees
trees.forEach(tree => scene.add(tree));

// Good: 1 draw call for 1000 trees
instancedRenderer.addInstances(treeGeometry, treeMaterial, treeMatrices);
```

### 3. Use Spatial Queries
```javascript
// Bad: Check all objects
const nearby = allObjects.filter(o => o.position.distanceTo(player) < 10);

// Good: Octree query
const nearby = spatial.querySphere(player.position, 10);
```

### 4. Use Frustum Culling
```javascript
// Filter pipeline
let objects = allObjects;
objects = frustumCuller.filterVisible(objects);
// Only render what's actually visible
```

### 5. LOD Everything
```javascript
// Set appropriate LOD distances
lodManager.register(obj, meshes, {
    distances: [25, 75, 200, 500]  // Aggressive LOD
});
```
