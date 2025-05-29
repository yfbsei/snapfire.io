export class InputManager {
  constructor() {
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.isPointerLocked = false;

    // Callbacks
    this.onMouseMoveCallback = null;
    this.onMouseClickCallback = null;
    this.onPointerLockChangeCallback = null;

    this.init();
  }

  init() {
    this.setupKeyboardListeners();
    this.setupMouseListeners();
    this.setupPointerLockListeners();
    console.log('🎮 Input manager initialized');
  }

  setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
      this.keys[event.code] = true;

      // Debug: Log key presses for movement keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
        console.log('Key pressed:', event.code);
      }

      // Prevent default browser actions for game keys
      if (this.isGameKey(event.code)) {
        event.preventDefault();
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys[event.code] = false;

      // Handle special keys
      if (event.code === 'KeyR') {
        // Reload (handled in player)
      }

      if (event.code === 'Escape') {
        // Exit pointer lock
        document.exitPointerLock();
      }
    });
  }

  setupMouseListeners() {
    document.addEventListener('mousemove', (event) => {
      if (!this.isPointerLocked) return;

      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;

      if (this.onMouseMoveCallback) {
        this.onMouseMoveCallback(deltaX, deltaY);
      }
    });

    document.addEventListener('click', (event) => {
      if (!this.isPointerLocked) return;

      event.preventDefault();

      if (this.onMouseClickCallback) {
        this.onMouseClickCallback(event);
      }
    });

    // Prevent context menu
    document.addEventListener('contextmenu', (event) => {
      if (this.isPointerLocked) {
        event.preventDefault();
      }
    });
  }

  setupPointerLockListeners() {
    const events = [
      'pointerlockchange',
      'mozpointerlockchange',
      'webkitpointerlockchange'
    ];

    events.forEach(event => {
      document.addEventListener(event, () => {
        this.isPointerLocked = this.checkPointerLock();

        if (this.onPointerLockChangeCallback) {
          this.onPointerLockChangeCallback(this.isPointerLocked);
        }
      });
    });
  }

  checkPointerLock() {
    return !!(
      document.pointerLockElement ||
      document.mozPointerLockElement ||
      document.webkitPointerLockElement
    );
  }

  requestPointerLock(element) {
    if (!element) return;

    const requestPointerLock =
      element.requestPointerLock ||
      element.mozRequestPointerLock ||
      element.webkitRequestPointerLock;

    if (requestPointerLock) {
      requestPointerLock.call(element);
    } else {
      console.warn('⚠️ Pointer Lock API not supported');
    }
  }

  exitPointerLock() {
    const exitPointerLock =
      document.exitPointerLock ||
      document.mozExitPointerLock ||
      document.webkitExitPointerLock;

    if (exitPointerLock) {
      exitPointerLock.call(document);
    }
  }

  isGameKey(code) {
    const gameKeys = [
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'Space', 'ShiftLeft', 'ShiftRight',
      'KeyR', 'KeyE', 'KeyQ',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
    ];

    return gameKeys.includes(code);
  }

  // Callback setters
  onMouseMove(callback) {
    this.onMouseMoveCallback = callback;
  }

  onMouseClick(callback) {
    this.onMouseClickCallback = callback;
  }

  onPointerLockChange(callback) {
    this.onPointerLockChangeCallback = callback;
  }

  // Getters
  getKeys() {
    return { ...this.keys };
  }

  isKeyPressed(keyCode) {
    return !!this.keys[keyCode];
  }

  getMousePosition() {
    return { ...this.mouse };
  }

  dispose() {
    // Remove all event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);

    console.log('🎮 Input manager disposed');
  }
}