import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import './styles/main.css';

class GameApp {
  constructor() {
    this.game = null;
    this.ui = null;
    this.isInitialized = false;
    this.gameReady = false;
  }

  async init() {
    try {
      console.log('🎮 Initializing Game App...');

      // Initialize UI first
      this.ui = new UI();
      this.ui.init();

      // Set up start button event
      this.ui.onStartGame(() => this.startGame());

      this.isInitialized = true;
      console.log('✅ Game App initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize game:', error);
      if (this.ui) {
        this.ui.showError('Failed to initialize game. Please refresh the page.');
      }
    }
  }

  async startGame() {
    try {
      console.log('🚀 Starting game...');

      if (!this.isInitialized) {
        throw new Error('Game app not properly initialized');
      }

      // Show loading screen
      this.ui.showLoadingScreen();

      // Initialize game if not already done
      if (!this.game) {
        console.log('🎮 Creating new game instance...');
        this.game = new Game();
        await this.game.init();

        // Connect UI to game
        this.ui.connectToGame(this.game);
        console.log('🔗 UI connected to game');
      }

      // Hide loading screen and start screen
      this.ui.hideLoadingScreen();
      this.ui.hideStartScreen();

      // Game is now ready - waiting for user to click to lock mouse
      this.gameReady = true;

      console.log('✅ Game ready! Click in the game area to start playing');
    } catch (error) {
      console.error('❌ Failed to start game:', error);

      // Hide loading screen if shown
      this.ui.hideLoadingScreen();

      // Show error
      this.ui.showError(`Failed to start game: ${error.message}`);

      // Reset game state
      if (this.game) {
        this.game.dispose();
        this.game = null;
      }
      this.gameReady = false;
    }
  }

  handleResize() {
    if (this.game && this.game.isGameRunning()) {
      this.game.handleResize();
    }
  }

  handleError(error) {
    console.error('💥 Application error:', error);
    if (this.ui) {
      this.ui.showError('An error occurred. Check the console for details.');
    }
  }

  dispose() {
    console.log('🗑️ Disposing game app...');

    if (this.game) {
      this.game.dispose();
      this.game = null;
    }

    if (this.ui) {
      this.ui.dispose();
      this.ui = null;
    }

    this.isInitialized = false;
    this.gameReady = false;
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📄 DOM Content Loaded');

  let app = null;

  try {
    app = new GameApp();
    await app.init();

    // Handle window resize
    window.addEventListener('resize', () => {
      if (app) {
        app.handleResize();
      }
    });

    // Global error handler
    window.addEventListener('error', (event) => {
      if (app) {
        app.handleError(event.error);
      }
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('💥 Unhandled promise rejection:', event.reason);
      if (app) {
        app.handleError(event.reason);
      }
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      if (app) {
        app.dispose();
      }
    });

    console.log('🌟 Application ready');
  } catch (error) {
    console.error('💥 Critical error during app initialization:', error);

    // Show critical error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed inset-0 bg-red-900 text-white flex flex-col items-center justify-center z-50';
    errorDiv.innerHTML = `
      <h1 class="text-4xl font-bold mb-4">💥 Critical Error</h1>
      <p class="text-xl mb-4">Failed to initialize the game</p>
      <p class="text-gray-300 mb-4">${error.message}</p>
      <button onclick="window.location.reload()" class="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-bold">
        Reload Page
      </button>
    `;
    document.body.appendChild(errorDiv);
  }
});