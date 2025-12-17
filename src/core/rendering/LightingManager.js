import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/**
 * LightingManager - Manages scene lighting and High-Quality Shadows (CSM)
 * Provides centralized control for Day/Night cycles and Shadow quality
 */
export class LightingManager {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.camera = engine.camera;
        this.renderer = engine.renderer;

        this.csm = null;
        this.sun = null;
        this.ambient = null;

        // Defaults - CSM disabled by default to avoid texture unit exhaustion on limited GPUs
        this.options = {
            csm: false, // Disabled by default - uses too many texture units
            cascades: 2, // Reduced from 4 to save texture units
            maxFar: 500,
            mode: 'practical',
            shadowMapSize: 1024, // Reverted to 1024 as requested
            lightColor: 0xffffff,
            lightIntensity: 2.0, // Brighter Sun
            skyColor: 0xffffff, // Hemi Sky
            groundColor: 0x444444, // Hemi Ground (Darker)
            ambientIntensity: 0.6 // Overall Ambient
        };

        this.init();
    }

    init() {
        // 1. Hemisphere Light (Realistic Ambient)
        // Replaces flat AmbientLight with a gradient (Sky Color -> Ground Color)
        this.ambient = new THREE.HemisphereLight(
            0x87CEEB, // Sky Color (Light Blue)
            0x2f4f2f, // Ground Color (Dark Green/Earth)
            this.options.ambientIntensity
        );
        this.scene.add(this.ambient);

        // 2. Setup Sun (Directional Light) with CSM
        if (this.options.csm) {
            this._setupCSM();
        } else {
            this._setupSimpleLight();
        }
    }

    _setupCSM() {
        // CSM handles the directional light creation internally
        this.csm = new CSM({
            maxFar: this.options.maxFar,
            cascades: this.options.cascades,
            mode: this.options.mode,
            parent: this.scene,
            shadowMapSize: this.options.shadowMapSize,
            lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
            camera: this.camera,
            lightIntensity: this.options.lightIntensity
        });

        // Store reference to the internal light
        if (this.csm.lights && this.csm.lights.length > 0) {
            this.sun = this.csm.lights[0];
            // Tuned Bias for CSM
            this.sun.shadow.bias = -0.00005;
        }

        // console.log('LightingManager: CSM Initialized');
    }

    _setupSimpleLight() {
        this.sun = new THREE.DirectionalLight(this.options.lightColor, this.options.lightIntensity);
        this.sun.position.set(50, 100, 50);
        this.sun.castShadow = true;

        // High Quality shadow settings
        this.sun.shadow.mapSize.width = this.options.shadowMapSize;
        this.sun.shadow.mapSize.height = this.options.shadowMapSize;
        this.sun.shadow.camera.near = 0.5;
        this.sun.shadow.camera.far = 500;
        this.sun.shadow.camera.left = -100;
        this.sun.shadow.camera.right = 100;
        this.sun.shadow.camera.top = 100;
        this.sun.shadow.camera.bottom = -100;

        // Bias to reduce shadow acne
        this.sun.shadow.bias = -0.00005;
        this.sun.shadow.normalBias = 0.02; // Helps with self-shadowing on curved surfaces

        this.scene.add(this.sun);
        // console.log('LightingManager: Simple Light Initialized');
    }

    /**
     * Add materials to CSM system so they receive shadows correctly
     * @param {THREE.Material[]} materials 
     */
    setupMaterials(materials) {
        if (this.csm) {
            materials.forEach(mat => this.csm.setupMaterial(mat));
        }
    }

    /**
     * Set Time of Day (Simulated)
     * @param {number} time 0-1 (0 = start, 0.5 = noon, 1 = end)
     */
    setTimeOfDay(time) {
        // Simple orbital rotation
        const angle = time * Math.PI; // 0 to PI
        const radius = 100;

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const direction = new THREE.Vector3(x, y, -50).normalize().negate();

        if (this.csm) {
            this.csm.lightDirection = direction;
        } else if (this.sun) {
            this.sun.position.copy(direction.negate().multiplyScalar(100));
        }
    }

    update() {
        if (this.csm) {
            this.csm.update();
        }
    }

    dispose() {
        if (this.csm) {
            this.csm.dispose();
            this.csm = null;
        }
        if (this.sun) {
            this.scene.remove(this.sun);
        }
        if (this.ambient) {
            this.scene.remove(this.ambient);
        }
    }
}
