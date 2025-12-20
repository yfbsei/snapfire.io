import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TerrainSystem } from './terrain/TerrainSystem.js';
import { PerformanceMonitor } from './core/PerformanceMonitor.js';
import { HDRISky } from './core/HDRISky.js';
import { Player } from './core/Player.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.005, 200);
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
sunLight.position.set(20, 50, 20);
scene.add(sunLight);

// Fog
// Fog (100m world now feels like 1km, so fog should be tighter)
scene.fog = new THREE.Fog(0x1a1a2e, 15, 80);

// HDRI Sky
const hdriSky = new HDRISky(scene, renderer);
hdriSky.load('/assets/HDRI/belfast_sunset_puresky_1k.hdr');

// Systems
const perfMonitor = new PerformanceMonitor(renderer).init();
const terrainSystem = new TerrainSystem(scene);
const player = new Player(scene, camera, terrainSystem);

// Camera position - free camera mode (close to tiny player)
camera.position.set(5, 5, 5);
controls.target.set(0, 0, 0);
controls.update();

// Mode toggle
let isFirstPerson = false;

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') {
        isFirstPerson = !isFirstPerson;
        controls.enabled = !isFirstPerson;
        player.setEnabled(isFirstPerson);
    }
});

// Animation loop
const clock = new THREE.Clock();
let animationId = null;

function animate() {
    animationId = requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    perfMonitor.begin();

    if (isFirstPerson) {
        player.update(deltaTime);
    } else {
        controls.update();
    }

    terrainSystem.update(camera.position, camera);
    renderer.render(scene, camera);

    perfMonitor.end();
}

// Resize handler
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// Cleanup
function disposeEngine() {
    if (animationId) cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onResize);

    player.dispose();
    terrainSystem.dispose();
    hdriSky.dispose();
    perfMonitor.dispose();
    renderer.dispose();
    renderer.forceContextLoss();

    if (renderer.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
}

window.disposeEngine = disposeEngine;

// Start
animate();
