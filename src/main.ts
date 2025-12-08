import { Engine } from '@babylonjs/core/Engines/engine';
import { createScene } from './game/scene';

// Get canvas element
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

// Create Babylon engine
const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    disableWebGL2Support: false
});

// Initialize scene
let loadingProgress = 0;

const updateLoadingProgress = (progress: number) => {
    loadingProgress = progress;
    const progressBar = document.getElementById('loadingProgress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
};

// Create the scene
createScene(engine, canvas, updateLoadingProgress).then((scene) => {
    // Hide loading screen
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }

    // Run render loop
    engine.runRenderLoop(() => {
        scene.render();

        // Update debug info
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            const fps = engine.getFps().toFixed(0);
            const camera = scene.activeCamera;
            const pos = camera?.position;

            debugInfo.innerHTML = `
        FPS: ${fps}<br>
        Camera: ${pos ? `X: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}` : 'N/A'}
      `;
        }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        engine.resize();
    });
});
