import * as THREE from 'three';

/**
 * AnimationController - Simplified animation management
 * Works with GLTF animations
 */
export class AnimationController {
    constructor(object, animations = []) {
        this.object = object;
        this.mixer = new THREE.AnimationMixer(object);

        // Store animations by name
        this.clips = new Map();
        this.actions = new Map();

        // Layers configuration
        // Layer 0: Base (Locomotion)
        // Layer 1: Upper Body / Override
        this.layers = [
            { name: 'Base', weight: 1.0, currentAction: null, mask: null },
            { name: 'Upper', weight: 1.0, currentAction: null, mask: null } // Usage: play('Wave', { layer: 1 })
        ];

        // Default transition settings
        this.defaultFadeDuration = 0.2;

        // Callbacks for IK
        this.postUpdateCallbacks = new Set();

        // Register animations
        for (const clip of animations) {
            this.addClip(clip);
        }
    }

    /**
     * Add an animation clip
     * @param {THREE.AnimationClip} clip
     */
    addClip(clip) {
        if (!clip) return;

        // Basic validation: ensure clip has tracks and they are valid
        if (!clip.tracks || clip.tracks.length === 0) {
            // console.warn(`Animation clip "${clip.name}" has no tracks.`);
            return;
        }

        // Check if all tracks have the necessary methods (Three.js expects createInterpolant)
        const hasInvalidTracks = clip.tracks.some(track => !track || typeof track.createInterpolant !== 'function');
        if (hasInvalidTracks) {
            console.warn(`Animation clip "${clip.name}" has invalid tracks. This might happen if models are incorrectly cloned.`);
            return;
        }

        try {
            this.clips.set(clip.name, clip);
            const action = this.mixer.clipAction(clip);
            if (action) {
                this.actions.set(clip.name, action);
            }
        } catch (error) {
            console.warn(`Failed to create AnimationAction for clip "${clip.name}":`, error);
        }
    }

    /**
     * Get an animation action by name
     * @param {string} name
     */
    getAction(name) {
        return this.actions.get(name);
    }

    /**
     * Play an animation
     * @param {string} name - Animation name
     * @param {Object} options - { layer, fade, fadeDuration, loop, speed, clamp, weight }
     */
    play(name, options = {}) {
        const action = this.actions.get(name);
        if (!action) {
            // console.warn(`Animation not found: ${name}`);
            return null;
        }

        const layerIndex = options.layer || 0;
        const layer = this.layers[layerIndex];

        if (!layer) {
            console.warn(`Layer ${layerIndex} not defined`);
            return null;
        }

        // Configure action
        action.clampWhenFinished = options.clamp ?? false;
        action.loop = options.loop ?? THREE.LoopRepeat;
        action.timeScale = options.speed ?? 1;

        // Action weight is multiplicative with layer weight
        // But Three.js action.weight is the effective weight.
        // We manage action.weight in update() or set it here if single action per layer.
        // For simplicity, we assume one active action per layer that controls that layer's output.
        // If we crossfade on a layer, we overlap.

        const targetWeight = (options.weight !== undefined ? options.weight : 1.0);
        action.setEffectiveWeight(targetWeight * layer.weight);

        if (options.startTime !== undefined) {
            action.time = options.startTime;
        }

        // Handle layer active action transition
        if (layer.currentAction && layer.currentAction !== action) {
            if (options.fade !== false) {
                // Crossfade on this layer
                const duration = options.fadeDuration ?? this.defaultFadeDuration;

                // If previous action was fading out, stop it or let crossFade handle it?
                // Three.js crossFade handles weight changes.
                action.reset();
                action.play();
                layer.currentAction.crossFadeTo(action, duration, true);
            } else {
                layer.currentAction.stop();
                action.reset().play();
            }
        } else if (!action.isRunning()) {
            action.reset().play();
        }

        layer.currentAction = action;

        return action;
    }

    /**
     * Set the master weight of a layer
     * @param {number} layerIndex 
     * @param {number} weight 0.0 to 1.0
     */
    setLayerWeight(layerIndex, weight) {
        if (this.layers[layerIndex]) {
            this.layers[layerIndex].weight = weight;
            // Update current action on this layer
            const layer = this.layers[layerIndex];
            if (layer.currentAction) {
                // We should ideally store original target action weight to multiply properly
                // For now assuming action weight is 1.0 * layer weight
                layer.currentAction.setEffectiveWeight(weight);
            }
        }
    }

    /**
     * Stop animation on a specific layer
     * @param {number} layerIndex
     * @param {number} fadeOut
     */
    stopLayer(layerIndex = 0, fadeOut = 0) {
        const layer = this.layers[layerIndex];
        if (layer && layer.currentAction) {
            if (fadeOut > 0) {
                layer.currentAction.fadeOut(fadeOut);
            } else {
                layer.currentAction.stop();
            }
            layer.currentAction = null;
        }
    }

    /**
     * Crossfade to another animation (legacy API targeting Layer 0)
     * @param {string} name - Target animation name
     * @param {number} duration - Fade duration in seconds
     */
    crossFade(name, duration = 0.2) {
        this.play(name, { fade: true, fadeDuration: duration, layer: 0 });
    }

    /**
     * Stop current animation (legacy API targeting Layer 0)
     * @param {number} fadeOut - Fade out duration
     */
    stop(fadeOut = 0) {
        this.stopLayer(0, fadeOut);
    }

    /**
     * Pause all
     */
    pause() {
        this.mixer.timeScale = 0;
    }

    /**
     * Resume all
     */
    resume() {
        this.mixer.timeScale = 1;
    }

    /**
     * Set animation speed (globally or layer 0)
     * @param {number} speed
     */
    setSpeed(speed) {
        this.mixer.timeScale = speed;
    }

    /**
     * Get current animation time (Layer 0)
     */
    getTime() {
        return this.layers[0].currentAction?.time ?? 0;
    }

    /**
     * Set current animation time (Layer 0)
     * @param {number} time
     */
    setTime(time) {
        if (this.layers[0].currentAction) {
            this.layers[0].currentAction.time = time;
        }
    }

    /**
     * Check if animation is playing
     * @param {string} name - Optional, check specific animation
     */
    isPlaying(name = null) {
        if (name) {
            const action = this.actions.get(name);
            return action?.isRunning() ?? false;
        }
        return this.layers.some(l => l.currentAction?.isRunning());
    }

    /**
     * Get all animation names
     */
    getAnimationNames() {
        return Array.from(this.clips.keys());
    }

    /**
     * Get animation duration
     * @param {string} name
     */
    getDuration(name) {
        const clip = this.clips.get(name);
        return clip?.duration ?? 0;
    }

    /**
     * Update animations - call every frame
     * @param {number} deltaTime
     */
    update(deltaTime) {
        this.mixer.update(deltaTime);

        // Execute post-update callbacks (e.g., for IK)
        for (const callback of this.postUpdateCallbacks) {
            callback(deltaTime);
        }
    }

    /**
     * Register a callback to run after animation update (for IK)
     * @param {Function} callback
     */
    registerPostUpdateCallback(callback) {
        this.postUpdateCallbacks.add(callback);
    }

    /**
     * Unregister a post-update callback
     * @param {Function} callback
     */
    unregisterPostUpdateCallback(callback) {
        this.postUpdateCallbacks.delete(callback);
    }

    /**
     * Add event listener for animation events
     * @param {string} event - 'finished', 'loop'
     * @param {Function} callback
     */
    addEventListener(event, callback) {
        this.mixer.addEventListener(event, callback);
    }

    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     */
    removeEventListener(event, callback) {
        this.mixer.removeEventListener(event, callback);
    }

    /**
     * Dispose
     */
    dispose() {
        this.mixer.stopAllAction();
        this.clips.clear();
        this.actions.clear();
    }
}

/**
 * AnimatorComponent - Component wrapper for AnimationController
 */
export class AnimatorComponent {
    constructor(gameObject, options = {}) {
        this.gameObject = gameObject;
        this.controller = null;

        // Auto-setup if object has animations
        const object = gameObject.object3D || gameObject;
        if (object.userData?.animations) {
            this.setup(object, object.userData.animations);
        }
    }

    /**
     * Setup animator with object and clips
     * @param {THREE.Object3D} object
     * @param {THREE.AnimationClip[]} clips
     */
    setup(object, clips) {
        this.controller = new AnimationController(object, clips);
    }

    /**
     * Play animation
     */
    play(name, options) {
        return this.controller?.play(name, options);
    }

    /**
     * Crossfade to animation
     */
    crossFade(name, duration) {
        this.controller?.crossFade(name, duration);
    }

    /**
     * Update - call every frame
     */
    update(deltaTime) {
        this.controller?.update(deltaTime);
    }

    /**
     * Dispose
     */
    dispose() {
        this.controller?.dispose();
    }
}
