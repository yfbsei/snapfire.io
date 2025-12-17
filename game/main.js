/**
 * OpenWorld Explorer - Main Game Entry Point
 * A comprehensive TPS/FPS open-world game using the OpenWorld Game Engine
 */

import { Game } from './game.js';

// Wait for DOM and start game
document.addEventListener('DOMContentLoaded', async () => {
    const game = new Game();

    try {
        await game.init();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        document.getElementById('loading-text').textContent = 'Failed to load game: ' + error.message;
    }
});
