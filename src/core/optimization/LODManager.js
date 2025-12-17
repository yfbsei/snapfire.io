import * as THREE from 'three';

/**
 * LODManager - Level-of-Detail management for open-world optimization
 * Automatically switches mesh detail based on camera distance
 */
export class LODManager {
    constructor(camera) {
        this.camera = camera;
        this.lodGroups = new Map(); // UUID -> LODGroup
        this.enabled = true;

        // LOD distance thresholds (multipliers based on object size)
        this.lodDistances = [0, 2, 5, 10]; // LOD 0 (highest), LOD 1, LOD 2, LOD 3 (lowest)

        // Performance settings
        this.updateFrequency = 10; // Update every N frames
        this.frameCount = 0;

        // Precomputed camera position
        this._cameraPosition = new THREE.Vector3();
    }

    /**
     * Register an object with LOD levels
     * @param {THREE.Object3D} object - The primary object
     * @param {THREE.Object3D[]} lodLevels - Array of LOD meshes [high, medium, low, billboard]
     * @param {number[]} distances - Optional custom distance thresholds
     */
    register(object, lodLevels, distances = null) {
        const uuid = object.uuid;

        // Calculate object bounding sphere for distance calculations
        const boundingSphere = new THREE.Sphere();
        const box = new THREE.Box3().setFromObject(object);
        box.getBoundingSphere(boundingSphere);

        const lodGroup = {
            object: object,
            levels: lodLevels,
            distances: distances || this.lodDistances.map(d => d * boundingSphere.radius * 10),
            boundingSphere: boundingSphere,
            currentLevel: 0,
            visible: true
        };

        this.lodGroups.set(uuid, lodGroup);

        // Hide all but first LOD level
        lodLevels.forEach((level, i) => {
            if (level) level.visible = (i === 0);
        });

        return lodGroup;
    }

    /**
     * Create THREE.LOD object from meshes
     * @param {THREE.Mesh[]} meshes - Array of meshes for different LOD levels
     * @param {number[]} distances - Distance thresholds
     * @returns {THREE.LOD}
     */
    createLOD(meshes, distances = null) {
        const lod = new THREE.LOD();
        const dists = distances || [0, 50, 100, 200];

        meshes.forEach((mesh, i) => {
            if (mesh) {
                lod.addLevel(mesh, dists[i] || dists[dists.length - 1]);
            }
        });

        return lod;
    }

    /**
     * Unregister an object
     * @param {THREE.Object3D|string} objectOrUuid 
     */
    unregister(objectOrUuid) {
        const uuid = typeof objectOrUuid === 'string' ? objectOrUuid : objectOrUuid.uuid;
        this.lodGroups.delete(uuid);
    }

    /**
     * Update LOD levels based on camera distance
     * Call this in the render loop
     */
    update() {
        if (!this.enabled) return;

        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) return;

        // Get camera position
        this.camera.getWorldPosition(this._cameraPosition);

        for (const [uuid, group] of this.lodGroups) {
            if (!group.visible) continue;

            // Calculate distance to camera
            const objectPosition = group.object.getWorldPosition(new THREE.Vector3());
            const distance = this._cameraPosition.distanceTo(objectPosition);

            // Determine appropriate LOD level
            let newLevel = 0;
            for (let i = group.distances.length - 1; i >= 0; i--) {
                if (distance >= group.distances[i]) {
                    newLevel = i;
                    break;
                }
            }

            // Switch LOD if needed
            if (newLevel !== group.currentLevel) {
                this.switchLOD(group, newLevel);
            }
        }
    }

    /**
     * Switch to a specific LOD level
     * @param {Object} group - LOD group
     * @param {number} level - Target LOD level
     */
    switchLOD(group, level) {
        // Hide current level
        if (group.levels[group.currentLevel]) {
            group.levels[group.currentLevel].visible = false;
        }

        // Show new level
        if (group.levels[level]) {
            group.levels[level].visible = true;
        }

        group.currentLevel = level;
    }

    /**
     * Set visibility for a LOD group
     * @param {string} uuid - Object UUID
     * @param {boolean} visible - Visibility state
     */
    setVisible(uuid, visible) {
        const group = this.lodGroups.get(uuid);
        if (group) {
            group.visible = visible;
            group.levels.forEach(level => {
                if (level) level.visible = visible && (group.levels.indexOf(level) === group.currentLevel);
            });
        }
    }

    /**
     * Get current LOD statistics
     * @returns {Object}
     */
    getStats() {
        const stats = {
            totalGroups: this.lodGroups.size,
            byLevel: [0, 0, 0, 0]
        };

        for (const [uuid, group] of this.lodGroups) {
            if (group.visible && stats.byLevel[group.currentLevel] !== undefined) {
                stats.byLevel[group.currentLevel]++;
            }
        }

        return stats;
    }

    /**
     * Force update all LODs
     */
    forceUpdate() {
        const originalFrequency = this.updateFrequency;
        this.updateFrequency = 1;
        this.frameCount = 0;
        this.update();
        this.updateFrequency = originalFrequency;
    }

    /**
     * Set LOD distance thresholds
     * @param {number[]} distances 
     */
    setDistances(distances) {
        this.lodDistances = distances;
    }

    /**
     * Clear all registered LOD groups
     */
    clear() {
        this.lodGroups.clear();
    }
}

/**
 * Factory for creating LOD meshes from a high-poly mesh
 */
export class LODFactory {
    /**
     * Create simplified versions of a mesh
     * Note: This is a placeholder - real implementation would use mesh simplification algorithms
     * @param {THREE.Mesh} mesh - High-poly mesh
     * @param {number[]} reductions - Array of reduction factors [0.5, 0.25, 0.1]
     * @returns {THREE.Mesh[]}
     */
    static createLODs(mesh, reductions = [1, 0.5, 0.25, 0.1]) {
        const lods = [];

        reductions.forEach((reduction, index) => {
            if (reduction === 1) {
                lods.push(mesh.clone());
            } else {
                // Placeholder: In production, use decimation/simplification
                // For now, just clone with a note about future implementation
                const lodMesh = mesh.clone();
                lodMesh.userData.lodLevel = index;
                lodMesh.userData.targetReduction = reduction;
                lods.push(lodMesh);
            }
        });

        return lods;
    }

    /**
     * Create a billboard/impostor for very distant objects
     * @param {THREE.Object3D} object - Object to create billboard from
     * @param {number} size - Billboard size
     * @returns {THREE.Sprite}
     */
    static createBillboard(object, size = 1) {
        // Create a simple sprite as placeholder
        // In production, this would render the object to a texture
        const material = new THREE.SpriteMaterial({
            color: 0xcccccc,
            opacity: 0.8,
            transparent: true
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(size, size, 1);
        sprite.userData.isLODBillboard = true;

        return sprite;
    }
}
