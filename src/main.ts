import { App } from './App';

// Get canvas element
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading') as HTMLDivElement;

if (!canvas) {
    throw new Error('Canvas element not found');
}

// Initialize and start the application
async function init() {
    try {
        const app = new App(canvas);
        await app.init();

        // Hide loading screen
        if (loadingEl) {
            loadingEl.classList.add('hidden');
        }

        console.log('✅ Application initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        if (loadingEl) {
            loadingEl.innerHTML = `
        <div style="color: #ff6b6b;">
          <strong>Error:</strong> ${error instanceof Error ? error.message : 'Unknown error'}
        </div>
      `;
        }
    }
}

init();
