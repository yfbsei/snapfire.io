/**
 * FPSCounter - High-precision frame rate counter
 * Tracks FPS with rolling average and provides performance metrics
 */

export class FPSCounter {
    constructor(sampleSize = 60) {
        this.sampleSize = sampleSize;
        this.frameTimes = [];
        this.lastTime = performance.now();
        this.fps = 60;
        this.frameTime = 16.67;
        this.minFPS = Infinity;
        this.maxFPS = 0;
        this.avgFPS = 60;

        // Update DOM elements cache
        this.fpsElement = document.getElementById('fps-value');
        this.frameTimeElement = document.getElementById('frame-time');
    }

    /**
     * Call this every frame to update FPS calculations
     */
    update() {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        // Add to samples
        this.frameTimes.push(delta);

        // Keep only last N samples
        if (this.frameTimes.length > this.sampleSize) {
            this.frameTimes.shift();
        }

        // Calculate average frame time
        const avgFrameTime = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;

        // Calculate FPS
        this.frameTime = avgFrameTime;
        this.fps = Math.round(1000 / avgFrameTime);

        // Track min/max
        this.minFPS = Math.min(this.minFPS, this.fps);
        this.maxFPS = Math.max(this.maxFPS, this.fps);

        // Update DOM
        this._updateDisplay();
    }

    _updateDisplay() {
        if (this.fpsElement) {
            this.fpsElement.textContent = this.fps;

            // Color coding based on performance
            if (this.fps >= 55) {
                this.fpsElement.className = 'fps-value';
            } else if (this.fps >= 30) {
                this.fpsElement.className = 'fps-value medium';
            } else {
                this.fpsElement.className = 'fps-value low';
            }
        }

        if (this.frameTimeElement) {
            this.frameTimeElement.textContent = this.frameTime.toFixed(1);
        }
    }

    /**
     * Get current FPS
     * @returns {number}
     */
    getFPS() {
        return this.fps;
    }

    /**
     * Get frame time in milliseconds
     * @returns {number}
     */
    getFrameTime() {
        return this.frameTime;
    }

    /**
     * Get performance stats object
     * @returns {Object}
     */
    getStats() {
        return {
            fps: this.fps,
            frameTime: this.frameTime,
            minFPS: this.minFPS,
            maxFPS: this.maxFPS
        };
    }

    /**
     * Reset statistics
     */
    reset() {
        this.frameTimes = [];
        this.minFPS = Infinity;
        this.maxFPS = 0;
    }
}
