import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TerrainSystem } from './TerrainSystem.js';
import { PerformanceMonitor } from './performance.js';
import { HDRISky } from './HDRISky.js';
import { groundMaterial } from './ground_texture.js';
import { GrassSystem } from './assets/Foliage/grass.js';
import { Player } from './player.js';

// Setup
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance"
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(200, 400, 200);
scene.add(sunLight);

// HDRI Sky
const hdriSky = new HDRISky(scene, renderer);
hdriSky.load('/assets/HDRI/belfast_sunset_puresky_1k.hdr');

// Performance monitor
const perfMonitor = new PerformanceMonitor(renderer).init();

// Terrain System
const terrainSystem = new TerrainSystem(scene, groundMaterial);
terrainSystem.update(camera.position, camera);

// Grass System
const grassSystem = new GrassSystem(scene, terrainSystem);

camera.position.set(500, 500, 500);
controls.update();

// Initialize Player
const player = new Player(scene, camera, terrainSystem);
let isFirstPerson = false;

// Clock for DeltaTime
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    perfMonitor.begin();

    if (isFirstPerson) {
        player.update(deltaTime);
    } else {
        controls.update();
    }

    terrainSystem.update(camera.position, camera);
    grassSystem.update(camera.position, clock.getElapsedTime());
    renderer.render(scene, camera);

    perfMonitor.end();
}


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log('🚀 Terrain Engine Started');

// Real-time Sky Control
let skyExposure = 0.05;
let skyContrast = 1.0;

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'ArrowUp':
            skyExposure += 0.05;
            hdriSky.setSkyExposure(skyExposure);
            console.log(`Sky Exposure: ${skyExposure.toFixed(2)}`);
            break;
        case 'ArrowDown':
            skyExposure = Math.max(0, skyExposure - 0.05);
            hdriSky.setSkyExposure(skyExposure);
            console.log(`Sky Exposure: ${skyExposure.toFixed(2)}`);
            break;
        case 'ArrowRight':
            skyContrast += 0.05;
            hdriSky.setSkyContrast(skyContrast);
            console.log(`Sky Contrast: ${skyContrast.toFixed(2)}`);
            break;
        case 'ArrowLeft':
            skyContrast = Math.max(0.1, skyContrast - 0.05);
            hdriSky.setSkyContrast(skyContrast);
            console.log(`Sky Contrast: ${skyContrast.toFixed(2)}`);
            break;
        case 'KeyV':
            isFirstPerson = !isFirstPerson;
            controls.enabled = !isFirstPerson;
            player.setEnabled(isFirstPerson);
            console.log(`Mode: ${isFirstPerson ? 'First Person' : 'Free View'}`);
            break;
    }
});

// Global cleanup function for memory optimization
function disposeEngine() {
    console.log('🧹 Cleaning up engine resources...');

    // Dispose terrain system
    terrainSystem.dispose();

    // Dispose grass system
    grassSystem.dispose();

    // Dispose HDRI
    hdriSky.dispose();

    // Dispose performance monitor
    perfMonitor.dispose();

    // Dispose renderer
    renderer.dispose();
    renderer.forceContextLoss();

    // Clear DOM
    if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
}

// Attach to window for manual testing or HMR
window.disposeEngine = disposeEngine;

animate();

