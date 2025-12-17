import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * SkySystem - Manages Day/Night cycle and Atmospheric Scattering
 * Controls Sun position, Sky color, and Environment lighting
 */
export class SkySystem {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.scene = engine.scene;
        this.renderer = engine.renderer;
        this.camera = engine.camera;

        // Configuration
        this.time = options.startTime || 0.5; // 0.0 to 1.0 (0.5 = Noon)
        this.timeScale = options.timeScale || 0.0; // 0 = Static, >0 = Dynamic
        this.sunRadius = options.sunRadius || 1000;

        // Components
        this.sky = null;
        this.sunPosition = new THREE.Vector3();

        // State
        this.isReady = false;
        this.pmremGenerator = null;
        this.envMapDirty = true; // Force initial update

        this.init();
    }

    init() {
        // Create Sky object
        this.sky = new Sky();
        this.sky.scale.setScalar(450000); // Standard Three.js scale
        this.scene.add(this.sky);

        // Configure Sky uniforms
        const uniforms = this.sky.material.uniforms;
        uniforms['turbidity'].value = 10;
        uniforms['rayleigh'].value = 3;
        uniforms['mieCoefficient'].value = 0.005;
        uniforms['mieDirectionalG'].value = 0.7;

        this.isReady = true;

        // Initial update
        this.updateTime(0);
        // console.log('SkySystem: Initialized');
    }

    /**
     * Update the system (call every frame)
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        if (!this.isReady) return;

        if (this.timeScale > 0) {
            this.updateTime(deltaTime * this.timeScale);
        } else {
            // Even if static time, we might need to update if camera moved significantly? 
            // Usually Sky shader handles camera relative internally via matrix but sun pos is absolute.
            // We force update sun position in case it was changed externally.
            this._updateSunPosition();
        }
    }

    /**
     * Advance time of day
     * @param {number} delta Amount to advance time (0-1 scale, where 1 = 24 hours)
     */
    updateTime(delta) {
        this.time += delta;
        if (this.time > 1.0) this.time -= 1.0;

        this._updateSunPosition();
        this._updateLighting();
        this.envMapDirty = true; // Request IBL update
    }

    _updateSunPosition() {
        // Calculate sun position based on time
        // 0 = Midnight/Sunrise? 
        // Let's say 0.25 = Sunrise, 0.5 = Noon, 0.75 = Sunset

        // Convert time (0-1) to angle (0-2PI)
        // Shift so 0.5 is PI/2 (90 deg altitude)
        // Time 0.5 -> Angle PI/2
        // Time 0 -> Angle -PI/2

        const phi = 2 * Math.PI * (this.time - 0.5); // -PI to PI
        const theta = Math.PI * 0.5; // Fixed azimuth for now (East-West) or could rotate

        // Cartesian conversion
        // Elevation is controlled by phi.
        // At 0.5 (Noon), phi = 0? Wait.
        // Standard Sky shader uses different coords.

        // Let's use simple logic:
        // Angle from horizon.
        // 0.5 (Noon) -> 90 deg elevation.
        // 0.0 (Midnight) -> -90 deg.

        // theta 0 to PI (elevation from North Pole?)
        // phi 0 to 2PI (azimuth)

        // Simple orbital logic:
        // Rotate around Z axis?

        // Noon (0.5) -> High Y
        // Sunset (0.75) -> Low Y, Positive X
        // Sunrise (0.25) -> Low Y, Negative X

        const angle = (this.time - 0.25) * 2 * Math.PI; // 0 at sunrise
        // 0 = Sunrise, PI/2 = Noon, PI = Sunset

        const x = Math.cos(angle) * this.sunRadius;
        const y = Math.sin(angle) * this.sunRadius;
        const z = 0; // Directly overhead

        this.sunPosition.set(x, y, z); // This logic might need tweaking for perfect East-West
        this.sunPosition.setFromSphericalCoords(
            this.sunRadius,
            (1.0 - this.time) * Math.PI + Math.PI / 2, // Hacky elevation 
            Math.PI / 4 // Fixed azimuth
        );

        // Better Physically Based Calculation
        // Elevation: 0 to PI (0 = Zenith, PI = Nadir)
        // We want Noon (0.5) to be near Zenith (low angle)

        const inclination = (this.time - 0.5) * Math.PI + Math.PI / 2; // 0 to PI
        // 0.5 -> 0.5-0.5=0 -> PI/2 (Horizon?? No ThreeJS Sky is confusing)

        // Using THREE.PMREMGenerator logic often used with Sky:
        // elevation 90 = noon
        const elevation = (Math.sin((this.time - 0.25) * 2 * Math.PI) + 0.1) * 90; // Approx
        const azimuth = 180;

        const phi2 = THREE.MathUtils.degToRad(90 - elevation);
        const theta2 = THREE.MathUtils.degToRad(azimuth);

        this.sunPosition.setFromSphericalCoords(this.sunRadius, phi2, theta2);

        // Update Sky uniform
        this.sky.material.uniforms['sunPosition'].value.copy(this.sunPosition);
    }

    _updateLighting() {
        // Update Directional Light (Sun)
        if (this.engine.lighting && this.engine.lighting.sun) {
            this.engine.lighting.sun.position.copy(this.sunPosition);
            this.engine.lighting.sun.updateMatrixWorld();

            // Adjust intensity/color based on elevation
            const elevation = this.sunPosition.y / this.sunRadius;

            // Simple color ramp
            if (elevation < 0.1) {
                // Sunset/Sunrise
                this.engine.lighting.sun.intensity = Math.max(0, elevation * 10);
                this.engine.lighting.sun.color.setHSL(0.1, 0.8, 0.5); // Orange
            } else {
                // Day
                this.engine.lighting.sun.intensity = 1.5;
                this.engine.lighting.sun.color.setHSL(0.1, 0.1, 0.95); // White-ish
            }

            // Notify CSM if it exists inside lighting manager
            if (this.engine.lighting.csm) {
                this.engine.lighting.csm.lightDirection.copy(this.sunPosition).normalize().negate();
            }
        }

        // Update Environment Map (IBL)
        // We do this less frequently to save performance, or when sun moves significantly
        // For now, let's do it if we have a pmremGenerator
        if (this.envMapDirty) {
            this._updateEnvMap();
            this.envMapDirty = false;
        }
    }

    _updateEnvMap() {
        if (!this.pmremGenerator) {
            this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            this.pmremGenerator.compileEquirectangularShader();
        }

        // Generate environment map from the Sky object
        // Sky is a mesh, so we can't just pass it easily to fromScene unless we are careful
        // The Sky object is in the scene.

        // Hide everything else? No, that's slow.
        // Sky shader is special. We can actually render the sky to a cube target?

        // Simpler approach: PMREMGenerator.fromScene(scene)
        // But we only want the sky.

        // Optimization: Only update if sky changed significantly.
        // For now, let's assume we want to update it.

        // To avoid rendering all game objects into the environment map (which is wrong for skybox reflections usually, 
        // we just want the sky), we temporarily hide the root objects or allow fromScene to see only sky?

        // Actually, Sky is just a big box/sphere.

        const visible = [];
        this.scene.traverse(obj => {
            if (obj.visible && obj !== this.sky) {
                obj.visible = false;
                visible.push(obj);
            }
        });

        // Render Sky only
        const envMap = this.pmremGenerator.fromScene(this.scene).texture;
        this.scene.environment = envMap;
        // this.scene.background = envMap; // Optional: Blurred background? simpler to keep current sky or use gradient

        // Restore visibility
        visible.forEach(obj => obj.visible = true);
    }

    dispose() {
        if (this.pmremGenerator) {
            this.pmremGenerator.dispose();
        }
    }
}
