import * as THREE from 'three';
// CSM import removed - sun and shadows disabled to eliminate light hotspot artifacts

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
        // Only Hemisphere Light (Realistic Ambient) - NO directional sun to avoid light hotspots
        this.ambient = new THREE.HemisphereLight(
            0x87CEEB, // Sky Color (Light Blue)
            0x2f4f2f, // Ground Color (Dark Green/Earth)
            this.options.ambientIntensity
        );
        this.scene.add(this.ambient);

        // SUN AND SHADOWS COMPLETELY REMOVED - they caused light hotspot artifacts
        this.sun = null;
        this.csm = null;
    }

    // CSM and DirectionalLight removed - no longer needed

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
