import * as THREE from 'three';

/**
 * AudioManager - 3D positional audio system
 * Handles music, sound effects, and spatial audio
 */
export class AudioManager {
    constructor() {
        this.listener = null;
        this.context = null;

        // Audio pools
        this.musicSources = new Map();
        this.sfxSources = [];
        this.sfxPool = [];
        this.sfxPoolSize = 20;

        // Volume levels
        this.masterVolume = 1.0;
        this.musicVolume = 0.5;
        this.sfxVolume = 1.0;

        // Currently playing music
        this.currentMusic = null;

        // Reverb
        this.reverbZones = [];
        this.currentReverbZone = null;
        this.convolver = null;

        // Audio buffers cache
        this.buffers = new Map();

        // Audio occlusion
        this.occlusionEnabled = true;
        this.physicsWorld = null; // Set via setPhysicsWorld()
        this.occlusionFilter = null; // Low-pass filter for blocked sounds

        this._initialized = false;
    }

    /**
     * Initialize audio system
     * @param {THREE.Camera} camera - Camera to attach listener to
     */
    init(camera) {
        if (this._initialized) return;

        this.listener = new THREE.AudioListener();
        camera.add(this.listener);

        this.context = this.listener.context;

        // Pre-create SFX pool
        for (let i = 0; i < this.sfxPoolSize; i++) {
            const audio = new THREE.PositionalAudio(this.listener);
            audio.setRefDistance(10);
            audio.setRolloffFactor(1);
            this.sfxPool.push(audio);
        }

        this._initialized = true;
    }

    /**
     * Resume audio context (required after user interaction)
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    // ==================== Music ====================

    /**
     * Play background music
     * @param {string} path - Path to audio file
     * @param {Object} options
     */
    async playMusic(path, options = {}) {
        await this.resume();

        const buffer = await this._loadBuffer(path);

        // Stop current music
        if (this.currentMusic) {
            this.stopMusic(options.fadeOut ?? 1.0);
        }

        const audio = new THREE.Audio(this.listener);
        audio.setBuffer(buffer);
        audio.setLoop(options.loop ?? true);
        audio.setVolume((options.volume ?? 1.0) * this.musicVolume * this.masterVolume);

        this.currentMusic = {
            audio,
            path,
            baseVolume: options.volume ?? 1.0
        };

        // Fade in
        if (options.fadeIn) {
            audio.setVolume(0);
            audio.play();
            this._fade(audio, 0, this.currentMusic.baseVolume * this.musicVolume * this.masterVolume, options.fadeIn);
        } else {
            audio.play();
        }

        return audio;
    }

    /**
     * Stop current music
     * @param {number} fadeOut - Fade out duration in seconds
     */
    stopMusic(fadeOut = 0) {
        if (!this.currentMusic) return;

        const audio = this.currentMusic.audio;

        if (fadeOut > 0) {
            this._fade(audio, audio.getVolume(), 0, fadeOut, () => {
                audio.stop();
            });
        } else {
            audio.stop();
        }

        this.currentMusic = null;
    }

    /**
     * Pause music
     */
    pauseMusic() {
        if (this.currentMusic && this.currentMusic.audio.isPlaying) {
            this.currentMusic.audio.pause();
        }
    }

    /**
     * Resume music
     */
    resumeMusic() {
        if (this.currentMusic && !this.currentMusic.audio.isPlaying) {
            this.currentMusic.audio.play();
        }
    }

    // ==================== Sound Effects ====================

    /**
     * Play a sound effect
     * @param {string} path - Path to audio file
     * @param {Object} options
     * @returns {Promise<THREE.Audio>}
     */
    async playSFX(path, options = {}) {
        await this.resume();

        const buffer = await this._loadBuffer(path);

        const audio = new THREE.Audio(this.listener);
        audio.setBuffer(buffer);
        audio.setLoop(options.loop ?? false);
        audio.setVolume((options.volume ?? 1.0) * this.sfxVolume * this.masterVolume);

        if (options.playbackRate) {
            audio.setPlaybackRate(options.playbackRate);
        }

        audio.play();

        // Auto cleanup when done
        audio.onEnded = () => {
            const index = this.sfxSources.indexOf(audio);
            if (index !== -1) {
                this.sfxSources.splice(index, 1);
            }
        };

        this.sfxSources.push(audio);
        return audio;
    }

    /**
     * Play a positional (3D) sound effect
     * @param {string} path - Path to audio file
     * @param {THREE.Vector3|{x,y,z}} position - World position
     * @param {Object} options
     * @returns {Promise<THREE.PositionalAudio>}
     */
    async playSFX3D(path, position, options = {}) {
        await this.resume();

        const buffer = await this._loadBuffer(path);

        // Get audio from pool or create new
        let audio = this.sfxPool.find(a => !a.isPlaying);
        if (!audio) {
            audio = new THREE.PositionalAudio(this.listener);
            this.sfxPool.push(audio);
        }

        audio.setBuffer(buffer);
        audio.setLoop(options.loop ?? false);
        audio.setVolume((options.volume ?? 1.0) * this.sfxVolume * this.masterVolume);
        audio.setRefDistance(options.refDistance ?? 10);
        audio.setRolloffFactor(options.rolloff ?? 1);
        audio.setMaxDistance(options.maxDistance ?? 100);

        if (options.playbackRate) {
            audio.setPlaybackRate(options.playbackRate);
        }

        // Position the audio
        if (position instanceof THREE.Vector3) {
            audio.position.copy(position);
        } else {
            audio.position.set(position.x, position.y, position.z);
        }

        audio.play();

        return audio;
    }

    /**
     * Create an audio source attached to a game object
     * @param {THREE.Object3D} parent - Object to attach to
     * @param {string} path - Path to audio file
     * @param {Object} options
     * @returns {Promise<THREE.PositionalAudio>}
     */
    async createAudioSource(parent, path, options = {}) {
        const buffer = await this._loadBuffer(path);

        const audio = new THREE.PositionalAudio(this.listener);
        audio.setBuffer(buffer);
        audio.setLoop(options.loop ?? false);
        audio.setVolume((options.volume ?? 1.0) * this.sfxVolume * this.masterVolume);
        audio.setRefDistance(options.refDistance ?? 10);
        audio.setRolloffFactor(options.rolloff ?? 1);

        parent.add(audio);

        if (options.autoPlay) {
            audio.play();
        }

        return audio;
    }

    // ==================== Volume Control ====================

    /**
     * Set master volume
     * @param {number} volume - 0 to 1
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this._updateAllVolumes();
    }

    /**
     * Set music volume
     * @param {number} volume - 0 to 1
     */
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.currentMusic) {
            this.currentMusic.audio.setVolume(
                this.currentMusic.baseVolume * this.musicVolume * this.masterVolume
            );
        }
    }

    /**
     * Set SFX volume
     * @param {number} volume - 0 to 1
     */
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        // Note: Individual SFX volumes would need to be tracked to update properly
    }

    // ==================== Utility ====================

    /**
     * Stop all sounds
     */
    stopAll() {
        this.stopMusic(0);

        for (const audio of this.sfxSources) {
            if (audio.isPlaying) audio.stop();
        }
        this.sfxSources = [];

        for (const audio of this.sfxPool) {
            if (audio.isPlaying) audio.stop();
        }
    }

    /**
     * Preload audio files
     * @param {string[]} paths
     */
    async preload(paths) {
        await Promise.all(paths.map(path => this._loadBuffer(path)));
    }

    // ==================== Private ====================

    async _loadBuffer(path) {
        if (this.buffers.has(path)) {
            return this.buffers.get(path);
        }

        return new Promise((resolve, reject) => {
            const loader = new THREE.AudioLoader();
            loader.load(
                path,
                (buffer) => {
                    this.buffers.set(path, buffer);
                    resolve(buffer);
                },
                undefined,
                reject
            );
        });
    }

    _fade(audio, from, to, duration, onComplete) {
        const startTime = performance.now();

        const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(elapsed / duration, 1);

            audio.setVolume(from + (to - from) * t);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else if (onComplete) {
                onComplete();
            }
        };

        animate();
    }

    _updateAllVolumes() {
        // Update music
        if (this.currentMusic) {
            this.currentMusic.audio.setVolume(
                this.currentMusic.baseVolume * this.musicVolume * this.masterVolume
            );
        }
    }

    // ==================== Reverb Zones ====================

    /**
     * Create a reverb zone
     * @param {Object} options
     * @returns {Object} Zone definition
     */
    createReverbZone(options = {}) {
        const zone = {
            position: options.position || new THREE.Vector3(),
            size: options.size || new THREE.Vector3(10, 10, 10),
            type: 'box', // box, sphere
            irPath: options.irPath, // Impulse Response path
            mix: options.mix || 0.5,
            ...options
        };

        this.reverbZones.push(zone);
        return zone;
    }

    /**
     * Update audio system (call every frame)
     * Checks reverb zones
     */
    update(deltaTime) {
        if (!this.listener) return;

        const cameraPos = this.listener.parent.position;
        this._updateReverb(cameraPos);
    }

    async _updateReverb(position) {
        // Find active zone
        let activeZone = null;

        for (const zone of this.reverbZones) {
            // Simple Box check
            const dx = Math.abs(position.x - zone.position.x);
            const dy = Math.abs(position.y - zone.position.y);
            const dz = Math.abs(position.z - zone.position.z);

            if (dx < zone.size.x / 2 && dy < zone.size.y / 2 && dz < zone.size.z / 2) {
                activeZone = zone;
                break;
            }
        }

        if (activeZone !== this.currentReverbZone) {
            this.currentReverbZone = activeZone;

            if (activeZone && activeZone.irPath) {
                // Switching to new reverb
                try {
                    const buffer = await this._loadBuffer(activeZone.irPath);
                    this._setReverbBuffer(buffer, activeZone.mix);
                } catch (e) {
                    console.warn('Failed to load IR:', e);
                }
            } else {
                // No reverb / Dry
                this._setReverbBuffer(null, 0);
            }
        }
    }

    _setReverbBuffer(buffer, mix) {
        if (!this.convolver) {
            // Setup Convolver Graph: Source -> Dry/Wet -> Destination
            // Ideally should be set up in init() and all sources connect to it.
            // For now, assuming Global Reverb via a main bus approach would be best.
            // But Three.js AudioListener default structure is simple.
            // We'll attach convolver to Listener input if possible or assume a mix.

            this.convolver = this.context.createConvolver();
            this.convolver.connect(this.context.destination);

            // Note: Three.js Audio objects connect directly to destination or listener.context.destination.
            // To properly do reverb, we need an AudioNode graph change, which is complex for this snippet.
            // We will just set the buffer property of the listener if it supported it, but it doesn't.
            // Simplified: Just log for now as "Reverb Active".
            // A real implementation requires routing all Audio objects through a Gain -> Convolver.
        }

        if (this.convolver) {
            this.convolver.buffer = buffer;
            // Mix control would need wet/dry gain nodes.
        }
    }

    /**
     * Set physics world for audio occlusion
     * @param {PhysicsWorld} world 
     */
    setPhysicsWorld(world) {
        this.physicsWorld = world;
    }

    /**
     * Enable/disable audio occlusion
     * @param {boolean} enabled 
     */
    setOcclusionEnabled(enabled) {
        this.occlusionEnabled = enabled;
    }

    /**
     * Calculate audio occlusion between listener and sound source
     * @param {THREE.Vector3} sourcePosition 
     * @returns {number} Occlusion factor (0 = fully blocked, 1 = no obstruction)
     */
    calculateOcclusion(sourcePosition) {
        if (!this.occlusionEnabled || !this.physicsWorld || !this.listener) {
            return 1.0;
        }

        const listenerPos = this.listener.parent.position;
        const direction = sourcePosition.clone().sub(listenerPos).normalize();
        const distance = listenerPos.distanceTo(sourcePosition);

        // Raycast from listener to sound source
        const hit = this.physicsWorld.raycast(listenerPos, direction, distance);

        if (hit && hit.distance < distance - 0.1) {
            // Sound is blocked - calculate occlusion factor
            const blockageRatio = hit.distance / distance;
            return Math.max(0.2, blockageRatio); // Min 20% volume when blocked
        }

        return 1.0; // No obstruction
    }

    /**
     * Apply occlusion filter to audio source
     * @param {THREE.PositionalAudio} audio 
     * @param {number} occlusionFactor 
     */
    _applyOcclusion(audio, occlusionFactor) {
        if (!audio.source || !audio.source.mediaElement) return;

        // Create or get low-pass filter
        if (!audio.userData.occlusionFilter) {
            const filter = this.context.createBiquadFilter();
            filter.type = 'lowpass';
            audio.userData.occlusionFilter = filter;

            // Insert filter into audio graph
            audio.getFilters().push(filter);
        }

        const filter = audio.userData.occlusionFilter;

        // Adjust filter frequency based on occlusion
        // Fully blocked = low frequency (muffled)
        // No blockage = high frequency (clear)
        const maxFreq = 20000;
        const minFreq = 400;
        filter.frequency.value = minFreq + (maxFreq - minFreq) * occlusionFactor;
    }

    /**
     * Dispose all audio resources
     */
    dispose() {
        this.stopAll();
        this.buffers.clear();

        if (this.listener) {
            this.listener.parent?.remove(this.listener);
        }
    }
}

// Singleton instance
export const audioManager = new AudioManager();
