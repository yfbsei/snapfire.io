export class InputManager {
  constructor() {
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.isPointerLocked = false;
    this.gameElement = null;

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
        this.exitPointerLock();
      }
    });
  }

  setupMouseListeners() {
    // Mouse movement
    document.addEventListener('mousemove', (event) => {
      if (!this.isPointerLocked) return;

      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;

      if (this.onMouseMoveCallback) {
        this.onMouseMoveCallback(deltaX, deltaY);
      }
    });

    // Mouse click - handle both locked and unlocked states
    document.addEventListener('click', (event) => {
      if (this.isPointerLocked) {
        // Game is active, handle shooting
        event.preventDefault();
        if (this.onMouseClickCallback) {
          this.onMouseClickCallback(event);
        }
      } else {
        // Game not active, request pointer lock if clicking on game area
        if (this.gameElement && this.gameElement.contains(event.target)) {
          event.preventDefault();
          this.requestPointerLock(this.gameElement);
        }
      }
    });

    // Prevent context menu in game area
    document.addEventListener('contextmenu', (event) => {
      if (this.gameElement && this.gameElement.contains(event.target)) {
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
        const wasLocked = this.isPointerLocked;
        this.isPointerLocked = this.checkPointerLock();

        console.log('Pointer lock changed:', this.isPointerLocked);

        // Show/hide crosshair based on lock state
        this.updateCrosshairVisibility();

        if (this.onPointerLockChangeCallback) {
          this.onPointerLockChangeCallback(this.isPointerLocked);
        }

        // Show notification
        if (this.isPointerLocked && !wasLocked) {
          this.showPointerLockNotification('Mouse locked - Press ESC to unlock');
        } else if (!this.isPointerLocked && wasLocked) {
          this.showPointerLockNotification('Mouse unlocked - Click to lock again');
        }
      });
    });

    // Handle pointer lock error
    const errorEvents = [
      'pointerlockerror',
      'mozpointerlockerror',
      'webkitpointerlockerror'
    ];

    errorEvents.forEach(event => {
      document.addEventListener(event, () => {
        console.error('❌ Pointer lock failed');
        this.showPointerLockNotification('Failed to lock mouse - try clicking again');
      });
    });
  }

  updateCrosshairVisibility() {
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
      crosshair.style.display = this.isPointerLocked ? 'block' : 'none';
    }
  }

  showPointerLockNotification(message) {
    // Remove existing notification
    const existing = document.getElementById('pointerLockNotification');
    if (existing) {
      existing.remove();
    }

    // Create new notification
    const notification = document.createElement('div');
    notification.id = 'pointerLockNotification';
    notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300';
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }
    }, 3000);
  }

  checkPointerLock() {
    return !!(
      document.pointerLockElement ||
      document.mozPointerLockElement ||
      document.webkitPointerLockElement
    );
  }

  setGameElement(element) {
    this.gameElement = element;
    console.log('🎮 Game element set for input manager');
  }

  requestPointerLock(element) {
    if (!element) {
      console.error('❌ No element provided for pointer lock');
      return false;
    }

    console.log('🔒 Requesting pointer lock...');

    // Store reference to game element
    this.gameElement = element;

    const requestPointerLock =
      element.requestPointerLock ||
      element.mozRequestPointerLock ||
      element.webkitRequestPointerLock;

    if (requestPointerLock) {
      try {
        requestPointerLock.call(element);
        return true;
      } catch (error) {
        console.error('❌ Pointer lock request failed:', error);
        this.showPointerLockNotification('Failed to lock mouse - browser may not support it');
        return false;
      }
    } else {
      console.warn('⚠️ Pointer Lock API not supported');
      this.showPointerLockNotification('Pointer lock not supported in this browser');
      return false;
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

  getPointerLockState() {
    return this.isPointerLocked;
  }

  dispose() {
    // Remove all event listeners would require storing references
    // For now, just clear references
    this.gameElement = null;
    this.keys = {};

    console.log('🎮 Input manager disposed');
  }
}