# World Systems Documentation

The OpenWorld Engine uses a chunk-based streaming system to handle large-scale environments, with integrated terrain, vegetation, sky, and water systems.

## Chunk Manager

The `ChunkManager` is responsible for loading and unloading world data based on the player's position.

### Configuration
```javascript
import { ChunkManager } from './index.js';

const chunkManager = new ChunkManager({
    chunkSize: 100,      // Size of each chunk in world units
    loadDistance: 3,     // Radius of chunks to keep loaded
    unloadDistance: 5    // Radius beyond which chunks are disposed
});
```

### Update Loop
```javascript
// Call every frame with player position
chunkManager.update(playerPosition);
```

### Custom Systems
Register custom systems to respond to chunk events:
```javascript
const enemySpawner = {
    onChunkLoad(chunk) {
        console.log(`Loaded chunk ${chunk.x}, ${chunk.z}`);
        // Spawn enemies based on chunk data
        for (let i = 0; i < 5; i++) {
            const enemy = engine.createPrimitive('capsule', { name: 'Enemy' });
            enemy.transform.setPosition(
                chunk.x * 100 + Math.random() * 100,
                0,
                chunk.z * 100 + Math.random() * 100
            );
        }
    },
    onChunkUnload(chunk) {
        console.log(`Unloaded chunk ${chunk.x}, ${chunk.z}`);
        // Cleanup enemies in this chunk
    }
};

chunkManager.registerSystem(enemySpawner);
```

### Chunk Data
```javascript
const chunk = chunkManager.getChunk(chunkX, chunkZ);
// chunk.objects - Array of objects in this chunk
// chunk.loaded - Boolean
```

---

## Terrain System

The `TerrainSystem` generates heightmap-based terrain with procedural noise.

### Basic Setup
```javascript
import { TerrainSystem } from './index.js';

const terrain = new TerrainSystem(engine, {
    chunkSize: 100,
    resolution: 128,      // Vertices per chunk edge
    heightScale: 50,      // Maximum height
    noiseScale: 0.01,     // Noise frequency
    octaves: 4,           // Noise detail levels
    persistence: 0.5,
    lacunarity: 2.0
});

// Generate terrain around position
terrain.update(playerPosition);
```

### Height Queries
Critical for placing objects on the ground:
```javascript
const x = 50, z = 50;
const y = terrain.getHeightAt(x, z);
myObject.position.set(x, y, z);

// Get terrain normal for slope detection
const normal = terrain.getNormalAt(x, z);
```

### Texture Splatting
```javascript
terrain.setTextures({
    grass: grassTexture,
    rock: rockTexture,
    sand: sandTexture,
    snow: snowTexture
});

// Height-based blending
terrain.setBlendHeights({
    sandToGrass: 5,
    grassToRock: 30,
    rockToSnow: 80
});
```

### Terrain Chunks
```javascript
const chunk = terrain.getChunkAt(x, z);
// chunk.mesh - The terrain mesh
// chunk.heightData - Float32Array of heights
```

---

## Vegetation System

Handles massive amounts of foliage using **GPU Instancing**.

### Basic Setup
```javascript
import { VegetationSystem } from './index.js';

const vegetation = new VegetationSystem(engine, {
    grassCount: 50000,
    range: 200,           // Render distance
    density: 0.5,         // Spawn density
    terrainSystem: terrain
});

vegetation.setGrassTexture(grassBillboard);
```

### Features
- **GPU Instancing**: Renders thousands of plants in a single draw call
- **Wind Animation**: Vertex shader-based wind movement
- **Player Interaction**: Grass bends when player is near
- **LOD**: Automatic distance-based level of detail

### Configuration
```javascript
vegetation.setWindSettings({
    direction: new THREE.Vector3(1, 0, 0.5),
    strength: 1.0,
    frequency: 2.0
});

// Player interaction (grass bending)
vegetation.setPlayerPosition(playerPosition);
vegetation.setInteractionRadius(2.0);
```

### Instanced Vegetation (Advanced)
For trees and complex foliage:
```javascript
import { InstancedVegetation } from './core/world/InstancedVegetation.js';

const trees = new InstancedVegetation({
    mesh: treeMesh,
    count: 5000,
    range: 500
});

// Scatter based on terrain
trees.scatter(terrain, {
    minSlope: 0,
    maxSlope: 0.5,      // Radians
    minHeight: 5,
    maxHeight: 60
});
```

---

## Sky System

Manages the Day/Night cycle, sun position, and atmospheric scattering.

### Basic Setup
```javascript
import { SkySystem } from './core/world/SkySystem.js';

const sky = new SkySystem(engine);
sky.init();
```

### Time Control
```javascript
// Set time directly (0 = midnight, 0.5 = noon, 1 = midnight)
sky.updateTime(0.5);

// Enable automatic time progression
sky.timeScale = 0.01;  // Speed of day cycle

// In game loop
sky.update(deltaTime);
```

### Sun/Moon Access
```javascript
const sunPosition = sky.getSunPosition();
const sunLight = sky.getSunLight(); // DirectionalLight

// Link to volumetric lighting
engine.postProcessing.setVolumetricSunLight(sunLight);
```

### Atmospheric Settings
```javascript
sky.setAtmosphere({
    turbidity: 10,      // Atmospheric haze
    rayleigh: 1,        // Sky scattering
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7
});
```

---

## Water System

Realistic water rendering with reflections and waves.

### Basic Setup
```javascript
import { WaterSystem } from './world/WaterSystem.js';

const water = new WaterSystem(engine, {
    size: 1000,
    resolution: 512,
    color: 0x001e0f
});

water.position.y = 0; // Sea level
engine.scene.add(water.mesh);
```

### Wave Configuration
```javascript
water.setWaveSettings({
    amplitude: 0.5,
    frequency: 0.5,
    speed: 1.0,
    steepness: 0.5
});
```

### Reflections
```javascript
water.enableReflections(true);
water.setReflectionResolution(512);
```

### Foam and Shore Effects
```javascript
water.setFoamSettings({
    threshold: 0.5,
    intensity: 1.0,
    texture: foamTexture
});
```

### Update
```javascript
// In game loop
water.update(deltaTime, camera);
```

---

## Asset Streaming

Asynchronous loading of assets based on distance.

### Configuration
```javascript
const streaming = engine.world.assetStreaming;

streaming.setConfig({
    maxConcurrent: 4,      // Max simultaneous loads
    loadDistance: 300,     // Start loading distance
    unloadDistance: 500    // Unload distance
});
```

### Register Assets
```javascript
streaming.registerAsset({
    id: 'building_001',
    url: '/models/building_001.glb',
    position: new THREE.Vector3(100, 0, 50),
    loadDistance: 200
});

// Batch registration
streaming.registerAssets([
    { id: 'tree_001', url: '/models/tree.glb', position: pos1 },
    { id: 'rock_001', url: '/models/rock.glb', position: pos2 }
]);
```

### Update
```javascript
// In game loop - pass camera position
streaming.update(camera.position);
```

---

## World Integration Example

```javascript
import { GameEngine } from './index.js';
import { TerrainSystem, VegetationSystem, WaterSystem } from './world';
import { SkySystem, ChunkManager } from './core/world';

// Initialize
const engine = new GameEngine({ preferWebGPU: true });
await engine.init(container);

// Create world systems
const terrain = new TerrainSystem(engine, { chunkSize: 100, heightScale: 50 });
const vegetation = new VegetationSystem(engine, { grassCount: 50000 });
const sky = new SkySystem(engine);
const water = new WaterSystem(engine, { size: 2000 });

const chunks = new ChunkManager({ chunkSize: 100, loadDistance: 5 });

// Setup
sky.init();
water.position.y = -5;
engine.scene.add(water.mesh);

// Register terrain with chunk manager
chunks.registerSystem(terrain);
chunks.registerSystem(vegetation);

// Game loop
function gameLoop(dt) {
    const playerPos = player.transform.position;
    
    terrain.update(playerPos);
    vegetation.update(playerPos);
    sky.update(dt);
    water.update(dt, engine.camera);

    chunks.update(playerPos);
}
```
