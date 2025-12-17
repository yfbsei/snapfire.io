import * as THREE from 'three';

/**
 * FrustumCuller - Efficient frustum-based culling for open-world scenes
 * Integrates with SpatialIndex for fast visibility queries
 */
export class FrustumCuller {
    constructor(camera) {
        this.camera = camera;
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();

        // Culling settings
        this.enabled = true;
        this.updateFrequency = 2; // Every N frames
        this.frameCount = 0;

        // Stats
        this.stats = {
            totalObjects: 0,
            visibleObjects: 0,
            culledObjects: 0
        };

        // Cached bounding sphere for performance
        this._boundingSphere = new THREE.Sphere();
        this._box3 = new THREE.Box3();
    }

    /**
     * Update the frustum from camera matrices
     * Call this before culling
     */
    updateFrustum() {
        this.projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    }

    /**
     * Check if an object is within the camera frustum
     * @param {THREE.Object3D} object 
     * @returns {boolean}
     */
    isVisible(object) {
        if (!this.enabled) return true;

        // Get bounding sphere for object
        if (object.geometry && object.geometry.boundingSphere) {
            // Use geometry's precomputed bounding sphere
            this._boundingSphere.copy(object.geometry.boundingSphere);
            this._boundingSphere.applyMatrix4(object.matrixWorld);
        } else {
            // Compute bounding box then sphere
            this._box3.setFromObject(object);
            this._box3.getBoundingSphere(this._boundingSphere);
        }

        return this.frustum.intersectsSphere(this._boundingSphere);
    }

    /**
     * Cull a list of objects, returning only visible ones
     * @param {THREE.Object3D[]} objects 
     * @returns {THREE.Object3D[]}
     */
    cullObjects(objects) {
        if (!this.enabled) return objects;

        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) {
            // Return cached results if any
            return objects; // Skip culling this frame
        }

        this.updateFrustum();

        const visible = [];

        this.stats.totalObjects = objects.length;
        this.stats.visibleObjects = 0;
        this.stats.culledObjects = 0;

        for (const obj of objects) {
            if (this.isVisible(obj)) {
                visible.push(obj);
                this.stats.visibleObjects++;
            } else {
                this.stats.culledObjects++;
            }
        }

        return visible;
    }

    /**
     * Apply frustum culling to a scene
     * Sets object.visible based on frustum test
     * @param {THREE.Scene} scene 
     * @param {Function} filter - Optional filter function
     */
    cullScene(scene, filter = null) {
        if (!this.enabled) return;

        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) return;

        this.updateFrustum();

        this.stats.totalObjects = 0;
        this.stats.visibleObjects = 0;
        this.stats.culledObjects = 0;

        scene.traverse((object) => {
            // Skip non-mesh objects and internal helpers
            if (!object.isMesh) return;
            if (object.name.startsWith('__')) return;
            if (filter && !filter(object)) return;

            this.stats.totalObjects++;

            const visible = this.isVisible(object);

            // Only change visibility if it's different
            if (object.userData.frustumCulled !== undefined) {
                if (object.userData.frustumCulled !== !visible) {
                    object.visible = visible;
                    object.userData.frustumCulled = !visible;

                    if (visible) {
                        this.stats.visibleObjects++;
                    } else {
                        this.stats.culledObjects++;
                    }
                } else {
                    if (visible) this.stats.visibleObjects++;
                    else this.stats.culledObjects++;
                }
            } else {
                object.visible = visible;
                object.userData.frustumCulled = !visible;

                if (visible) {
                    this.stats.visibleObjects++;
                } else {
                    this.stats.culledObjects++;
                }
            }
        });
    }

    /**
     * Get culling statistics
     */
    getStats() {
        const efficiency = this.stats.totalObjects > 0
            ? ((this.stats.culledObjects / this.stats.totalObjects) * 100).toFixed(1)
            : 0;

        return {
            ...this.stats,
            efficiency: `${efficiency}%`
        };
    }

    /**
     * Test if a bounding box is visible
     * @param {THREE.Box3} box 
     * @returns {boolean}
     */
    isBoxVisible(box) {
        return this.frustum.intersectsBox(box);
    }

    /**
     * Test if a bounding sphere is visible
     * @param {THREE.Sphere} sphere 
     * @returns {boolean}
     */
    isSphereVisible(sphere) {
        return this.frustum.intersectsSphere(sphere);
    }
}
