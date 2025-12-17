/**
 * AudioMixer - Professional audio routing with buses and effects
 * Provides channel groups, ducking, and real-time effects chains
 */

/**
 * AudioChannel - Single channel with volume and effects
 */
export class AudioChannel {
    constructor(context, name, options = {}) {
        this.context = context;
        this.name = name;
        this.volume = options.volume ?? 1.0;
        this.muted = false;
        this.solo = false;

        // Create audio nodes
        this.input = context.createGain();
        this.output = context.createGain();

        // Effects chain
        this.effects = [];
        this._rebuildChain();

        // Ducking
        this.duckingTarget = null;
        this.duckingAmount = 0.3;
        this.duckingAttack = 0.1;
        this.duckingRelease = 0.5;
        this._isDucking = false;
    }

    _rebuildChain() {
        // Disconnect everything
        this.input.disconnect();
        this.effects.forEach(e => {
            if (e.node) e.node.disconnect();
        });

        // Rebuild chain: input -> effects -> output
        let currentNode = this.input;

        for (const effect of this.effects) {
            if (effect.enabled && effect.node) {
                currentNode.connect(effect.node);
                currentNode = effect.node;
            }
        }

        currentNode.connect(this.output);
    }

    /**
     * Set channel volume
     * @param {number} value - 0 to 1
     * @param {number} fadeTime - Fade duration in seconds
     */
    setVolume(value, fadeTime = 0.05) {
        this.volume = Math.max(0, Math.min(1, value));
        const targetVolume = this.muted ? 0 : this.volume;

        this.output.gain.cancelScheduledValues(this.context.currentTime);
        this.output.gain.linearRampToValueAtTime(
            targetVolume,
            this.context.currentTime + fadeTime
        );
    }

    /**
     * Mute/unmute channel
     * @param {boolean} muted
     */
    setMuted(muted) {
        this.muted = muted;
        this.setVolume(this.volume);
    }

    /**
     * Add an effect to the chain
     * @param {AudioNode} effectNode
     * @param {string} name
     * @returns {number} Effect index
     */
    addEffect(effectNode, name = 'effect') {
        this.effects.push({
            node: effectNode,
            name,
            enabled: true
        });
        this._rebuildChain();
        return this.effects.length - 1;
    }

    /**
     * Enable/disable an effect
     * @param {number} index
     * @param {boolean} enabled
     */
    setEffectEnabled(index, enabled) {
        if (this.effects[index]) {
            this.effects[index].enabled = enabled;
            this._rebuildChain();
        }
    }

    /**
     * Setup ducking (this channel ducks when target plays)
     * @param {AudioChannel} targetChannel
     * @param {Object} options
     */
    setupDucking(targetChannel, options = {}) {
        this.duckingTarget = targetChannel;
        this.duckingAmount = options.amount ?? 0.3;
        this.duckingAttack = options.attack ?? 0.1;
        this.duckingRelease = options.release ?? 0.5;
    }

    /**
     * Trigger ducking
     * @param {boolean} shouldDuck
     */
    duck(shouldDuck) {
        if (shouldDuck === this._isDucking) return;
        this._isDucking = shouldDuck;

        const targetVolume = shouldDuck
            ? this.volume * this.duckingAmount
            : (this.muted ? 0 : this.volume);
        const fadeTime = shouldDuck ? this.duckingAttack : this.duckingRelease;

        this.output.gain.cancelScheduledValues(this.context.currentTime);
        this.output.gain.linearRampToValueAtTime(
            targetVolume,
            this.context.currentTime + fadeTime
        );
    }

    /**
     * Connect to destination
     * @param {AudioNode} destination
     */
    connect(destination) {
        this.output.connect(destination);
    }

    /**
     * Dispose channel
     */
    dispose() {
        this.input.disconnect();
        this.output.disconnect();
        this.effects.forEach(e => {
            if (e.node) e.node.disconnect();
        });
    }
}

/**
 * AudioMixer - Main mixer with multiple channels
 */
export class AudioMixer {
    constructor(context = null) {
        // Create or use existing AudioContext
        this.context = context ?? new (window.AudioContext || window.webkitAudioContext)();

        // Master output
        this.master = new AudioChannel(this.context, 'master');
        this.master.connect(this.context.destination);

        // Channel groups
        this.channels = new Map();

        // Create default channels
        this._createDefaultChannels();

        // Convolution reverb
        this.reverbBuffer = null;
        this.reverbNode = null;
        this.reverbMix = 0.3;

        // Compressor for master
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        // HRTF for spatial audio
        this.hrtfEnabled = false;
        this.panner = null;
    }

    _createDefaultChannels() {
        // Music channel
        const music = this.createChannel('music', { volume: 0.7 });

        // SFX channel
        const sfx = this.createChannel('sfx', { volume: 1.0 });

        // Voice/dialogue channel
        const voice = this.createChannel('voice', { volume: 1.0 });

        // Ambient channel
        const ambient = this.createChannel('ambient', { volume: 0.5 });

        // UI sounds
        const ui = this.createChannel('ui', { volume: 0.8 });

        // Setup ducking: music ducks when voice plays
        music.setupDucking(voice, {
            amount: 0.3,
            attack: 0.1,
            release: 0.5
        });
    }

    /**
     * Create a new audio channel
     * @param {string} name
     * @param {Object} options
     * @returns {AudioChannel}
     */
    createChannel(name, options = {}) {
        if (this.channels.has(name)) {
            console.warn(`AudioMixer: Channel "${name}" already exists`);
            return this.channels.get(name);
        }

        const channel = new AudioChannel(this.context, name, options);
        channel.connect(this.master.input);
        this.channels.set(name, channel);
        return channel;
    }

    /**
     * Get a channel by name
     * @param {string} name
     * @returns {AudioChannel}
     */
    getChannel(name) {
        return this.channels.get(name);
    }

    /**
     * Set master volume
     * @param {number} value
     */
    setMasterVolume(value) {
        this.master.setVolume(value);
    }

    /**
     * Set channel volume
     * @param {string} channelName
     * @param {number} value
     */
    setChannelVolume(channelName, value) {
        const channel = this.channels.get(channelName);
        if (channel) {
            channel.setVolume(value);
        }
    }

    /**
     * Mute a channel
     * @param {string} channelName
     * @param {boolean} muted
     */
    muteChannel(channelName, muted) {
        const channel = this.channels.get(channelName);
        if (channel) {
            channel.setMuted(muted);
        }
    }

    /**
     * Trigger voice ducking on music
     * @param {boolean} isDucking
     */
    triggerVoiceDucking(isDucking) {
        const music = this.channels.get('music');
        if (music) {
            music.duck(isDucking);
        }
    }

    /**
     * Load and set reverb impulse response
     * @param {string} url - URL to impulse response audio file
     */
    async loadReverbImpulse(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.reverbBuffer = await this.context.decodeAudioData(arrayBuffer);
            this._setupReverb();
        } catch (error) {
            console.error('AudioMixer: Failed to load reverb impulse:', error);
        }
    }

    _setupReverb() {
        if (this.reverbNode) {
            this.reverbNode.disconnect();
        }

        if (this.reverbBuffer) {
            this.reverbNode = this.context.createConvolver();
            this.reverbNode.buffer = this.reverbBuffer;

            // Create wet/dry mix
            const reverbGain = this.context.createGain();
            reverbGain.gain.value = this.reverbMix;

            this.reverbNode.connect(reverbGain);
            reverbGain.connect(this.master.input);
        }
    }

    /**
     * Set reverb mix level
     * @param {number} mix - 0 = dry, 1 = fully wet
     */
    setReverbMix(mix) {
        this.reverbMix = Math.max(0, Math.min(1, mix));
        this._setupReverb();
    }

    /**
     * Enable HRTF spatial audio
     * Note: Requires HRTF impulse responses or browser support
     */
    enableHRTF() {
        this.hrtfEnabled = true;
        console.log('AudioMixer: HRTF enabled (browser native implementation)');
    }

    /**
     * Create a 3D audio source with HRTF
     * @param {Object} options
     * @returns {PannerNode}
     */
    create3DSource(options = {}) {
        const panner = this.context.createPanner();

        // Distance model
        panner.distanceModel = options.distanceModel ?? 'inverse';
        panner.refDistance = options.refDistance ?? 1;
        panner.maxDistance = options.maxDistance ?? 10000;
        panner.rolloffFactor = options.rolloffFactor ?? 1;

        // Cone for directional sounds
        panner.coneInnerAngle = options.coneInnerAngle ?? 360;
        panner.coneOuterAngle = options.coneOuterAngle ?? 360;
        panner.coneOuterGain = options.coneOuterGain ?? 0;

        // HRTF if available
        if (this.hrtfEnabled) {
            panner.panningModel = 'HRTF';
        } else {
            panner.panningModel = 'equalpower';
        }

        return panner;
    }

    /**
     * Resume audio context (required after user interaction)
     */
    async resume() {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Get mixer state for saving
     * @returns {Object}
     */
    getState() {
        const channelStates = {};
        this.channels.forEach((channel, name) => {
            channelStates[name] = {
                volume: channel.volume,
                muted: channel.muted
            };
        });

        return {
            masterVolume: this.master.volume,
            channels: channelStates,
            reverbMix: this.reverbMix
        };
    }

    /**
     * Restore mixer state
     * @param {Object} state
     */
    setState(state) {
        if (state.masterVolume !== undefined) {
            this.setMasterVolume(state.masterVolume);
        }

        if (state.channels) {
            Object.entries(state.channels).forEach(([name, channelState]) => {
                const channel = this.channels.get(name);
                if (channel) {
                    channel.setVolume(channelState.volume);
                    channel.setMuted(channelState.muted);
                }
            });
        }

        if (state.reverbMix !== undefined) {
            this.setReverbMix(state.reverbMix);
        }
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.channels.forEach(channel => channel.dispose());
        this.channels.clear();
        this.master.dispose();

        if (this.reverbNode) {
            this.reverbNode.disconnect();
        }

        this.context.close();
    }
}

export default AudioMixer;
