import * as THREE from 'three';

/**
 * LODSystem - Simple Level of Detail Manager
 * Handles switching meshes or visibility based on distance.
 */
export class LODSystem {
    constructor(engine) {
        this.engine = engine;
        this.objects = [];
        this.updateFrequency = 10; // Frames
        this.frame = 0;
    }

    /**
     * Register an object for LOD
     * @param {THREE.Object3D} root - Group containing levels
     * @param {Array<{distance: number, object: THREE.Object3D}>} levels - Sorted by distance
     */
    register(root, levels) {
        this.objects.push({ root, levels });

        // Initial update
        this._updateObject({ root, levels }, this.engine.camera.position);
    }

    update() {
        this.frame++;
        if (this.frame % this.updateFrequency !== 0) return;

        if (!this.engine.camera) return;
        const cameraPos = this.engine.camera.position;

        // Batch update
        for (const entry of this.objects) {
            this._updateObject(entry, cameraPos);
        }
    }

    _updateObject(entry, cameraPos) {
        const { root, levels } = entry;
        const dist = root.position.distanceTo(cameraPos);

        // Find appropriate level
        let activeObj = null;

        // levels assumed sorted: [ {dist: 0, obj: High}, {dist: 50, obj: Low}, {dist: 200, obj: null} ]
        for (let i = levels.length - 1; i >= 0; i--) {
            if (dist >= levels[i].distance) {
                activeObj = levels[i].object;
                break;
            }
        }

        // Update helper or visibility
        // Ideally we assume all children of root are levels and we hide all except active
        // But to be generic, let's assume levels ARE children or we manage them.

        // Simple visibility toggle approach (assumes all added to root)
        levels.forEach(lvl => {
            if (lvl.object) lvl.object.visible = (lvl.object === activeObj);
        });
    }
}
