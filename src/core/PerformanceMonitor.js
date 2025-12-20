import Stats from 'three/addons/libs/stats.module.js';

/**
 * Performance monitoring utility for Three.js
 * Shows FPS, MS, and MB panels side by side
 * 
 * Usage:
 *   const perfMonitor = new PerformanceMonitor(renderer).init();
 *   // In render loop:
 *   perfMonitor.begin();
 *   renderer.render(scene, camera);
 *   perfMonitor.end();
 * 
 * No need to modify this file when adding assets - it auto-tracks everything!
 */
class PerformanceMonitor {
    constructor(renderer) {
        this.renderer = renderer;
        this.statsPanels = [];
        this.enabled = true;
    }

    /**
     * Initialize all stats panels (FPS, MS, MB) side by side
     */
    init() {
        // Create container for all panels
        const container = document.createElement('div');
        container.id = 'perf-monitor';
        container.style.cssText = 'position:absolute;top:0;left:0;display:flex;z-index:10000;';
        document.body.appendChild(container);

        // Panel 0 = FPS, Panel 1 = MS, Panel 2 = MB
        for (let i = 0; i < 3; i++) {
            const stats = new Stats();
            stats.showPanel(i);
            stats.dom.style.position = 'relative';
            container.appendChild(stats.dom);
            this.statsPanels.push(stats);
        }

        // Handle keydown for detailed reporting
        this._keydownHandler = (e) => {
            if (e.key === 'p' || e.key === 'P') this.logDetailed();
        };
        window.addEventListener('keydown', this._keydownHandler);

        console.log('📊 Performance Monitor initialized (Press P for detailed stats)');
        return this;
    }

    /**
     * Call at the start of your render loop
     */
    begin() {
        for (const stats of this.statsPanels) {
            stats.begin();
        }
    }

    /**
     * Call at the end of your render loop
     */
    end() {
        for (const stats of this.statsPanels) {
            stats.end();
        }
    }

    /**
     * Log detailed renderer info to console
     */
    logDetailed() {
        if (!this.renderer) {
            console.warn('No renderer attached to PerformanceMonitor');
            return;
        }

        const info = this.renderer.info;
        console.log('%c📊 Performance Report', 'font-size: 14px; font-weight: bold; color: #00ff00');
        console.table({
            'Draw Calls': info.render.calls,
            'Triangles': info.render.triangles,
            'Points': info.render.points,
            'Lines': info.render.lines,
            'Frame': info.render.frame,
            'Geometries (memory)': info.memory.geometries,
            'Textures (memory)': info.memory.textures,
            'Shader Programs': info.programs?.length || 0
        });
    }

    /**
     * Remove stats panels and cleanup
     */
    dispose() {
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
        }
        const container = document.getElementById('perf-monitor');
        if (container) {
            container.remove();
        }
        this.statsPanels = [];
    }
}

export { PerformanceMonitor };
