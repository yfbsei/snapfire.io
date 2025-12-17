# Animation System Documentation

The OpenWorld Engine provides a comprehensive animation system including skeletal animation, animation layers, IK (Inverse Kinematics), and procedural animation.

## AnimationController

The `AnimationController` manages skeletal animations with support for blending, layers, and events.

### Basic Setup
```javascript
import { AnimationController } from './index.js';

// Create controller for animated model
const animator = new AnimationController(characterModel, animationClips);

// Or get from loaded GLTF
const gltf = await engine.loadModel('character.glb');
const animator = new AnimationController(gltf.scene, gltf.animations);
```

### Playing Animations
```javascript
// Simple play
animator.play('idle');

// Play with options
animator.play('walk', {
    fadeDuration: 0.2,    // Crossfade from current
    loop: true,           // THREE.LoopRepeat
    speed: 1.0,           // Playback speed
    weight: 1.0           // Blend weight
});

// One-shot animation
animator.play('attack', {
    loop: false,
    clamp: true           // Hold last frame
});
```

### Crossfading
```javascript
// Smooth transition between animations
animator.crossFade('run', 0.3); // Fade over 0.3 seconds
```

### Speed Control
```javascript
animator.setSpeed(1.5);    // 1.5x speed
animator.setSpeed(0.5);    // Half speed
animator.setSpeed(-1);     // Reverse
```

### Time Control
```javascript
const time = animator.getTime();
animator.setTime(0);       // Jump to start
animator.setTime(1.5);     // Jump to 1.5 seconds
```

### Pause/Resume
```javascript
animator.pause();
animator.resume();
```

### Query State
```javascript
if (animator.isPlaying('run')) { }
const duration = animator.getDuration('walk');
const names = animator.getAnimationNames();
```

### Update
```javascript
// In game loop
animator.update(deltaTime);
```

---

## Animation Layers

Blend multiple animations simultaneously (e.g., running + aiming).

### Layer Setup
```javascript
// Play on layer 0 (base layer)
animator.play('run', { layer: 0 });

// Play upper body animation on layer 1
animator.play('aim', { 
    layer: 1,
    weight: 1.0,
    mask: upperBodyBones  // Only affect specific bones
});
```

### Layer Weight
```javascript
// Blend layer intensity
animator.setLayerWeight(1, 0.7);  // Layer 1 at 70%
```

### Stop Layer
```javascript
animator.stopLayer(1);            // Stop with no fade
animator.stopLayer(1, 0.3);       // Fade out over 0.3s
```

### Example: Locomotion + Upper Body
```javascript
// Base locomotion
if (isMoving) {
    animator.play(isRunning ? 'run' : 'walk', { layer: 0 });
} else {
    animator.play('idle', { layer: 0 });
}

// Upper body (aiming)
if (isAiming) {
    animator.setLayerWeight(1, 1.0);
    animator.play('aim', { layer: 1 });
} else {
    animator.setLayerWeight(1, 0); // Disable layer
}
```

---

## Animation Events

React to animation milestones:
```javascript
animator.addEventListener('finished', (event) => {
    console.log(`Animation ${event.action.getClip().name} finished`);
    animator.play('idle');
});

animator.addEventListener('loop', (event) => {
    console.log(`Animation looped`);
});

animator.removeEventListener('finished', callback);
```

---

## Foot IK

The `FootIK` system adapts character feet to uneven terrain.

### Setup
```javascript
import { FootIK } from './core/animation/FootIK.js';

const footIK = new FootIK(characterModel, {
    leftFootBone: 'mixamorigLeftFoot',
    rightFootBone: 'mixamorigRightFoot',
    leftLegChain: ['mixamorigLeftUpLeg', 'mixamorigLeftLeg', 'mixamorigLeftFoot'],
    rightLegChain: ['mixamorigRightUpLeg', 'mixamorigRightLeg', 'mixamorigRightFoot'],
    hipBone: 'mixamorigHips',
    raycastDistance: 2.0,
    footHeight: 0.1
});
```

### Physics Integration
```javascript
footIK.setPhysicsWorld(engine.physics);
```

### Update
```javascript
// Call after animation update
animator.registerPostUpdateCallback((dt) => {
    footIK.update(dt);
});
```

### Configuration
```javascript
footIK.setConfig({
    enabled: true,
    maxStepHeight: 0.5,    // Max terrain adaptation
    smoothing: 0.1,        // Interpolation speed
    hipAdjustment: true    // Lower/raise hip with terrain
});
```

---

## IK System

General-purpose Inverse Kinematics for any bone chains.

### Setup
```javascript
import { IKSystem } from './core/animation/IKSystem.js';

const ik = new IKSystem(characterModel);
```

### CCD IK (Cyclic Coordinate Descent)
Good for quick, responsive IK:
```javascript
// Add IK chain
ik.addChain({
    name: 'leftArm',
    bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'],
    target: targetObject,      // Object3D to reach towards
    solver: 'ccd',
    iterations: 10
});
```

### FABRIK Solver
For more natural arm/leg movement:
```javascript
ik.addChain({
    name: 'rightLeg',
    bones: ['RightUpLeg', 'RightLeg', 'RightFoot'],
    target: footTarget,
    solver: 'fabrik',
    iterations: 10,
    tolerance: 0.01
});
```

### Chain Control
```javascript
// Enable/disable chain
ik.setChainEnabled('leftArm', true);

// Set chain weight (blend with animation)
ik.setChainWeight('leftArm', 0.5); // 50% IK

// Update target
ik.setTarget('leftArm', newTargetPosition);
```

### Constraints
```javascript
ik.addChain({
    name: 'arm',
    bones: [...],
    constraints: {
        'LeftArm': {
            type: 'hinge',        // 'hinge', 'ball', 'fixed'
            axis: new THREE.Vector3(1, 0, 0),
            min: -Math.PI / 2,
            max: Math.PI / 2
        }
    }
});
```

### Update
```javascript
// Call after animation update
ik.update(deltaTime);
```

---

## Look-At IK

Make character look at targets:
```javascript
import { IKSystem } from './core/animation/IKSystem.js';

const lookAt = new IKSystem(characterModel);

lookAt.addChain({
    name: 'head',
    bones: ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'],
    target: lookTarget,
    solver: 'ccd',
    weights: [0.1, 0.1, 0.2, 0.3, 0.3],  // Per-bone weights
    constraints: {
        'Head': { type: 'ball', maxAngle: Math.PI / 4 },
        'Neck': { type: 'ball', maxAngle: Math.PI / 6 }
    }
});

// Blend based on distance
const dist = lookTarget.position.distanceTo(character.position);
lookAt.setChainWeight('head', THREE.MathUtils.smoothstep(dist, 10, 2));
```

---

## Procedural Animation

The `ProceduralAnimator` adds procedural motion to characters.

### Setup
```javascript
import { ProceduralAnimator } from './core/animation/ProceduralAnimator.js';

const procedural = new ProceduralAnimator(characterModel);
```

### Breathing
```javascript
procedural.addBreathing({
    bones: ['Spine', 'Spine1', 'Spine2'],
    intensity: 0.02,
    frequency: 0.2          // Breaths per second
});
```

### Idle Sway
```javascript
procedural.addIdleSway({
    bones: ['Hips', 'Spine'],
    intensity: 0.01,
    frequency: 0.5
});
```

### Head Bob
```javascript
procedural.addHeadBob({
    bone: 'Head',
    intensity: 0.02,
    syncWithMovement: true  // Bob faster when moving
});
```

### Update
```javascript
procedural.update(deltaTime, velocity.length());
```

---

## AnimatorComponent

Component wrapper for attaching to GameObjects:
```javascript
import { AnimatorComponent } from './index.js';

const player = engine.createGameObject('Player');

// Load model with animations
const gltf = await engine.loadModel('player.glb');
player.object3D.add(gltf.scene);

// Add animator component
const animator = player.addComponent(AnimatorComponent);
animator.setup(gltf.scene, gltf.animations);

// Use
animator.play('idle');
animator.crossFade('walk', 0.2);

// Auto-updates with GameObject
```

---

## Complete Example

```javascript
import { GameEngine, AnimatorComponent } from './index.js';
import { FootIK, IKSystem, ProceduralAnimator } from './core/animation';

const engine = new GameEngine();
await engine.init(container);

// Load character
const gltf = await engine.loadModel('character.glb');
const character = engine.createGameObject('Player');
character.object3D.add(gltf.scene);

// Animation controller
const animator = character.addComponent(AnimatorComponent);
animator.setup(gltf.scene, gltf.animations);

// Foot IK
const footIK = new FootIK(gltf.scene, {
    leftFootBone: 'LeftFoot',
    rightFootBone: 'RightFoot',
    // ... bone config
});
footIK.setPhysicsWorld(engine.physics);

// Look-at IK
const lookIK = new IKSystem(gltf.scene);
lookIK.addChain({
    name: 'head',
    bones: ['Neck', 'Head'],
    target: lookTarget,
    solver: 'ccd'
});

// Procedural additions
const procedural = new ProceduralAnimator(gltf.scene);
procedural.addBreathing({ bones: ['Spine'], intensity: 0.01 });

// Register post-animation callbacks
animator.controller.registerPostUpdateCallback((dt) => {
    footIK.update(dt);
    lookIK.update(dt);
    procedural.update(dt, velocity.length());
});

// Game loop
function update(dt) {
    // Locomotion
    if (isMoving) {
        animator.crossFade(isRunning ? 'run' : 'walk', 0.2);
    } else {
        animator.crossFade('idle', 0.3);
    }
    
    // Upper body aim
    if (isAiming) {
        animator.controller.play('aim', { layer: 1 });
        animator.controller.setLayerWeight(1, 1);
    } else {
        animator.controller.setLayerWeight(1, 0);
    }
}

engine.start();
```
