/**
 * Script - Base class for game behaviors
 * Attach to GameObjects to add custom logic
 */
export class Script {
    constructor() {
        this.gameObject = null;
        this.engine = null;
        this.enabled = true;
        this._started = false;
    }

    /**
     * Called once when the script is first attached
     * Use for one-time initialization
     */
    awake() { }

    /**
     * Called once before the first update
     * Use for initialization that depends on other components
     */
    start() { }

    /**
     * Called every frame
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) { }

    /**
     * Called every frame after all update() calls
     * Use for camera follow, etc.
     * @param {number} deltaTime
     */
    lateUpdate(deltaTime) { }

    /**
     * Called at a fixed interval (for physics)
     * @param {number} fixedDeltaTime
     */
    fixedUpdate(fixedDeltaTime) { }

    /**
     * Called when the script or gameObject is destroyed
     */
    onDestroy() { }

    /**
     * Called when this object collides with another
     * @param {Object} collision - Collision info
     */
    onCollisionEnter(collision) { }

    /**
     * Called when collision ends
     * @param {Object} collision
     */
    onCollisionExit(collision) { }

    /**
     * Called when entering a trigger volume
     * @param {Object} other - The other collider
     */
    onTriggerEnter(other) { }

    /**
     * Called when exiting a trigger volume
     * @param {Object} other
     */
    onTriggerExit(other) { }

    // ==================== Shortcuts ====================

    /**
     * Get the transform component
     */
    get transform() {
        return this.gameObject?.transform;
    }

    /**
     * Get the input manager
     */
    get input() {
        return this.engine?.input;
    }

    /**
     * Get the audio manager
     */
    get audio() {
        return this.engine?.audio;
    }

    /**
     * Get the physics world
     */
    get physics() {
        return this.engine?.physics;
    }

    /**
     * Get a component from this gameObject
     * @param {Function} componentClass
     */
    getComponent(componentClass) {
        return this.gameObject?.getComponent(componentClass);
    }

    /**
     * Log a message with gameObject name prefix
     * @param  {...any} args
     */
    log(...args) {
        console.log(`[${this.gameObject?.name || 'Script'}]`, ...args);
    }
}

/**
 * ScriptManager - Manages all scripts in the scene
 */
export class ScriptManager {
    constructor(engine) {
        this.engine = engine;
        this.scripts = new Set();
        this.pendingStart = [];

        // Fixed update timing
        this.fixedTimeStep = 1 / 60; // 60 Hz
        this.accumulator = 0;
    }

    /**
     * Register a script
     * @param {Script} script
     * @param {Object} gameObject
     */
    register(script, gameObject) {
        script.gameObject = gameObject;
        script.engine = this.engine;

        this.scripts.add(script);

        // Call awake immediately
        try {
            script.awake();
        } catch (e) {
            console.error('Error in script awake:', e);
        }

        // Queue for start on next update
        this.pendingStart.push(script);
    }

    /**
     * Unregister a script
     * @param {Script} script
     */
    unregister(script) {
        this.scripts.delete(script);

        try {
            script.onDestroy();
        } catch (e) {
            console.error('Error in script onDestroy:', e);
        }
    }

    /**
     * Update all scripts
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // Call start on pending scripts
        for (const script of this.pendingStart) {
            if (script.enabled && !script._started) {
                try {
                    script.start();
                    script._started = true;
                } catch (e) {
                    console.error('Error in script start:', e);
                }
            }
        }
        this.pendingStart = [];

        // Fixed update accumulator
        this.accumulator += deltaTime;
        while (this.accumulator >= this.fixedTimeStep) {
            for (const script of this.scripts) {
                if (script.enabled && script._started) {
                    try {
                        script.fixedUpdate(this.fixedTimeStep);
                    } catch (e) {
                        console.error('Error in script fixedUpdate:', e);
                    }
                }
            }
            this.accumulator -= this.fixedTimeStep;
        }

        // Regular update
        for (const script of this.scripts) {
            if (script.enabled && script._started) {
                try {
                    script.update(deltaTime);
                } catch (e) {
                    console.error('Error in script update:', e);
                }
            }
        }
    }

    /**
     * Late update all scripts
     * @param {number} deltaTime
     */
    lateUpdate(deltaTime) {
        for (const script of this.scripts) {
            if (script.enabled && script._started) {
                try {
                    script.lateUpdate(deltaTime);
                } catch (e) {
                    console.error('Error in script lateUpdate:', e);
                }
            }
        }
    }

    /**
     * Dispatch collision event to scripts
     * @param {Object} gameObject
     * @param {string} eventType - 'enter' or 'exit'
     * @param {Object} collision
     */
    dispatchCollision(gameObject, eventType, collision) {
        if (!gameObject.scripts) return;

        for (const script of gameObject.scripts) {
            if (!script.enabled) continue;

            try {
                if (eventType === 'enter') {
                    script.onCollisionEnter(collision);
                } else {
                    script.onCollisionExit(collision);
                }
            } catch (e) {
                console.error('Error in collision handler:', e);
            }
        }
    }

    /**
     * Dispatch trigger event to scripts
     * @param {Object} gameObject
     * @param {string} eventType - 'enter' or 'exit'
     * @param {Object} other
     */
    dispatchTrigger(gameObject, eventType, other) {
        if (!gameObject.scripts) return;

        for (const script of gameObject.scripts) {
            if (!script.enabled) continue;

            try {
                if (eventType === 'enter') {
                    script.onTriggerEnter(other);
                } else {
                    script.onTriggerExit(other);
                }
            } catch (e) {
                console.error('Error in trigger handler:', e);
            }
        }
    }

    /**
     * Dispose all scripts
     */
    dispose() {
        for (const script of this.scripts) {
            try {
                script.onDestroy();
            } catch (e) {
                console.error('Error disposing script:', e);
            }
        }
        this.scripts.clear();
        this.pendingStart = [];
    }
}
