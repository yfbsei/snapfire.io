export class UI {
  constructor() {
    this.game = null;
    this.elements = {};
    this.startGameCallback = null;
  }

  init() {
    this.cacheElements();
    this.setupEventListeners();
    this.updateStartScreen();
    console.log('🎨 UI initialized');
  }

  cacheElements() {
    this.elements = {
      startScreen: document.getElementById('startScreen'),
      startButton: document.getElementById('startButton'),
      gameContainer: document.getElementById('gameContainer'),
      crosshair: document.getElementById('crosshair'),
      hud: document.getElementById('hud'),
      health: document.getElementById('health'),
      ammo: document.getElementById('ammo'),
      position: document.getElementById('position'),
      instructions: document.getElementById('instructions')
    };
  }

  setupEventListeners() {
    if (this.elements.startButton) {
      this.elements.startButton.addEventListener('click', () => {
        if (this.startGameCallback) {
          this.startGameCallback();
        }
      });
    }

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.game.isGameRunning()) {
        // When tab is hidden, exit pointer lock which will pause the game
        document.exitPointerLock();
      }
    });
  }

  updateStartScreen() {
    if (this.elements.startScreen) {
      this.elements.startScreen.innerHTML = `
        <h1 class="text-6xl font-black mb-4 text-transparent bg-gradient-to-r from-game-primary to-game-secondary bg-clip-text">
          OPEN WORLD FPS
        </h1>
        <p class="text-xl mb-4 text-gray-300">Click START to initialize the game</p>
        <p class="text-sm mb-8 text-gray-400">Then click anywhere in the game area to lock mouse and play</p>
        <button id="startButton" class="px-8 py-4 bg-game-primary hover:bg-green-400 text-black font-bold text-xl rounded-lg transition-all duration-200 transform hover:scale-105 game-button">
          START GAME
        </button>
      `;

      // Re-cache the new button
      this.elements.startButton = document.getElementById('startButton');
      if (this.elements.startButton) {
        this.elements.startButton.addEventListener('click', () => {
          if (this.startGameCallback) {
            this.startGameCallback();
          }
        });
      }
    }
  }

  onStartGame(callback) {
    this.startGameCallback = callback;
  }

  connectToGame(game) {
    this.game = game;
  }

  hideStartScreen() {
    if (this.elements.startScreen) {
      this.elements.startScreen.style.display = 'none';
    }

    // Show initial instruction
    this.showNotification('Click anywhere in the game area to lock mouse and start playing!', 'info');
  }

  showStartScreen() {
    if (this.elements.startScreen) {
      this.elements.startScreen.style.display = 'flex';
    }
  }

  showGameOverScreen() {
    this.showStartScreen();

    if (this.elements.startScreen) {
      this.elements.startScreen.innerHTML = `
        <h1 class="text-6xl font-black mb-4 text-transparent bg-gradient-to-r from-red-600 to-red-800 bg-clip-text">
          GAME OVER
        </h1>
        <p class="text-xl mb-8 text-gray-300">You have been eliminated!</p>
        <div class="flex gap-4">
          <button id="restartButton" class="px-8 py-4 bg-game-primary hover:bg-green-400 text-black font-bold text-xl rounded-lg transition-all duration-200 transform hover:scale-105 game-button">
            RESTART
          </button>
          <button id="menuButton" class="px-8 py-4 bg-gray-600 hover:bg-gray-500 text-white font-bold text-xl rounded-lg transition-all duration-200 transform hover:scale-105 game-button">
            MAIN MENU
          </button>
        </div>
      `;

      document.getElementById('restartButton').addEventListener('click', () => {
        window.location.reload();
      });

      document.getElementById('menuButton').addEventListener('click', () => {
        window.location.reload();
      });
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    errorDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-xl">⚠️</span>
        <span>${message}</span>
        <button class="ml-4 text-xl hover:text-gray-300" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    document.body.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.remove();
      }
    }, 5000);
  }

  showNotification(message, type = 'info') {
    const colors = {
      info: 'bg-blue-600',
      success: 'bg-green-600',
      warning: 'bg-yellow-600',
      error: 'bg-red-600'
    };

    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    const notificationDiv = document.createElement('div');
    notificationDiv.className = `fixed top-4 left-1/2 transform -translate-x-1/2 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300`;
    notificationDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <span>${icons[type]}</span>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(notificationDiv);

    // Slide in animation
    setTimeout(() => {
      notificationDiv.style.transform = 'translate(-50%, 0)';
    }, 100);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notificationDiv.style.transform = 'translate(-50%, -100px)';
      notificationDiv.style.opacity = '0';

      setTimeout(() => {
        if (notificationDiv.parentElement) {
          notificationDiv.remove();
        }
      }, 300);
    }, 3000);
  }

  updateHealth(health, maxHealth = 100) {
    if (this.elements.health) {
      this.elements.health.textContent = health;

      // Color coding for health
      const healthPercent = health / maxHealth;
      if (healthPercent > 0.6) {
        this.elements.health.className = 'font-bold text-green-400';
      } else if (healthPercent > 0.3) {
        this.elements.health.className = 'font-bold text-yellow-400';
      } else {
        this.elements.health.className = 'font-bold text-red-400';
      }
    }
  }

  updateAmmo(current, max) {
    if (this.elements.ammo) {
      this.elements.ammo.textContent = current;

      // Color coding for ammo
      const ammoPercent = current / max;
      if (ammoPercent > 0.3) {
        this.elements.ammo.className = 'font-bold text-white';
      } else {
        this.elements.ammo.className = 'font-bold text-red-400';
      }
    }
  }

  updatePosition(x, y, z) {
    if (this.elements.position) {
      this.elements.position.textContent = `${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}`;
    }
  }

  showLoadingScreen() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingScreen';
    loadingDiv.className = 'fixed inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center z-50';
    loadingDiv.innerHTML = `
      <div class="loading-spinner mb-4"></div>
      <h2 class="text-2xl font-bold mb-2">Loading Game...</h2>
      <p class="text-gray-400">Generating world and initializing systems</p>
    `;

    document.body.appendChild(loadingDiv);
  }

  hideLoadingScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
      loadingScreen.remove();
    }
  }

  toggleInstructions() {
    if (this.elements.instructions) {
      const isVisible = this.elements.instructions.style.display !== 'none';
      this.elements.instructions.style.display = isVisible ? 'none' : 'block';
    }
  }

  dispose() {
    // Remove any created elements
    const dynamicElements = document.querySelectorAll('[id*="notification"], [id*="error"], #loadingScreen, #pointerLockNotification');
    dynamicElements.forEach(el => el.remove());

    console.log('🎨 UI disposed');
  }
}