# BabylonJS GUI & Inspector Guide

## 🎨 GUI (@babylonjs/gui)

The GUI library lets you create 2D and 3D user interfaces directly in your BabylonJS scene.

### Basic Usage

```typescript
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';

// Create fullscreen UI overlay
const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI');

// Add text
const textBlock = new TextBlock();
textBlock.text = 'Hello World';
textBlock.color = 'white';
textBlock.fontSize = 24;
advancedTexture.addControl(textBlock);
```

### Common Use Cases

1. **HUD Elements** - Health bars, ammo counters, minimap
2. **Menus** - Start screen, pause menu, settings
3. **Tooltips** - Object information on hover
4. **Loading Screens** - Progress bars and status text
5. **In-game UI** - Inventory, quest log, dialogue

### Example in This Project

See `src/gui-example.ts` for a working example that shows:
- Info panels
- Buttons with hover effects
- FPS counter

To use it in your App.ts:
```typescript
import { GUIExample } from './gui-example';

// In createScene():
const gui = new GUIExample(this.scene);
gui.createInfoPanel('Terrain: 2km x 2km\nHeightmap: 4k');
gui.createFPSCounter();
```

---

## 🔍 Inspector (@babylonjs/inspector)

The Inspector is a powerful debugging tool for your 3D scene.

### How to Use

**Toggle Inspector:**
- Press **Shift + Ctrl + Alt + I**
- Or programmatically:
  ```typescript
  scene.debugLayer.show();
  scene.debugLayer.hide();
  ```

### Inspector Features

#### 1. **Scene Explorer** (Left Panel)
- View all meshes, lights, cameras in a hierarchy
- Select objects to inspect
- Toggle visibility
- Parent/unparent objects
- Delete objects

#### 2. **Property Inspector** (Right Panel)
When you select an object, you can:
- **Transform**: Position, rotation, scale in real-time
- **Material**: Edit colors, textures, PBR properties
- **Mesh**: View vertex count, bounding boxes
- **Physics**: Adjust mass, friction, restitution
- **Animations**: Play/pause animations

#### 3. **Statistics** (Top Bar)
- FPS counter
- Draw calls
- Active meshes
- Active particles
- Texture memory usage

#### 4. **Tools Tab**
- **Screenshot**: Capture current view
- **Performance**: Profiling tools
- **Metadata**: Scene information

### Useful Shortcuts in Inspector

- **W** - Wireframe mode
- **B** - Show bounding boxes
- **N** - Show normals
- **G** - Show grid
- **Ctrl + Click** - Select object in scene

### Inspector Tips for Your Project

1. **Check Terrain Mesh**
   - Open inspector → Scene Explorer → Find "terrain"
   - Check vertex count and subdivisions
   - Verify heightmap applied correctly

2. **Performance Monitoring**
   - Watch FPS and draw calls
   - Optimize if needed

3. **Material Tweaking**
   - Adjust terrain material colors
   - Test different lighting setups
   - Preview textures before coding

4. **Camera Debugging**
   - Adjust FOV, near/far planes
   - Set precise camera positions
   - Test different camera angles

---

## 📚 Additional Resources

- [BabylonJS GUI Docs](https://doc.babylonjs.com/features/featuresDeepDive/gui/gui)
- [Inspector Docs](https://doc.babylonjs.com/toolsAndResources/inspector)
- [GUI Playground Examples](https://playground.babylonjs.com/#XCPP9Y)
