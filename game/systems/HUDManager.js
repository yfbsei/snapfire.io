/**
 * HUDManager - Manages all HUD elements and updates
 * Handles player stats, camera mode, time/weather display, minimap, etc.
 */

export class HUDManager {
    constructor(game) {
        this.game = game;

        // Cache DOM elements
        this.elements = {
            // FPS & Performance
            fpsValue: document.getElementById('fps-value'),
            drawCalls: document.getElementById('draw-calls'),
            triangles: document.getElementById('triangles'),
            frameTime: document.getElementById('frame-time'),

            // Player stats
            healthFill: document.getElementById('health-fill'),
            healthText: document.getElementById('health-text'),
            staminaFill: document.getElementById('stamina-fill'),

            // Camera
            modeValue: document.getElementById('mode-value'),

            // Time & Weather
            timeValue: document.getElementById('time-value'),
            weatherIcon: document.getElementById('weather-icon'),

            // Collectibles
            collectibleValue: document.getElementById('collectible-value'),

            // Minimap
            compassDirection: document.getElementById('compass-direction'),
            minimapPlayer: document.querySelector('.minimap-player')
        };

        // Weather icons mapping
        this.weatherIcons = {
            'clear': '☀️',
            'cloudy': '☁️',
            'rain': '🌧️',
            'storm': '⛈️'
        };

        // Compass directions
        this.compassDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    }

    update() {
        this._updatePlayerStats();
        this._updateCameraMode();
        this._updateTimeWeather();
        this._updateCollectibles();
        this._updateMinimap();
        this._updatePerformanceStats();
    }

    _updatePlayerStats() {
        const { healthFill, healthText, staminaFill } = this.elements;

        // Health
        const healthPercent = Math.max(0, Math.min(100, this.game.playerHealth));
        if (healthFill) {
            healthFill.style.width = `${healthPercent}%`;
        }
        if (healthText) {
            healthText.textContent = Math.round(healthPercent);
        }

        // Stamina
        const staminaPercent = Math.max(0, Math.min(100, this.game.playerStamina));
        if (staminaFill) {
            staminaFill.style.width = `${staminaPercent}%`;
        }
    }

    _updateCameraMode() {
        const { modeValue } = this.elements;
        if (!modeValue || !this.game.playerScript) return;

        const mode = this.game.playerScript.cameraMode || 'fps';
        modeValue.textContent = mode.toUpperCase();
    }

    _updateTimeWeather() {
        const { timeValue, weatherIcon } = this.elements;

        if (!this.game.weather) return;

        // Time
        if (timeValue) {
            timeValue.textContent = this.game.weather.getTimeString();
        }

        // Weather icon
        if (weatherIcon) {
            const weather = this.game.weather.currentWeather || 'clear';
            weatherIcon.textContent = this.weatherIcons[weather] || '☀️';
        }
    }

    _updateCollectibles() {
        const { collectibleValue } = this.elements;
        if (collectibleValue) {
            collectibleValue.textContent = this.game.collectiblesCount;
        }
    }

    _updateMinimap() {
        const { compassDirection, minimapPlayer } = this.elements;

        if (!this.game.player) return;

        // Get player rotation for compass
        const playerRotation = this.game.player.transform.rotation.y || 0;

        // Camera rotation if available
        let cameraRotation = 0;
        if (this.game.engine.cameraController) {
            cameraRotation = this.game.engine.cameraController.yaw || 0;
        }

        // Calculate compass direction (convert radians to index)
        const angle = ((-cameraRotation + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const index = Math.round(angle / (Math.PI / 4)) % 8;

        if (compassDirection) {
            compassDirection.textContent = this.compassDirections[index];
        }

        // Rotate minimap player indicator
        if (minimapPlayer) {
            const rotDegrees = (cameraRotation * 180 / Math.PI);
            minimapPlayer.style.transform = `translate(-50%, -50%) rotate(${rotDegrees}deg)`;
        }
    }

    _updatePerformanceStats() {
        const { drawCalls, triangles } = this.elements;

        if (!this.game.engine || !this.game.engine.renderer) return;

        const info = this.game.engine.renderer.info;

        if (drawCalls && info.render) {
            drawCalls.textContent = info.render.calls || 0;
        }

        if (triangles && info.render) {
            const triCount = info.render.triangles || 0;
            triangles.textContent = triCount > 1000
                ? (triCount / 1000).toFixed(1) + 'K'
                : triCount;
        }
    }

    /**
     * Show a notification message
     * @param {string} message 
     * @param {string} type - 'info', 'success', 'warning', 'error'
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    /**
     * Update health display directly
     * @param {number} health - 0 to 100
     */
    setHealth(health) {
        this.game.playerHealth = Math.max(0, Math.min(100, health));
    }

    /**
     * Update stamina display directly
     * @param {number} stamina - 0 to 100
     */
    setStamina(stamina) {
        this.game.playerStamina = Math.max(0, Math.min(100, stamina));
    }

    /**
     * Add to collectibles count
     * @param {number} amount 
     */
    addCollectible(amount = 1) {
        this.game.collectiblesCount += amount;
    }
}
