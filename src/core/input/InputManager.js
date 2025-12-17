/**
 * InputManager - Unified input handling for keyboard, mouse, and gamepad
 * Designed for FPS/TPS games with pointer lock support
 */
export class InputManager {
    constructor() {
        // Key states
        this.keys = new Map();           // Current frame state
        this.keysDown = new Set();       // Just pressed this frame
        this.keysUp = new Set();         // Just released this frame

        // Mouse states
        this.mouseButtons = new Map();
        this.mouseButtonsDown = new Set();
        this.mouseButtonsUp = new Set();
        this.mousePosition = { x: 0, y: 0 };
        this.mouseDelta = { x: 0, y: 0 };
        this.mouseWheel = 0;

        // Pointer lock
        this.isPointerLocked = false;
        this.pointerLockElement = null;

        // Gamepad
        this.gamepads = new Map();
        this.gamepadDeadzone = 0.15;

        // Key bindings (action -> keys)
        this.bindings = new Map();
        this.setupDefaultBindings();

        // Event listeners bound for cleanup
        this._boundHandlers = {};

        this.enabled = true;
    }

    /**
     * Initialize input listeners
     * @param {HTMLElement} element - Element to attach listeners to
     */
    init(element = document.body) {
        this.element = element;

        // Keyboard events
        this._boundHandlers.keydown = (e) => this._onKeyDown(e);
        this._boundHandlers.keyup = (e) => this._onKeyUp(e);
        window.addEventListener('keydown', this._boundHandlers.keydown);
        window.addEventListener('keyup', this._boundHandlers.keyup);

        // Mouse events
        this._boundHandlers.mousedown = (e) => this._onMouseDown(e);
        this._boundHandlers.mouseup = (e) => this._onMouseUp(e);
        this._boundHandlers.mousemove = (e) => this._onMouseMove(e);
        this._boundHandlers.wheel = (e) => this._onWheel(e);
        this._boundHandlers.contextmenu = (e) => e.preventDefault();

        element.addEventListener('mousedown', this._boundHandlers.mousedown);
        element.addEventListener('mouseup', this._boundHandlers.mouseup);
        element.addEventListener('mousemove', this._boundHandlers.mousemove);
        element.addEventListener('wheel', this._boundHandlers.wheel);
        element.addEventListener('contextmenu', this._boundHandlers.contextmenu);

        // Pointer lock events
        this._boundHandlers.pointerlockchange = () => this._onPointerLockChange();
        document.addEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);

        // Gamepad events
        this._boundHandlers.gamepadconnected = (e) => this._onGamepadConnected(e);
        this._boundHandlers.gamepaddisconnected = (e) => this._onGamepadDisconnected(e);
        window.addEventListener('gamepadconnected', this._boundHandlers.gamepadconnected);
        window.addEventListener('gamepaddisconnected', this._boundHandlers.gamepaddisconnected);

        // Blur event - reset states when window loses focus
        this._boundHandlers.blur = () => this._onBlur();
        window.addEventListener('blur', this._boundHandlers.blur);
    }

    /**
     * Setup default key bindings for FPS/TPS games
     */
    setupDefaultBindings() {
        this.bindings.set('moveForward', ['KeyW', 'ArrowUp']);
        this.bindings.set('moveBackward', ['KeyS', 'ArrowDown']);
        this.bindings.set('moveLeft', ['KeyA', 'ArrowLeft']);
        this.bindings.set('moveRight', ['KeyD', 'ArrowRight']);
        this.bindings.set('jump', ['Space']);
        this.bindings.set('crouch', ['KeyC', 'ControlLeft']);
        this.bindings.set('sprint', ['ShiftLeft']);
        this.bindings.set('interact', ['KeyE', 'KeyF']);
        this.bindings.set('reload', ['KeyR']);
        this.bindings.set('fire', ['Mouse0']);
        this.bindings.set('aim', ['Mouse1']);
        this.bindings.set('pause', ['Escape']);
    }

    /**
     * Update - call this at the end of each frame
     */
    update() {
        // Clear per-frame states
        this.keysDown.clear();
        this.keysUp.clear();
        this.mouseButtonsDown.clear();
        this.mouseButtonsUp.clear();
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.mouseWheel = 0;

        // Poll gamepads
        this._pollGamepads();
    }

    // ==================== Keyboard ====================

    /**
     * Check if a key is currently held down
     * @param {string} key - Key code (e.g., 'KeyW', 'Space', 'ShiftLeft')
     */
    isKeyDown(key) {
        if (!this.enabled) return false;
        return this.keys.get(key) === true;
    }

    /**
     * Check if a key was just pressed this frame
     * @param {string} key - Key code
     */
    isKeyPressed(key) {
        if (!this.enabled) return false;
        return this.keysDown.has(key);
    }

    /**
     * Check if a key was just released this frame
     * @param {string} key - Key code
     */
    isKeyReleased(key) {
        if (!this.enabled) return false;
        return this.keysUp.has(key);
    }

    // ==================== Mouse ====================

    /**
     * Check if a mouse button is held down
     * @param {number} button - 0=left, 1=middle, 2=right
     */
    isMouseButtonDown(button) {
        if (!this.enabled) return false;
        return this.mouseButtons.get(button) === true;
    }

    /**
     * Check if a mouse button was just pressed
     * @param {number} button - 0=left, 1=middle, 2=right
     */
    isMouseButtonPressed(button) {
        if (!this.enabled) return false;
        return this.mouseButtonsDown.has(button);
    }

    /**
     * Check if a mouse button was just released
     * @param {number} button - 0=left, 1=middle, 2=right
     */
    isMouseButtonReleased(button) {
        if (!this.enabled) return false;
        return this.mouseButtonsUp.has(button);
    }

    /**
     * Get mouse movement since last frame
     * @returns {{x: number, y: number}}
     */
    getMouseDelta() {
        return { ...this.mouseDelta };
    }

    /**
     * Get current mouse position
     * @returns {{x: number, y: number}}
     */
    getMousePosition() {
        return { ...this.mousePosition };
    }

    /**
     * Get mouse wheel delta
     * @returns {number} Positive = scroll up, negative = scroll down
     */
    getMouseWheel() {
        return this.mouseWheel;
    }

    // ==================== Pointer Lock ====================

    /**
     * Request pointer lock (for FPS mouse look)
     * @param {HTMLElement} element - Element to lock to
     */
    requestPointerLock(element = this.element) {
        this.pointerLockElement = element;
        element.requestPointerLock();
    }

    /**
     * Exit pointer lock
     */
    exitPointerLock() {
        document.exitPointerLock();
    }

    // ==================== Actions (Bindings) ====================

    /**
     * Check if an action is active (any bound key is down)
     * @param {string} action - Action name (e.g., 'moveForward')
     */
    isActionDown(action) {
        if (!this.enabled) return false;
        const keys = this.bindings.get(action);
        if (!keys) return false;

        for (const key of keys) {
            if (key.startsWith('Mouse')) {
                const button = parseInt(key.replace('Mouse', ''));
                if (this.isMouseButtonDown(button)) return true;
            } else if (key.startsWith('Gamepad')) {
                // Handle gamepad buttons
                const buttonIndex = parseInt(key.replace('Gamepad', ''));
                if (this._isGamepadButtonDown(buttonIndex)) return true;
            } else {
                if (this.isKeyDown(key)) return true;
            }
        }
        return false;
    }

    /**
     * Check if an action was just pressed
     * @param {string} action - Action name
     */
    isActionPressed(action) {
        if (!this.enabled) return false;
        const keys = this.bindings.get(action);
        if (!keys) return false;

        for (const key of keys) {
            if (key.startsWith('Mouse')) {
                const button = parseInt(key.replace('Mouse', ''));
                if (this.isMouseButtonPressed(button)) return true;
            } else {
                if (this.isKeyPressed(key)) return true;
            }
        }
        return false;
    }

    /**
     * Bind a key to an action
     * @param {string} action - Action name
     * @param {string[]} keys - Array of key codes
     */
    bindAction(action, keys) {
        this.bindings.set(action, keys);
    }

    /**
     * Get movement input as a normalized vector
     * @returns {{x: number, z: number}} -1 to 1 for each axis
     */
    getMovementInput() {
        let x = 0, z = 0;

        if (this.isActionDown('moveForward')) z -= 1;
        if (this.isActionDown('moveBackward')) z += 1;
        if (this.isActionDown('moveLeft')) x -= 1;
        if (this.isActionDown('moveRight')) x += 1;

        // Check gamepad left stick
        const gamepadMove = this.getGamepadAxis('leftStick');
        if (Math.abs(gamepadMove.x) > 0.01 || Math.abs(gamepadMove.y) > 0.01) {
            x = gamepadMove.x;
            z = gamepadMove.y;
        }

        // Normalize diagonal movement
        const length = Math.sqrt(x * x + z * z);
        if (length > 1) {
            x /= length;
            z /= length;
        }

        return { x, z };
    }

    /**
     * Get look input (mouse delta or right stick)
     * @returns {{x: number, y: number}}
     */
    getLookInput() {
        // Check mouse delta first
        if (this.isPointerLocked && (this.mouseDelta.x !== 0 || this.mouseDelta.y !== 0)) {
            return { x: this.mouseDelta.x, y: this.mouseDelta.y };
        }

        // Fall back to gamepad right stick
        const gamepadLook = this.getGamepadAxis('rightStick');
        return { x: gamepadLook.x * 10, y: gamepadLook.y * 10 };
    }

    // ==================== Gamepad ====================

    /**
     * Get gamepad axis values
     * @param {string} stick - 'leftStick' or 'rightStick'
     * @returns {{x: number, y: number}}
     */
    getGamepadAxis(stick) {
        const gamepad = this._getFirstGamepad();
        if (!gamepad) return { x: 0, y: 0 };

        let xIndex, yIndex;
        if (stick === 'leftStick') {
            xIndex = 0;
            yIndex = 1;
        } else if (stick === 'rightStick') {
            xIndex = 2;
            yIndex = 3;
        } else {
            return { x: 0, y: 0 };
        }

        let x = gamepad.axes[xIndex] || 0;
        let y = gamepad.axes[yIndex] || 0;

        // Apply deadzone
        if (Math.abs(x) < this.gamepadDeadzone) x = 0;
        if (Math.abs(y) < this.gamepadDeadzone) y = 0;

        return { x, y };
    }

    /**
     * Get trigger value
     * @param {string} trigger - 'leftTrigger' or 'rightTrigger'
     * @returns {number} 0-1
     */
    getGamepadTrigger(trigger) {
        const gamepad = this._getFirstGamepad();
        if (!gamepad) return 0;

        // Standard gamepad mapping: LT=6, RT=7
        const index = trigger === 'leftTrigger' ? 6 : 7;
        return gamepad.buttons[index]?.value || 0;
    }

    // ==================== Private Event Handlers ====================

    _onKeyDown(e) {
        if (!this.enabled) return;

        const code = e.code;
        if (!this.keys.get(code)) {
            this.keysDown.add(code);
        }
        this.keys.set(code, true);

        // Prevent default for game keys in pointer lock mode
        if (this.isPointerLocked) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        if (!this.enabled) return;

        const code = e.code;
        this.keys.set(code, false);
        this.keysUp.add(code);
    }

    _onMouseDown(e) {
        if (!this.enabled) return;

        if (!this.mouseButtons.get(e.button)) {
            this.mouseButtonsDown.add(e.button);
        }
        this.mouseButtons.set(e.button, true);
    }

    _onMouseUp(e) {
        if (!this.enabled) return;

        this.mouseButtons.set(e.button, false);
        this.mouseButtonsUp.add(e.button);
    }

    _onMouseMove(e) {
        if (!this.enabled) return;

        this.mousePosition.x = e.clientX;
        this.mousePosition.y = e.clientY;

        // Accumulate delta (important for pointer lock)
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
    }

    _onWheel(e) {
        if (!this.enabled) return;
        this.mouseWheel = -Math.sign(e.deltaY);
    }

    _onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement === this.pointerLockElement;
    }

    _onGamepadConnected(e) {
        console.log(`Gamepad connected: ${e.gamepad.id}`);
        this.gamepads.set(e.gamepad.index, e.gamepad);
    }

    _onGamepadDisconnected(e) {
        console.log(`Gamepad disconnected: ${e.gamepad.id}`);
        this.gamepads.delete(e.gamepad.index);
    }

    _onBlur() {
        // Reset all input states when window loses focus
        this.keys.clear();
        this.mouseButtons.clear();
        this.keysDown.clear();
        this.keysUp.clear();
        this.mouseButtonsDown.clear();
        this.mouseButtonsUp.clear();
    }

    _pollGamepads() {
        // Update gamepad states from browser API
        const gamepads = navigator.getGamepads();
        for (const gp of gamepads) {
            if (gp) {
                this.gamepads.set(gp.index, gp);
            }
        }
    }

    _getFirstGamepad() {
        for (const [, gp] of this.gamepads) {
            if (gp && gp.connected) return gp;
        }
        return null;
    }

    _isGamepadButtonDown(buttonIndex) {
        const gamepad = this._getFirstGamepad();
        if (!gamepad) return false;
        return gamepad.buttons[buttonIndex]?.pressed || false;
    }

    // ==================== Cleanup ====================

    /**
     * Dispose of all event listeners
     */
    dispose() {
        window.removeEventListener('keydown', this._boundHandlers.keydown);
        window.removeEventListener('keyup', this._boundHandlers.keyup);
        window.removeEventListener('blur', this._boundHandlers.blur);
        window.removeEventListener('gamepadconnected', this._boundHandlers.gamepadconnected);
        window.removeEventListener('gamepaddisconnected', this._boundHandlers.gamepaddisconnected);

        if (this.element) {
            this.element.removeEventListener('mousedown', this._boundHandlers.mousedown);
            this.element.removeEventListener('mouseup', this._boundHandlers.mouseup);
            this.element.removeEventListener('mousemove', this._boundHandlers.mousemove);
            this.element.removeEventListener('wheel', this._boundHandlers.wheel);
            this.element.removeEventListener('contextmenu', this._boundHandlers.contextmenu);
        }

        document.removeEventListener('pointerlockchange', this._boundHandlers.pointerlockchange);

        if (this.isPointerLocked) {
            this.exitPointerLock();
        }
    }
}

// Singleton instance
export const inputManager = new InputManager();
