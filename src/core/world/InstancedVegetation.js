import * as THREE from 'three';

/**
 * InstancedVegetation - GPU instanced rendering for vegetation (grass, trees, rocks)
 * Essential for rendering thousands of objects efficiently in open-world games
 */
export class InstancedVegetation {
    constructor(options = {}) {
        this.maxInstances = options.maxInstances || 10000;
        this.cullDistance = options.cullDistance || 500;

        this.instanceGroups = new Map(); // name -> InstanceGroup
        this.camera = options.camera || null;

        // Update frequency for culling
        this.updateFrequency = options.updateFrequency || 5;
        this._frameCount = 0;

        // Reusable objects
        this._matrix = new THREE.Matrix4();
        this._position = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._camPosition = new THREE.Vector3();
    }

    /**
     * Set camera for distance culling
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * Create a new vegetation instance group
     * @param {string} name - Group identifier
     * @param {THREE.BufferGeometry} geometry - Instance geometry
     * @param {THREE.Material} material - Instance material
     * @param {number} maxInstances - Maximum instances for this group
     * @returns {InstanceGroup}
     */
    createGroup(name, geometry, material, maxInstances = this.maxInstances) {
        const instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
        instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        instancedMesh.frustumCulled = true;
        instancedMesh.name = `Vegetation_${name}`;

        const group = new InstanceGroup(name, instancedMesh, maxInstances);
        this.instanceGroups.set(name, group);

        return group;
    }

    /**
     * Create grass instances
     * @param {number} count - Number of grass instances
     * @param {THREE.Box3} bounds - World bounds to scatter grass in
     * @param {Function} heightFunc - (x, z) => height function
     * @returns {InstanceGroup}
     */
    createGrass(count, bounds, heightFunc = null) {
        // Simple grass blade geometry
        const geometry = new THREE.PlaneGeometry(0.1, 0.5, 1, 4);
        geometry.translate(0, 0.25, 0);

        // Grass material with transparency
        const material = new THREE.MeshStandardMaterial({
            color: 0x4a7c4e,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5
        });

        const group = this.createGroup('grass', geometry, material, count);

        // Scatter grass instances
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const min = bounds.min;

        for (let i = 0; i < count; i++) {
            const x = min.x + Math.random() * size.x;
            const z = min.z + Math.random() * size.z;
            const y = heightFunc ? heightFunc(x, z) : 0;

            const scale = 0.8 + Math.random() * 0.4;
            const rotation = Math.random() * Math.PI * 2;

            group.setInstance(i,
                new THREE.Vector3(x, y, z),
                new THREE.Euler(0, rotation, 0),
                new THREE.Vector3(scale, scale, scale)
            );
        }

        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = true;

        return group;
    }

    /**
     * Create tree instances
     * @param {number} count - Number of trees
     * @param {THREE.Box3} bounds - World bounds
     * @param {Function} heightFunc - Height function
     * @returns {InstanceGroup}
     */
    createTrees(count, bounds, heightFunc = null) {
        // Simple tree geometry (cone on cylinder)
        const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 1, 6);
        trunkGeometry.translate(0, 0.5, 0);

        const foliageGeometry = new THREE.ConeGeometry(0.8, 2, 6);
        foliageGeometry.translate(0, 2, 0);

        // Merge geometries
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const normals = [];
        const colors = [];

        // Add trunk vertices (brown)
        const trunkPos = trunkGeometry.attributes.position.array;
        const trunkNorm = trunkGeometry.attributes.normal.array;
        for (let i = 0; i < trunkPos.length; i += 3) {
            positions.push(trunkPos[i], trunkPos[i + 1], trunkPos[i + 2]);
            normals.push(trunkNorm[i], trunkNorm[i + 1], trunkNorm[i + 2]);
            colors.push(0.35, 0.25, 0.15);
        }

        // Add foliage vertices (green)
        const foliagePos = foliageGeometry.attributes.position.array;
        const foliageNorm = foliageGeometry.attributes.normal.array;
        for (let i = 0; i < foliagePos.length; i += 3) {
            positions.push(foliagePos[i], foliagePos[i + 1], foliagePos[i + 2]);
            normals.push(foliageNorm[i], foliageNorm[i + 1], foliageNorm[i + 2]);
            colors.push(0.2, 0.5, 0.2);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Merge indices
        const trunkIndex = trunkGeometry.index.array;
        const foliageIndex = foliageGeometry.index.array;
        const indices = [...trunkIndex];
        const offset = trunkPos.length / 3;
        for (let i = 0; i < foliageIndex.length; i++) {
            indices.push(foliageIndex[i] + offset);
        }
        geometry.setIndex(indices);

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.8
        });

        const group = this.createGroup('trees', geometry, material, count);

        // Scatter trees
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const min = bounds.min;

        for (let i = 0; i < count; i++) {
            const x = min.x + Math.random() * size.x;
            const z = min.z + Math.random() * size.z;
            const y = heightFunc ? heightFunc(x, z) : 0;

            const scale = 1 + Math.random() * 1.5;
            const rotation = Math.random() * Math.PI * 2;

            group.setInstance(i,
                new THREE.Vector3(x, y, z),
                new THREE.Euler(0, rotation, 0),
                new THREE.Vector3(scale, scale, scale)
            );
        }

        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = true;

        // Cleanup temp geometries
        trunkGeometry.dispose();
        foliageGeometry.dispose();

        return group;
    }

    /**
     * Create rocks/boulders
     */
    createRocks(count, bounds, heightFunc = null) {
        const geometry = new THREE.DodecahedronGeometry(0.5, 0);
        const material = new THREE.MeshStandardMaterial({
            color: 0x7a7a7a,
            roughness: 0.9,
            flatShading: true
        });

        const group = this.createGroup('rocks', geometry, material, count);

        const size = new THREE.Vector3();
        bounds.getSize(size);
        const min = bounds.min;

        for (let i = 0; i < count; i++) {
            const x = min.x + Math.random() * size.x;
            const z = min.z + Math.random() * size.z;
            const y = heightFunc ? heightFunc(x, z) : 0;

            const scale = 0.3 + Math.random() * 1.2;
            const rotX = Math.random() * Math.PI * 2;
            const rotY = Math.random() * Math.PI * 2;
            const rotZ = Math.random() * Math.PI * 2;

            group.setInstance(i,
                new THREE.Vector3(x, y - scale * 0.3, z),
                new THREE.Euler(rotX, rotY, rotZ),
                new THREE.Vector3(scale, scale * 0.7, scale)
            );
        }

        group.mesh.count = count;
        group.mesh.instanceMatrix.needsUpdate = true;

        return group;
    }

    /**
     * Update visibility based on camera distance (frustum culling handled by Three.js)
     */
    update() {
        if (!this.camera) return;

        this._frameCount++;
        if (this._frameCount % this.updateFrequency !== 0) return;

        this.camera.getWorldPosition(this._camPosition);

        // Could implement distance-based LOD or visibility here
        // For now, rely on Three.js frustum culling
    }

    /**
     * Get instance group by name
     */
    getGroup(name) {
        return this.instanceGroups.get(name);
    }

    /**
     * Get all instance meshes for adding to scene
     */
    getMeshes() {
        const meshes = [];
        for (const [name, group] of this.instanceGroups) {
            meshes.push(group.mesh);
        }
        return meshes;
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = { totalInstances: 0, groups: {} };

        for (const [name, group] of this.instanceGroups) {
            stats.groups[name] = group.mesh.count;
            stats.totalInstances += group.mesh.count;
        }

        return stats;
    }

    /**
     * Dispose all resources
     */
    dispose() {
        for (const [name, group] of this.instanceGroups) {
            group.dispose();
        }
        this.instanceGroups.clear();
    }
}

/**
 * InstanceGroup - Manages instances for a single mesh type
 */
class InstanceGroup {
    constructor(name, instancedMesh, maxInstances) {
        this.name = name;
        this.mesh = instancedMesh;
        this.maxInstances = maxInstances;
        this.activeCount = 0;

        // Reusable matrix
        this._matrix = new THREE.Matrix4();
        this._position = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
    }

    /**
     * Set instance transform
     */
    setInstance(index, position, rotation, scale) {
        this._position.copy(position);
        this._quaternion.setFromEuler(rotation instanceof THREE.Euler ? rotation : new THREE.Euler().copy(rotation));
        this._scale.copy(scale);

        this._matrix.compose(this._position, this._quaternion, this._scale);
        this.mesh.setMatrixAt(index, this._matrix);
    }

    /**
     * Get instance matrix
     */
    getInstance(index) {
        this.mesh.getMatrixAt(index, this._matrix);
        this._matrix.decompose(this._position, this._quaternion, this._scale);

        return {
            position: this._position.clone(),
            rotation: new THREE.Euler().setFromQuaternion(this._quaternion),
            scale: this._scale.clone()
        };
    }

    /**
     * Update instance matrix buffer
     */
    updateMatrix() {
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
