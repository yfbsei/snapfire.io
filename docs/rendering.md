# Rendering Documentation

The engine features a high-fidelity rendering pipeline built on Three.js with built-in support for AAA-quality post-processing effects, WebGPU acceleration, and a comprehensive material library.

## Render Pipeline

The `RenderPipeline` orchestrates the rendering process, managing the renderer, camera, and post-processing chain.

### Features
- **WebGPU Support**: Automatic fallback to WebGL2 when unavailable
- **Tonemapping**: ACES Filmic with sRGB color correction
- **Debug Modes**: Lit, Unlit, Wireframe, Normals
- **Selection Outlining**: Built-in object highlighting

### Usage
```javascript
const pipeline = engine.renderPipeline;

// Debug modes
pipeline.setRenderMode('lit');       // Default
pipeline.setRenderMode('wireframe');
pipeline.setRenderMode('normals');

// Quality presets
pipeline.setQuality('ultra'); // Enables all effects

// Selection highlighting
pipeline.setSelectedObjects([obj1, obj2]);

// Screenshot
const dataUrl = pipeline.screenshot();
```

---

## Post-Processing System

The engine includes a robust post-processing stack managed by the `PostProcessing` class.

### Quality Presets

```javascript
engine.renderPipeline.setQuality('ultra');
```

| Preset | Effects Enabled |
|--------|-----------------|
| `low` | FXAA only |
| `medium` | FXAA, Bloom, SSAO |
| `high` | TAA, Bloom, GTAO, DOF, SSR |
| `ultra` | TAA, Bloom, GTAO, DOF, SSR, SSGI, Volumetric, Contact Shadows, Motion Blur |

### Available Effects

| Effect | Description | Performance |
|--------|-------------|-------------|
| **FXAA** | Fast Approximate Anti-Aliasing | Very Low |
| **TAA** | Temporal Anti-Aliasing (cinematic quality) | Medium |
| **Bloom** | Glow effect for bright sources | Low |
| **SSAO** | Screen Space Ambient Occlusion (legacy) | Medium |
| **GTAO** | Ground Truth Ambient Occlusion | High |
| **SSR** | Screen Space Reflections | High |
| **SSGI** | Screen Space Global Illumination | Very High |
| **DOF** | Depth of Field (Bokeh) | Medium |
| **Volumetric** | God rays and atmospheric fog | High |
| **Contact Shadows** | Fine detail shadows | Medium |
| **Motion Blur** | Per-object velocity-based blur | Medium |
| **Temporal Upscaling** | FSR-like 50-77% resolution upscaling | Low |

---

## Effect Configuration

### Bloom
```javascript
engine.postProcessing.setBloomSettings(
    0.5,   // strength
    0.4,   // radius
    0.85   // threshold
);
```

### Screen Space Reflections (SSR)
```javascript
engine.postProcessing.setSSRSettings({
    intensity: 1.0,
    maxDistance: 50.0,
    thickness: 0.1,
    maxSteps: 64,
    roughnessFade: true
});
```

### Screen Space Global Illumination (SSGI)
```javascript
engine.postProcessing.setSSGISettings({
    intensity: 1.0,
    radius: 4.0,
    samples: 32,
    bounceIntensity: 0.5
});
```

### Temporal Anti-Aliasing (TAA)
```javascript
engine.postProcessing.setTAASettings({
    blendFactor: 0.9,
    sharpness: 0.25,
    jitterEnabled: true
});
```

### Volumetric Lighting
```javascript
engine.postProcessing.setVolumetricSettings({
    density: 0.01,
    samples: 64,
    fog: {
        enabled: true,
        color: new THREE.Color(0.7, 0.8, 0.9),
        density: 0.0025
    }
});

// Link sun for god rays
engine.postProcessing.setVolumetricSunLight(sunLight);
```

### Contact Shadows
```javascript
engine.postProcessing.setContactShadowsSettings({
    opacity: 0.5,
    blur: 0.5,
    distance: 0.1,
    thickness: 0.02
});
```

### Depth of Field
```javascript
engine.postProcessing.setDOFSettings({
    focalLength: 0.05,
    focusDistance: 10,
    bokehScale: 2.0
});
```

---

## Material Library

The `MaterialLibrary` provides AAA-quality material presets and advanced material creation utilities.

### Built-in Presets
```javascript
import { materialLibrary } from './index.js';

// Get a preset material
const gold = materialLibrary.get('gold');
const chrome = materialLibrary.get('chrome');
const wood = materialLibrary.get('wood');
```

### Available Presets

**Metals:**
- `gold`, `silver`, `chrome`, `copper`, `bronze`, `iron`, `steel`
- `aluminum`, `titanium`, `brass`

**Non-Metals:**
- `plastic_white`, `plastic_red`, `plastic_black`
- `rubber`, `leather`, `fabric`
- `wood`, `stone`, `marble`, `concrete`
- `glass`, `glass_frosted`, `water`
- `skin`, `hair`

**Special:**
- `emissive`, `hologram`, `forcefield`
- `ice`, `crystal`, `lava`

### Usage
```javascript
// Apply preset
myMesh.material = materialLibrary.get('chrome');

// Get all presets
const names = materialLibrary.getPresetNames();

// Get by category
const categories = materialLibrary.getPresetsByCategory();
// { metals: [...], nonMetals: [...], special: [...] }
```

### Advanced Materials

#### Layered Materials
Blend two materials based on a mask texture:
```javascript
const layered = materialLibrary.createLayeredMaterial(
    baseMaterial,
    topMaterial,
    maskTexture  // R channel = blend factor
);
```

#### Parallax Occlusion Mapping
```javascript
const pom = materialLibrary.createPOMMaterial({
    map: diffuseTexture,
    normalMap: normalTexture,
    heightMap: heightTexture,
    heightScale: 0.05,
    minLayers: 8,
    maxLayers: 32
});
```

#### Wet/Dry Materials
```javascript
const wet = materialLibrary.createWetMaterial(dryMaterial, 0.8);
// 0 = dry, 1 = fully wet (darker, more reflective)
```

#### Damage/Wear Materials
```javascript
const damaged = materialLibrary.createDamagedMaterial(cleanMaterial, 0.5);
// 0 = pristine, 1 = fully damaged
```

---

## Lighting

### Directional Light (Sun)
```javascript
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(50, 100, 50);
sun.castShadow = true;

// Shadow quality
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;

engine.scene.add(sun);
```

### Cascaded Shadow Maps (CSM)
For large outdoor scenes:
```javascript
import { CSMShadows } from './index.js';

const csm = new CSMShadows({
    maxFar: 500,
    cascades: 4,
    shadowMapSize: 2048
});
csm.setup(engine.scene, engine.camera, sunLight);

// Update in game loop
csm.update(engine.camera);
```

### Light Probes
Capture and apply indirect lighting:
```javascript
import { LightProbeSystem } from './index.js';

const probes = new LightProbeSystem();
probes.addProbe(new THREE.Vector3(0, 2, 0));
probes.bake(engine.scene, engine.renderer);

// Apply to objects
probes.applyToObject(myMesh);
```

---

## Decal System

Project textures onto surfaces:
```javascript
import { DecalSystem, Decal } from './index.js';

const decals = new DecalSystem();

// Create decal at hit point
const decal = decals.createDecal({
    position: hit.point,
    normal: hit.normal,
    size: new THREE.Vector3(0.5, 0.5, 0.5),
    texture: bulletHoleTexture,
    rotation: Math.random() * Math.PI * 2
});

engine.scene.add(decal);
```

---

## Motion Blur

Per-object motion blur using velocity buffers.

### Configuration
```javascript
// Enable (included in 'ultra' preset)
engine.postProcessing.setPassEnabled('motionBlur', true);

// Configure
engine.postProcessing.setMotionBlurSettings({
    intensity: 1.0,     // Blur strength (0-2)
    samples: 16,        // Quality (4-32)
    maxVelocity: 32.0   // Clamp fast-moving objects
});
```

---

## Hair Rendering System

GPU-instanced strand-based hair for characters.

### Basic Setup
```javascript
import { HairSystem } from './index.js';

const hair = new HairSystem({
    strandCount: 10000,
    strandLength: 0.15,
    baseColor: new THREE.Color(0.2, 0.1, 0.05),
    tipColor: new THREE.Color(0.4, 0.25, 0.15)
});

// Grow from mesh vertices
hair.setRootsFromMesh(headMesh);

// Attach to animated bone
hair.attachTo(headBone);

engine.scene.add(hair.mesh);
```

### Wind Animation
```javascript
hair.setWind(
    new THREE.Vector3(1, 0, 0.5),  // Direction
    0.02,                          // Strength
    2.0                            // Frequency
);
```

### Update Loop
```javascript
// In game loop - updates wind and LOD
hair.update(deltaTime, camera);
```

---

## Temporal Upscaling

FSR-like temporal upscaling for performance.

### Quality Presets

| Preset | Render Scale | Upscale Factor |
|--------|-------------|----------------|
| `ultra_quality` | 77% | 1.3x |
| `quality` | 67% | 1.5x |
| `balanced` | 59% | 1.7x |
| `performance` | 50% | 2.0x |

### Usage
```javascript
import { TemporalUpscalePass } from './index.js';

const upscaler = new TemporalUpscalePass(scene, camera, {
    quality: 'balanced',
    sharpness: 0.5
});

// Change quality at runtime
upscaler.setQuality('performance');
```

---

## WebGPU Support

The engine automatically detects and uses WebGPU when available:
```javascript
import { isWebGPUAvailable, RendererCapabilities } from './index.js';

if (isWebGPUAvailable()) {
    console.log('WebGPU is available!');
}

const caps = RendererCapabilities.get(engine.renderer);
console.log('Compute shaders:', caps.computeShaders);
console.log('Ray tracing:', caps.rayTracing);
```

### Renderer Info
```javascript
const info = engine.getRendererInfo();
console.log(info.type);        // 'webgpu' or 'webgl'
console.log(info.capabilities);
```
