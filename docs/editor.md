# Editor Documentation

The OpenWorld Engine includes a built-in visual editor for scene construction, object manipulation, and game testing.

## Editor Overview

The Editor provides a Unity-like interface with panels for hierarchy, inspector, viewport, asset management, **path tracing preview**, **animation timeline**, **terrain editing**, and **scene settings**.

### Starting the Editor
```javascript
import { Editor } from './src/editor/Editor.js';

const container = document.getElementById('editor-container');
const editor = new Editor(container);
await editor.init();
```

---

## Layout

The editor uses a flexible panel layout:

```
┌──────────────────────────────────────────────────────────────┐
│                        Menu Bar                               │
├──────────────────────────────────────────────────────────────┤
│                        Toolbar                                │
├──────────┬────────────────────────────────┬──────────────────┤
│          │                                │                  │
│          │                                │    Inspector     │
│ Hierarchy│          Viewport              │                  │
│          │                                ├──────────────────┤
│          │                                │                  │
│          │                                │  Asset Browser   │
├──────────┴────────────────────────────────┴──────────────────┤
│                     Console / Stats                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Panels

### Hierarchy Panel

Displays the scene tree. Navigate and select objects.

**Features:**
- Drag-and-drop reparenting
- Multi-selection (Ctrl+Click)
- Right-click context menu
- Search/filter objects

**Shortcuts:**
| Key | Action |
|-----|--------|
| Delete | Delete selected |
| Ctrl+D | Duplicate |
| F2 | Rename |

### Inspector Panel

Displays and edits properties of the selected object.

**Sections:**
- **Transform**: Position, rotation, scale
- **Components**: All attached components
- **Materials**: Material properties (if mesh)
- **Scripts**: Attached scripts and their properties

**Quick Edit:**
```
Position: X [0.00] Y [1.00] Z [0.00]
Rotation: X [0.00] Y [90.0] Z [0.00]
Scale:    X [1.00] Y [1.00] Z [1.00]
```

### Viewport

3D view of the scene with manipulation tools.

**Navigation:**
| Input | Action |
|-------|--------|
| Right-Click + WASD | Fly around |
| Middle-Click | Pan |
| Scroll | Zoom |
| Alt + Left-Click | Orbit around selection |
| F | Focus on selected |

**Tools:**
| Key | Tool |
|-----|------|
| W | Translate (Move) |
| E | Rotate |
| R | Scale |
| T | Transform all |

**View Modes:**
- Lit (default)
- Wireframe
- Normals
- Unlit

### Asset Browser

Browse and import assets into the scene.

**Supported Formats:**
- Models: `.glb`, `.gltf`, `.fbx`, `.obj`
- Textures: `.png`, `.jpg`, `.hdr`, `.exr`
- Audio: `.mp3`, `.wav`, `.ogg`

**Actions:**
- Double-click to add to scene
- Drag to viewport to place
- Right-click for options

### Console Panel

Displays logs, warnings, and errors.

```
[INFO] Scene loaded successfully
[WARN] Texture 'diffuse.png' not found, using fallback
[ERROR] Script 'PlayerController' threw an exception
```

**Commands:**
- Type commands directly in the console
- `clear` - Clear console
- `help` - Show available commands

### Stats Panel

Real-time performance metrics:
- FPS
- Frame time (ms)
- Draw calls
- Triangles
- Textures in memory
- Geometries in memory

---

## Menu Bar

### File Menu
- **New Scene** - Create empty scene
- **Open Scene** - Load from file
- **Save Scene** - Save current scene
- **Import Model** - Import 3D model
- **Export** - Export options (see below)

### Edit Menu
- **Undo** (Ctrl+Z)
- **Redo** (Ctrl+Y)
- **Cut** (Ctrl+X)
- **Copy** (Ctrl+C)
- **Paste** (Ctrl+V)
- **Duplicate** (Ctrl+D)
- **Delete** (Delete)
- **Select All** (Ctrl+A)

### GameObject Menu
- **Create Empty**
- **Create Primitives** (Box, Sphere, Cylinder, etc.)
- **Create Light** (Directional, Point, Spot)
- **Create Camera**

### View Menu
- **Toggle Panels** - Show/hide panels
- **Render Mode** - Lit, Wireframe, etc.
- **Grid** - Toggle grid visibility
- **Helpers** - Toggle light/camera helpers

### Play Menu
- **Play** (Ctrl+P) - Enter play mode
- **Pause** - Pause game
- **Stop** - Exit play mode

---

## Toolbar

Quick access buttons:
```
[Translate] [Rotate] [Scale] | [Local/World] | [Snap] | [Grid] | [Play] [Pause] [Stop]
```

### Transform Tools
- **Translate** (W): Move objects
- **Rotate** (E): Rotate objects
- **Scale** (R): Resize objects

### Space Toggle
- **Local**: Transform relative to object
- **World**: Transform relative to world axes

### Snap Options
- **Grid Snap**: Snap to grid increments
- **Rotation Snap**: Snap to angle increments (15°, 45°, 90°)
- **Scale Snap**: Snap to scale increments

---

## Gizmos

### Transform Gizmo
Visual handles for manipulation:
- **Red** (X axis)
- **Green** (Y axis)
- **Blue** (Z axis)
- **Yellow planes** (multi-axis)
- **White center** (all axes)

### Viewport Overlay
Information displayed over the viewport:
- Grid
- Selection outline
- Light helpers
- Camera frustums
- Collider wireframes

---

## Undo/Redo System

The editor maintains full undo/redo history:

```javascript
// Automatic for editor actions
editor.history.undo();
editor.history.redo();

// Check state
if (editor.history.canUndo()) { }
if (editor.history.canRedo()) { }
```

---

## Game Export

Export your game as a standalone HTML file:

### Via Menu
File → Export → Standalone HTML

### Via Code
```javascript
await editor.exportGame({
    output: 'game.html',
    minify: true,
    includeAssets: true,
    compression: 'gzip'
});
```

### Export Options
| Option | Description |
|--------|-------------|
| `minify` | Minify JavaScript |
| `includeAssets` | Bundle all assets |
| `compression` | None, gzip, or brotli |
| `target` | 'web', 'electron', 'mobile' |

---

## Signals System

The editor uses a signal system for communication between panels:

```javascript
// Listen for selection change
editor.signals.add('objectSelected', (object) => {
    console.log('Selected:', object.name);
});

// Listen for scene changes
editor.signals.add('sceneChanged', () => {
    console.log('Scene was modified');
});

// Available signals:
// - objectSelected
// - objectDeselected
// - objectTransformChanged
// - objectAdded
// - objectRemoved
// - sceneChanged
// - editorModeChanged
// - playModeEntered
// - playModeExited
```

---

## Material Editor

Edit materials visually:

### Opening
- Double-click a material in Inspector
- Or: Right-click mesh → Edit Material

### Features
- PBR property sliders
- Texture slot assignment
- Shader preview
- Material presets

### Properties
- **Albedo**: Base color and map
- **Metalness**: 0.0 to 1.0
- **Roughness**: 0.0 to 1.0
- **Normal Map**: Surface detail
- **Emission**: Glow color and intensity
- **Opacity**: Transparency

---

## VFX Editor

Node-based VFX creation:

### Opening
- GameObject → Create VFX
- Or: Window → VFX Editor

### Node Types
- **Spawn**: Emission control
- **Initialize**: Initial properties
- **Physics**: Forces and drag
- **Color**: Color over lifetime
- **Size**: Size over lifetime
- **Render**: Rendering settings

### Workflow
1. Create nodes
2. Connect nodes via wires
3. Adjust properties
4. Preview in viewport
5. Save as prefab

---

## Profiler

Performance analysis tool:

### Opening
Window → Profiler

### Metrics
- **Frame Time**: Total frame duration
- **Render**: GPU rendering time
- **Scripts**: Script update time
- **Physics**: Physics simulation time
- **Animation**: Animation update time

### Timeline View
See frame-by-frame breakdown of performance.

---

## Keyboard Shortcuts

### Global
| Shortcut | Action |
|----------|--------|
| Ctrl+N | New scene |
| Ctrl+O | Open scene |
| Ctrl+S | Save scene |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+P | Toggle play mode |
| Delete | Delete selected |
| F | Focus selection |

### Viewport
| Shortcut | Action |
|----------|--------|
| W | Translate tool |
| E | Rotate tool |
| R | Scale tool |
| G | Toggle grid |
| H | Toggle helpers |
| 1-4 | View modes |

### Hierarchy
| Shortcut | Action |
|----------|--------|
| Ctrl+D | Duplicate |
| F2 | Rename |

---

## UIRenderer

The `UIRenderer` system creates in-game UI overlays:

```javascript
import { UIRenderer } from './index.js';

const ui = new UIRenderer(engine);

// Create text element
const scoreText = ui.createText({
    text: 'Score: 0',
    x: 20, y: 20,
    font: '24px Arial',
    color: 'white'
});

// Update text
scoreText.text = 'Score: 100';

// Create button
const btn = ui.createButton({
    text: 'Start Game',
    x: 400, y: 300,
    width: 200, height: 50,
    onClick: () => startGame()
});

// Create progress bar
const healthBar = ui.createProgressBar({
    x: 20, y: 60,
    width: 200, height: 20,
    value: 100,
    maxValue: 100,
    fillColor: 'red'
});

healthBar.setValue(75);

// Update in game loop
ui.render();
```

---

## Complete Example

```javascript
import { Editor } from './src/editor/Editor.js';

// Create editor
const editor = new Editor(document.getElementById('app'));
await editor.init();

// Listen for object selection
editor.signals.add('objectSelected', (obj) => {
    console.log('Selected:', obj?.name);
});

// Create a test scene
const cube = editor.engine.createPrimitive('box');
cube.transform.setPosition(0, 1, 0);

const ground = editor.engine.createGround(100);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
editor.engine.scene.add(light);

// Export when ready
document.getElementById('exportBtn').onclick = async () => {
    await editor.exportGame({ minify: true });
};
```

---

## Path Tracer Panel

High-quality path tracing for preview rendering and lightmap baking using `three-gpu-pathtracer`.

### Usage
```javascript
import { PathTracePreview } from './src/editor/panels/PathTracePreview.js';

const pathTracePanel = new PathTracePreview(editor);
await pathTracePanel.init();
document.body.appendChild(pathTracePanel.getElement());
```

### Features
- **Preview Mode**: Progressive rendering with real-time sample count
- **Bake Mode**: High-quality export (1000+ samples)
- **Quality Presets**: Low, Medium, High, Ultra
- **Bounce Control**: 1-16 light bounces
- **Image Export**: Save renders as PNG

### Core API (PathTracer)
```javascript
import { PathTracer } from './src/core/rendering/PathTracer.js';

const pt = new PathTracer(renderer, scene, camera);
await pt.init();

pt.setQuality('high');      // Preset
pt.start(500);              // Start with 500 samples
pt.renderSample();          // Call in loop
pt.stop();                  // Stop rendering
const img = pt.getImage();  // Get data URL
```

---

## Animation Editor

Timeline-based animation with keyframes and easing functions.

### Usage
```javascript
import { AnimationEditor } from './src/editor/panels/AnimationEditor.js';

const animEditor = new AnimationEditor(editor);
animEditor.init();
document.body.appendChild(animEditor.getElement());
```

### Features
| Feature | Description |
|---------|-------------|
| **Tracks** | Position X/Y/Z, Rotation Y, Scale |
| **Keyframes** | Click to add, drag to move |
| **Easing** | Linear, Ease In/Out, Bounce, Elastic |
| **Playback** | Play, Pause, First/Last, Prev/Next Keyframe |
| **Duration** | Configurable animation length |

### Controls
| Button | Action |
|--------|--------|
| ▶ / ⏸ | Play / Pause |
| ⏮ | Go to start |
| ⏭ | Go to end |
| ◆+ | Add keyframe at current time |
| ◆- | Delete selected keyframe |

---

## Terrain Editor

Brush-based terrain sculpting with heightmap support.

### Usage
```javascript
import { TerrainEditor } from './src/editor/panels/TerrainEditor.js';

const terrainEditor = new TerrainEditor(editor);
terrainEditor.init();
document.body.appendChild(terrainEditor.getElement());
```

### Brush Tools
| Tool | Icon | Description |
|------|------|-------------|
| Raise | ⬆️ | Raise terrain height |
| Lower | ⬇️ | Lower terrain height |
| Smooth | 〰️ | Smooth terrain bumps |
| Flatten | ━ | Flatten to target height |
| Paint | 🎨 | Paint texture layers |

### Brush Settings
- **Size**: 1-50 units
- **Strength**: 0.01-1.0
- **Falloff**: 0-1 (edge softness)

### Heightmap I/O
- **Import**: Load PNG/JPG heightmap image
- **Export**: Save terrain as grayscale PNG

### Terrain Sizes
- 64×64, 128×128, 256×256, 512×512

---

## Scene Settings Panel

Centralized configuration for rendering, environment, and physics.

### Usage
```javascript
import { SceneSettingsPanel } from './src/editor/panels/SceneSettingsPanel.js';

const settings = new SceneSettingsPanel(editor);
settings.init();
document.body.appendChild(settings.getElement());
```

### Quality Presets
| Preset | Effects |
|--------|---------|
| Low | No post-processing |
| Medium | TAA, SSAO, Bloom |
| High | + SSR, Contact Shadows |
| Ultra | + SSGI, DOF, Volumetric |

### Post-Processing Toggles
- TAA, SSAO, SSGI, SSR, Bloom, DOF, Volumetric, Contact Shadows

### Environment Settings
- Background color
- Ambient intensity
- Fog (enable/color/density)

### Shadow Settings
- Enable/disable
- Type: Basic, PCF, PCF Soft, VSM
- Map size: 512-4096

---

## Build Wizard

Advanced game export workflow.

### Opening
```javascript
import { BuildWizard } from './src/editor/ui/BuildWizard.js';

const wizard = new BuildWizard(editor);
wizard.show();
```

### Platforms
| Platform | Output |
|----------|--------|
| 🌐 Web | Standalone HTML5 |
| 🖥️ Desktop | Electron app |
| 📱 Mobile | PWA / Capacitor |

### Build Options
- **Minify JavaScript**: Reduce file size
- **Bundle Assets**: Include all textures/models
- **Source Maps**: For debugging
- **Compression**: None, Gzip, Brotli

### Quality vs Size
| Quality | Estimated Size |
|---------|----------------|
| Low | ~2 MB |
| Medium | ~5 MB |
| High | ~10 MB |
| Ultra | ~20 MB |

---

## Prefab Panel

Save objects as reusable prefabs and instantiate them anywhere in your scene.

### Usage
```javascript
import { PrefabPanel } from './src/editor/panels/PrefabPanel.js';

const prefabs = new PrefabPanel(container, engine, signals);
prefabs.init();
```

### Features
- **Save Prefab**: Select object → Click "+" button
- **Instantiate**: Double-click prefab or drag to viewport
- **Search**: Filter prefabs by name
- **Context Menu**: Right-click for rename/duplicate/delete

### API
```javascript
// Programmatically save current selection
prefabs.saveSelectedAsPrefab();

// Instantiate a prefab by ID
const instance = prefabs.instantiatePrefab(prefabId);

// Get all saved prefabs
const allPrefabs = prefabs.prefabs; // Map<id, prefabData>
```

Prefabs are stored in `localStorage` and persist between sessions.

---

## Multi-Select

Select and manipulate multiple objects simultaneously.

### Selection Methods

| Input | Action |
|-------|--------|
| **Click** | Select single object (clears others) |
| **Shift+Click** | Add object to selection |
| **Ctrl+Click** | Toggle object in selection |
| **Alt+Drag** | Box/marquee selection |

### Group Transform

When multiple objects are selected:
- Transform gizmo appears at group center
- All objects move/rotate/scale together
- Individual offsets are preserved

### API
```javascript
// Get selected objects
const selected = viewport.getSelectedObjects();

// Check if object is selected
if (viewport.isSelected(myObject)) { }

// Select multiple programmatically
signals.emit('multiSelect', { objects: [obj1, obj2, obj3] });
```

---

## Grid & Snap System

Precise object placement with configurable snapping.

### Usage
```javascript
import { SnapSettings } from './src/editor/ui/SnapSettings.js';

const snap = new SnapSettings(viewport, signals);
snap.init(toolbarContainer);
```

### Toolbar Controls
| Button | Action |
|--------|--------|
| **⊞** | Toggle snap on/off |
| **⊞** (right-click) | Open snap settings |
| **⊟** | Toggle grid visibility |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| G | Toggle grid |

### Snap Settings

**Position Snap**: 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, or custom
**Rotation Snap**: 5°, 15°, 45°, 90°, or custom
**Scale Snap**: 0.05, 0.1, 0.25, 0.5, 1.0, or custom

### API
```javascript
// Enable/disable snap
snap.setEnabled(true);

// Get current config
const config = snap.getConfig();

// Manually apply to transform controls
snap.applySnapToControls();
```

Settings persist in `localStorage`.

---

## Layer Panel

Organize objects into layers with visibility and lock controls.

### Usage
```javascript
import { LayerPanel } from './src/editor/panels/LayerPanel.js';

const layers = new LayerPanel(container, engine, signals);
layers.init();
```

### Default Layers
| ID | Name | Color |
|----|------|-------|
| 0 | Default | Purple |
| 1 | Ground | Green |
| 2 | Props | Orange |
| 3 | Characters | Red |
| 4 | Vehicles | Cyan |
| 5 | Lighting | Yellow |
| 6 | Effects | Purple |
| 7 | UI | Pink |

### Controls
| Icon | Action |
|------|--------|
| 👁 | Toggle layer visibility |
| 🔒 | Toggle layer lock (unselectable) |

### Usage
1. Click layer to assign selected objects
2. Double-click layer to rename
3. Use visibility toggles to show/hide groups
4. Lock layers to prevent accidental selection

### API
```javascript
// Assign object to layer
myObject.userData.layer = 2; // Props layer

// Get objects in layer
const props = layers.getObjectsInLayer(2);

// Toggle visibility
layers.toggleLayerVisibility(1);

// Check if object is selectable
if (layers.isObjectSelectable(myObject)) { }
```

---

## Physics Debug Renderer

Visualize physics colliders and rigid body types.

### Usage
```javascript
import { PhysicsDebugRenderer } from './src/editor/ui/PhysicsDebugRenderer.js';

const debug = new PhysicsDebugRenderer(engine, signals);
debug.init();
```

### Keyboard Shortcut
| Key | Action |
|-----|--------|
| P | Toggle physics debug |

### Color Coding
| Color | Body Type |
|-------|-----------|
| 🔵 Blue | Static |
| 🟢 Green | Dynamic |
| 🟡 Yellow | Kinematic |
| 🟣 Purple | Trigger |
| 🔴 Red | Contact points |

### Options
```javascript
debug.setOptions({
    showColliders: true,    // Collider wireframes
    showContacts: false,    // Contact points
    showVelocities: false,  // Velocity arrows
    wireframe: true,        // Wireframe mode
    opacity: 0.6            // Transparency
});
```

### API
```javascript
debug.enable();   // Turn on
debug.disable();  // Turn off
debug.toggle();   // Toggle state
debug.update();   // Force update
```

---

## Lighting Panel

Quick lighting setup and management.

### Usage
```javascript
import { LightingPanel } from './src/editor/panels/LightingPanel.js';

const lighting = new LightingPanel(container, engine, signals);
lighting.init();
```

### Quick Add Buttons
| Icon | Light Type |
|------|------------|
| ☀️ | Directional (Sun) |
| 💡 | Point Light |
| 🔦 | Spot Light |
| 🌐 | Ambient Light |
| 🌗 | Hemisphere Light |

### Environment Settings
- **Ambient Intensity**: 0 - 2
- **Ambient Color**: Color picker
- **Background Color**: Scene background

### Shadow Settings
- **Enable Shadows**: Global toggle
- **Shadow Map Size**: 512, 1024, 2048, 4096

### Scene Lights List
- Shows all lights in scene
- 👁 Toggle individual light visibility
- Click to select light for editing

### API
```javascript
// Add light programmatically
lighting.addLight('directional');
lighting.addLight('point');
lighting.addLight('spot');

// Get all scene lights
const lights = lighting.getLights();

// Set ambient
lighting.setAmbientIntensity(0.5);
lighting.setAmbientColor('#ffffff');

// Set shadows
lighting.setShadowsEnabled(true);
lighting.setShadowMapSize(2048);
```

