# Audio System Documentation

The OpenWorld Engine provides a comprehensive audio system with 3D positional audio, occlusion, mixing, and reverb zones.

## AudioManager

The `AudioManager` handles all audio playback including music, sound effects, and 3D spatial audio.

### Initialization
```javascript
// AudioManager is initialized automatically with GameEngine
const audio = engine.audio;

// Resume audio context (required after user interaction)
audio.resume();
```

### Background Music
```javascript
// Play music
await audio.playMusic('/audio/ambient.mp3', {
    volume: 0.5,
    loop: true,
    fadeIn: 2.0    // Fade in over 2 seconds
});

// Stop with fade out
audio.stopMusic(2.0); // 2 second fade out

// Pause/Resume
audio.pauseMusic();
audio.resumeMusic();
```

### Sound Effects (2D)
```javascript
// Play a sound effect (non-positional)
const sfx = await audio.playSFX('/audio/click.wav', {
    volume: 0.8,
    loop: false,
    playbackRate: 1.0
});
```

### 3D Positional Audio
```javascript
// Play sound at world position
const explosion = await audio.playSFX3D('/audio/explosion.wav', 
    new THREE.Vector3(10, 0, 5), 
    {
        volume: 1.0,
        refDistance: 1,      // Full volume at this distance
        maxDistance: 100,    // Inaudible beyond this
        rolloffFactor: 1.0   // How quickly sound fades with distance
    }
);
```

### Attached Audio Sources
```javascript
// Create audio source attached to a game object
const engineSound = await audio.createAudioSource(
    carObject,               // Parent object
    '/audio/engine_loop.wav',
    {
        loop: true,
        volume: 0.6,
        refDistance: 5,
        maxDistance: 50
    }
);

engineSound.play();
```

---

## Volume Control

### Global Volume
```javascript
audio.setMasterVolume(0.8);   // 0 to 1
audio.setMusicVolume(0.5);    // Music channel
audio.setSFXVolume(1.0);      // SFX channel
```

### Mute All
```javascript
audio.stopAll();
```

---

## Audio Preloading

Preload audio files for instant playback:
```javascript
await audio.preload([
    '/audio/gunshot.wav',
    '/audio/footstep.wav',
    '/audio/explosion.wav'
]);
```

---

## Audio Occlusion

Simulate sound being blocked by walls and objects.

### Setup
```javascript
// Link physics world for raycast-based occlusion
audio.setPhysicsWorld(engine.physics);

// Enable occlusion
audio.setOcclusionEnabled(true);
```

### Manual Occlusion Check
```javascript
const occlusionFactor = audio.calculateOcclusion(soundSource.position);
// 0 = fully blocked, 1 = no obstruction
```

### How It Works
The system raycasts from listener to sound source. If obstacles are hit, a low-pass filter is applied to simulate muffled sound.

---

## Reverb Zones

Create areas with different acoustic properties:
```javascript
const caveReverb = audio.createReverbZone({
    position: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(50, 20, 50),
    decay: 3.0,      // Reverb duration in seconds
    mix: 0.4         // Wet/dry mix (0-1)
});

// Load custom impulse response
audio.loadReverbImpulse('/audio/ir/cathedral.wav');
```

### Update
```javascript
// Call in game loop to check zone transitions
audio.update(deltaTime);
```

---

## AudioMixer (Advanced)

The `AudioMixer` provides professional audio routing with buses and effects.

### Setup
```javascript
import { AudioMixer } from './index.js';

const mixer = new AudioMixer();
```

### Default Channels
The mixer creates these channels automatically:
- `master` - Final output
- `music` - Background music
- `sfx` - Sound effects
- `voice` - Dialog/speech
- `ambient` - Environmental sounds
- `ui` - Interface sounds

### Channel Control
```javascript
// Set channel volume
mixer.setChannelVolume('music', 0.7);
mixer.setChannelVolume('sfx', 1.0);

// Mute channel
mixer.muteChannel('voice', true);

// Get channel
const musicChannel = mixer.getChannel('music');
musicChannel.setVolume(0.5, 2.0); // Fade over 2 seconds
```

### Create Custom Channel
```javascript
const foleyChannel = mixer.createChannel('foley', {
    volume: 0.8,
    parent: 'sfx'  // Route through SFX bus
});
```

### Voice Ducking
Automatically lower music when dialog plays:
```javascript
// Built-in voice ducking
mixer.triggerVoiceDucking(true);  // Music ducks
mixer.triggerVoiceDucking(false); // Music returns

// Custom ducking setup
const musicChannel = mixer.getChannel('music');
const voiceChannel = mixer.getChannel('voice');

musicChannel.setupDucking(voiceChannel, {
    amount: 0.3,        // Duck to 30% volume
    attack: 0.1,        // Fade down time
    release: 0.5,       // Fade up time
    threshold: 0.1      // Trigger level
});
```

---

## Effects Chain

Add audio effects to channels:
```javascript
const sfxChannel = mixer.getChannel('sfx');

// Create effects
const lowPass = mixer.context.createBiquadFilter();
lowPass.type = 'lowpass';
lowPass.frequency.value = 5000;

const compressor = mixer.context.createDynamicsCompressor();

// Add to chain
const lpIndex = sfxChannel.addEffect(lowPass, 'lowpass');
const compIndex = sfxChannel.addEffect(compressor, 'compressor');

// Toggle effects
sfxChannel.setEffectEnabled(lpIndex, false);
```

---

## Reverb

### Load Impulse Response
```javascript
await mixer.loadReverbImpulse('/audio/ir/hall.wav');
```

### Set Reverb Mix
```javascript
mixer.setReverbMix(0.3); // 0 = dry, 1 = fully wet
```

---

## HRTF (Head-Related Transfer Function)

For enhanced 3D audio positioning:
```javascript
mixer.enableHRTF();

// Create 3D source with HRTF
const source = mixer.create3DSource({
    position: new THREE.Vector3(5, 0, 0),
    refDistance: 1,
    maxDistance: 50,
    rolloffFactor: 1,
    panningModel: 'HRTF'  // or 'equalpower'
});
```

---

## Save/Load Mixer State
```javascript
// Save current settings
const state = mixer.getState();
localStorage.setItem('audioSettings', JSON.stringify(state));

// Restore settings
const saved = JSON.parse(localStorage.getItem('audioSettings'));
mixer.setState(saved);
```

---

## Audio Best Practices

### 1. Always Resume After User Interaction
```javascript
document.addEventListener('click', () => {
    engine.audio.resume();
}, { once: true });
```

### 2. Preload Critical Sounds
```javascript
// In loading screen
await audio.preload(['/audio/gunshot.wav', '/audio/hurt.wav']);
```

### 3. Use 3D Audio for Immersion
```javascript
// Attach sounds to objects
const helicopterSound = await audio.createAudioSource(
    helicopter, '/audio/rotor.wav', { loop: true }
);
```

### 4. Enable Occlusion for Realism
```javascript
audio.setPhysicsWorld(engine.physics);
audio.setOcclusionEnabled(true);
```

### 5. Use Voice Ducking
```javascript
mixer.triggerVoiceDucking(true);
await playVoiceLine();
mixer.triggerVoiceDucking(false);
```

---

## Complete Example

```javascript
import { GameEngine, AudioMixer } from './index.js';

const engine = new GameEngine();
await engine.init(container);

// Resume audio
document.addEventListener('click', () => engine.audio.resume(), { once: true });

// Setup mixer
const mixer = new AudioMixer(engine.audio.context);
mixer.setMasterVolume(0.8);
mixer.setChannelVolume('music', 0.5);

// Load and play music
await engine.audio.playMusic('/audio/ambient.mp3', {
    volume: 0.5,
    loop: true,
    fadeIn: 3.0
});

// Setup audio occlusion
engine.audio.setPhysicsWorld(engine.physics);
engine.audio.setOcclusionEnabled(true);

// Create reverb zone for cave
engine.audio.createReverbZone({
    position: cavePosition,
    size: new THREE.Vector3(30, 10, 30),
    decay: 2.5,
    mix: 0.5
});

// In game loop
function update(dt) {
    engine.audio.update(dt);
}
```
