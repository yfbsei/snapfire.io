import * as THREE from 'three';

/**
 * VirtualShadowMapPass - Advanced shadow system for large open worlds
 * Uses clipmap-based virtual shadow maps for better quality and performance
 */
export class VirtualShadowMapPass {
    constructor(scene, renderer, directionalLight, options = {}) {
        this.scene = scene;
        this.renderer = renderer;
        this.light = directionalLight;

        this.options = {
            shadowMapSize: options.shadowMapSize || 2048,
            cascadeCount: options.cascadeCount || 4,
            shadowBias: options.shadowBias || -0.0001,
            cascadeSplits: options.cascadeSplits || [6, 20, 60, 200], // Distance splits
            ...options
        };

        this.shadowCameras = [];
        this.shadowMaps = [];

        this._init();
    }

    _init() {
        // Create cascaded shadow map cameras
        for (let i = 0; i < this.options.cascadeCount; i++) {
            const size = this.options.shadowMapSize / Math.pow(2, i); // Reduce size for distant cascades

            const shadowCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.5, 500);
            const shadowMap = new THREE.WebGLRenderTarget(size, size, {
                format: THREE.DepthFormat,
                type: THREE.UnsignedIntType
            });

            this.shadowCameras.push(shadowCamera);
            this.shadowMaps.push(shadowMap);
        }

        // Configure main light
        this.light.castShadow = true;
        this.light.shadow.bias = this.options.shadowBias;
        this.light.shadow.mapSize.setScalar(this.options.shadowMapSize);
    }

    /**
     * Update shadow cascades based on camera position
     * @param {THREE.Camera} camera - Main scene camera
     */
    update(camera) {
        const cameraPos = camera.position;
        const lightDir = this.light.position.clone().normalize();

        // Update each cascade
        for (let i = 0; i < this.options.cascadeCount; i++) {
            const shadowCamera = this.shadowCameras[i];
            const split = this.options.cascadeSplits[i];

            // Position shadow camera to cover frustum slice
            const cascadeCenter = cameraPos.clone().add(
                camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(split / 2)
            );

            shadowCamera.position.copy(cascadeCenter).add(lightDir.clone().multiplyScalar(100));
            shadowCamera.lookAt(cascadeCenter);

            // Adjust frustum size based on cascade distance
            const frustumSize = split * 1.5;
            shadowCamera.left = -frustumSize;
            shadowCamera.right = frustumSize;
            shadowCamera.top = frustumSize;
            shadowCamera.bottom = -frustumSize;
            shadowCamera.updateProjectionMatrix();
        }
    }

    /**
     * Render shadow maps for all cascades
     */
    render() {
        const originalTarget = this.renderer.getRenderTarget();

        for (let i = 0; i < this.options.cascadeCount; i++) {
            this.renderer.setRenderTarget(this.shadowMaps[i]);
            this.renderer.clear();
            this.renderer.render(this.scene, this.shadowCameras[i]);
        }

        this.renderer.setRenderTarget(originalTarget);
    }

    /**
     * Get shadow map for specific cascade
     * @param {number} index 
     * @returns {THREE.WebGLRenderTarget}
     */
    getCascade(index) {
        return this.shadowMaps[index] || null;
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.shadowMaps.forEach(map => map.dispose());
        this.shadowMaps = [];
        this.shadowCameras = [];
    }
}
