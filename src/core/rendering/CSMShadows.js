/**
 * CSMShadows - Cascaded Shadow Maps for large open-world scenes
 * Wrapper for Three.js CSM with AAA presets and optimizations
 */
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { CSMHelper } from 'three/addons/csm/CSMHelper.js';

/**
 * CSMShadows - Manages cascaded shadow maps
 */
export class CSMShadows {
    constructor(options = {}) {
        this.csm = null;
        this.helper = null;
        this.scene = null;
        this.camera = null;

        // Default settings
        this.cascades = options.cascades ?? 4;
        this.maxFar = options.maxFar ?? 500;
        this.mode = options.mode ?? 'practical'; // 'uniform', 'logarithmic', 'practical'
        this.shadowMapSize = options.shadowMapSize ?? 2048;
        this.lightDirection = options.lightDirection ?? new THREE.Vector3(-1, -1, -1).normalize();
        this.lightIntensity = options.lightIntensity ?? 1.0;
        this.shadowBias = options.shadowBias ?? 0.0001;
        this.shadowNormalBias = options.shadowNormalBias ?? 0.002;

        // Quality presets
        this.quality = options.quality ?? 'high';
    }

    /**
     * Initialize CSM with scene and camera
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    init(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Apply quality preset
        this._applyQualityPreset(this.quality);

        // Create CSM
        this.csm = new CSM({
            maxFar: this.maxFar,
            cascades: this.cascades,
            mode: this.mode,
            parent: scene,
            shadowMapSize: this.shadowMapSize,
            lightDirection: this.lightDirection,
            camera: camera,
            shadowBias: this.shadowBias,
            lightNear: 1,
            lightFar: this.maxFar * 2
        });

        // Configure light
        this.csm.lights.forEach((light) => {
            light.shadow.normalBias = this.shadowNormalBias;
            light.intensity = this.lightIntensity / this.cascades;
        });

        console.log(`CSM initialized with ${this.cascades} cascades, ${this.shadowMapSize}px shadow maps`);
    }

    /**
     * Apply quality preset
     * @param {'low'|'medium'|'high'|'ultra'} preset
     */
    setQuality(preset) {
        this.quality = preset;
        this._applyQualityPreset(preset);

        // Recreate CSM if already initialized
        if (this.csm) {
            this.dispose();
            this.init(this.scene, this.camera);
        }
    }

    _applyQualityPreset(preset) {
        switch (preset) {
            case 'low':
                this.cascades = 2;
                this.shadowMapSize = 1024;
                this.maxFar = 200;
                break;
            case 'medium':
                this.cascades = 3;
                this.shadowMapSize = 1536;
                this.maxFar = 350;
                break;
            case 'high':
                this.cascades = 4;
                this.shadowMapSize = 2048;
                this.maxFar = 500;
                break;
            case 'ultra':
                this.cascades = 5;
                this.shadowMapSize = 4096;
                this.maxFar = 800;
                break;
        }
    }

    /**
     * Set light direction (sun direction)
     * @param {THREE.Vector3} direction - Normalized direction vector
     */
    setLightDirection(direction) {
        this.lightDirection.copy(direction).normalize();
        if (this.csm) {
            this.csm.lightDirection.copy(this.lightDirection);
        }
    }

    /**
     * Set light direction from sun angle
     * @param {number} elevation - Sun elevation in radians (0 = horizon, PI/2 = noon)
     * @param {number} azimuth - Sun azimuth in radians
     */
    setSunPosition(elevation, azimuth) {
        const x = Math.cos(elevation) * Math.sin(azimuth);
        const y = Math.sin(elevation);
        const z = Math.cos(elevation) * Math.cos(azimuth);
        this.setLightDirection(new THREE.Vector3(-x, -y, -z));
    }

    /**
     * Set shadow bias values
     * @param {number} bias - Shadow bias
     * @param {number} normalBias - Shadow normal bias
     */
    setShadowBias(bias, normalBias) {
        this.shadowBias = bias;
        this.shadowNormalBias = normalBias;

        if (this.csm) {
            this.csm.lights.forEach((light) => {
                light.shadow.bias = bias;
                light.shadow.normalBias = normalBias;
            });
        }
    }

    /**
     * Setup materials to receive CSM shadows
     * @param {THREE.Material|THREE.Material[]} materials
     */
    setupMaterial(materials) {
        if (!this.csm) {
            console.warn('CSM not initialized, call init() first');
            return;
        }

        const materialArray = Array.isArray(materials) ? materials : [materials];
        materialArray.forEach(material => {
            this.csm.setupMaterial(material);
        });
    }

    /**
     * Update CSM (call every frame)
     */
    update() {
        if (this.csm) {
            this.csm.update();
        }
    }

    /**
     * Toggle debug helper visualization
     * @param {boolean} visible
     */
    showHelper(visible) {
        if (visible && !this.helper && this.csm) {
            this.helper = new CSMHelper(this.csm);
            this.scene.add(this.helper);
        } else if (!visible && this.helper) {
            this.scene.remove(this.helper);
            this.helper.dispose();
            this.helper = null;
        }

        if (this.helper) {
            this.helper.visible = visible;
        }
    }

    /**
     * Update helper visualization
     */
    updateHelper() {
        if (this.helper) {
            this.helper.update();
        }
    }

    /**
     * Get the main directional light
     * @returns {THREE.DirectionalLight}
     */
    getMainLight() {
        return this.csm?.lights?.[0] ?? null;
    }

    /**
     * Set light intensity
     * @param {number} intensity
     */
    setIntensity(intensity) {
        this.lightIntensity = intensity;
        if (this.csm) {
            this.csm.lights.forEach((light) => {
                light.intensity = intensity / this.cascades;
            });
        }
    }

    /**
     * Set light color
     * @param {THREE.Color|number|string} color
     */
    setColor(color) {
        const c = new THREE.Color(color);
        if (this.csm) {
            this.csm.lights.forEach((light) => {
                light.color.copy(c);
            });
        }
    }

    /**
     * Get cascade break distances for debugging
     * @returns {number[]}
     */
    getCascadeBreaks() {
        return this.csm?.breaks ?? [];
    }

    /**
     * Dispose all resources
     */
    dispose() {
        if (this.helper) {
            this.scene.remove(this.helper);
            this.helper.dispose();
            this.helper = null;
        }

        if (this.csm) {
            this.csm.dispose();
            this.csm = null;
        }
    }
}

export default CSMShadows;
