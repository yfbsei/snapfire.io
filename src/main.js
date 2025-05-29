import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import './styles/main.css';

class GameApp {
  constructor() {
    this.game = null;
    this.ui = null;
    this.isInitialized = false;
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

      // Hide loading screen
      this.ui.hideLoadingScreen();

      // Start the game
      this.game.start();
      this.ui.hideStartScreen();

      console.log('✅ Game started successfully!');
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
    }
  }

  handleResize() {
    if (this.game && this.game.isRunning) {
      this.game.handleResize();
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📄 DOM Content Loaded');

  try {
    const app = new GameApp();
    await app.init();

    // Handle window resize
    window.addEventListener('resize', () => app.handleResize());

    // Global error handler
    window.addEventListener('error', (event) => {
      console.error('💥 Global error:', event.error);
    });

    console.log('🌟 Application ready');
  } catch (error) {
    console.error('💥 Critical error during app initialization:', error);
  }
});