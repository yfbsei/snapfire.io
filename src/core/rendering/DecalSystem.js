/**
 * DecalSystem - Deferred decal projector system
 * Supports bullet holes, blood splatter, tire marks, and more
 */
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

/**
 * Decal - Individual decal instance
 */
export class Decal {
    constructor(options = {}) {
        this.id = options.id ?? crypto.randomUUID();
        this.mesh = options.mesh ?? null;
        this.position = options.position ?? new THREE.Vector3();
        this.normal = options.normal ?? new THREE.Vector3(0, 1, 0);
        this.size = options.size ?? new THREE.Vector3(1, 1, 1);
        this.rotation = options.rotation ?? 0;
        this.material = options.material ?? null;
        this.lifetime = options.lifetime ?? -1; // -1 = infinite
        this.fadeTime = options.fadeTime ?? 1.0; // Fade duration before removal
        this.age = 0;
        this.opacity = 1;
        this.active = true;
    }
}

/**
 * DecalSystem - Manages decal spawning, pooling, and lifecycle
 */
export class DecalSystem {
    constructor(scene, options = {}) {
        this.scene = scene;

        // Pool settings
        this.maxDecals = options.maxDecals ?? 500;
        this.decals = [];
        this.activeCount = 0;

        // Default materials
        this.materials = new Map();
        this._createDefaultMaterials();

        // Decal container for organization
        this.container = new THREE.Group();
        this.container.name = 'DecalSystem';
        this.scene.add(this.container);
    }

    _createDefaultMaterials() {
        // Bullet hole decal
        this.materials.set('bulletHole', new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.0,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));

        // Blood splatter
        this.materials.set('blood', new THREE.MeshStandardMaterial({
            color: 0x8b0000,
            roughness: 0.7,
            metalness: 0.0,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));

        // Scorch mark
        this.materials.set('scorch', new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 1.0,
            metalness: 0.0,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));

        // Tire mark
        this.materials.set('tire', new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.95,
            metalness: 0.0,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));

        // Dirt/mud splatter
        this.materials.set('dirt', new THREE.MeshStandardMaterial({
            color: 0x4a3728,
            roughness: 1.0,
            metalness: 0.0,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));

        // Water/wet spot
        this.materials.set('water', new THREE.MeshStandardMaterial({
            color: 0x4488aa,
            roughness: 0.1,
            metalness: 0.0,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        }));
    }

    /**
     * Add a custom decal material
     * @param {string} name
     * @param {THREE.Material} material
     */
    addMaterial(name, material) {
        // Ensure decal-appropriate settings
        material.transparent = true;
        material.depthWrite = false;
        material.polygonOffset = true;
        material.polygonOffsetFactor = -4;
        this.materials.set(name, material);
    }

    /**
     * Create a decal material from a texture
     * @param {string} name
     * @param {THREE.Texture} texture
     * @param {Object} options
     */
    createMaterialFromTexture(name, texture, options = {}) {
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            color: options.color ?? 0xffffff,
            roughness: options.roughness ?? 0.8,
            metalness: options.metalness ?? 0.0,
            transparent: true,
            opacity: options.opacity ?? 1.0,
            alphaTest: options.alphaTest ?? 0.1,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4
        });
        this.materials.set(name, material);
        return material;
    }

    /**
     * Spawn a decal at the given position
     * @param {string} type - Material type name
     * @param {THREE.Object3D} target - Object to project onto
     * @param {THREE.Vector3} position - World position
     * @param {THREE.Vector3} normal - Surface normal
     * @param {Object} options
     * @returns {Decal|null}
     */
    spawn(type, target, position, normal, options = {}) {
        // Get or recycle decal slot
        let decal = this._getAvailableDecal();

        const material = this.materials.get(type);
        if (!material) {
            console.warn(`DecalSystem: Unknown material type "${type}"`);
            return null;
        }

        // Calculate orientation
        const euler = new THREE.Euler();
        const lookAt = new THREE.Vector3().copy(position).add(normal);
        const tempObj = new THREE.Object3D();
        tempObj.position.copy(position);
        tempObj.lookAt(lookAt);
        euler.copy(tempObj.rotation);
        euler.z = options.rotation ?? Math.random() * Math.PI * 2;

        // Size with variation
        const baseSize = options.size ?? 0.5;
        const sizeVariation = options.sizeVariation ?? 0.2;
        const scale = baseSize + (Math.random() - 0.5) * sizeVariation * 2;
        const size = new THREE.Vector3(scale, scale, scale * 0.5);

        // Create decal geometry
        const decalGeometry = new DecalGeometry(target, position, euler, size);

        if (decalGeometry.attributes.position.count === 0) {
            decalGeometry.dispose();
            return null;
        }

        // Create mesh
        const decalMesh = new THREE.Mesh(decalGeometry, material.clone());
        decalMesh.name = `Decal_${type}_${decal.id}`;
        decalMesh.renderOrder = this.activeCount; // Ensure proper layering

        // Setup decal object
        decal.mesh = decalMesh;
        decal.position.copy(position);
        decal.normal.copy(normal);
        decal.size.copy(size);
        decal.rotation = euler.z;
        decal.material = decalMesh.material;
        decal.lifetime = options.lifetime ?? -1;
        decal.fadeTime = options.fadeTime ?? 1.0;
        decal.age = 0;
        decal.opacity = options.opacity ?? material.opacity;
        decal.active = true;

        this.container.add(decalMesh);
        this.activeCount++;

        return decal;
    }

    /**
     * Spawn a bullet impact decal
     * @param {THREE.Object3D} target
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} normal
     * @param {Object} options
     */
    spawnBulletHole(target, position, normal, options = {}) {
        return this.spawn('bulletHole', target, position, normal, {
            size: 0.05,
            sizeVariation: 0.02,
            lifetime: 30,
            fadeTime: 2,
            ...options
        });
    }

    /**
     * Spawn blood splatter decal
     * @param {THREE.Object3D} target
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} normal
     * @param {Object} options
     */
    spawnBlood(target, position, normal, options = {}) {
        return this.spawn('blood', target, position, normal, {
            size: 0.3,
            sizeVariation: 0.15,
            lifetime: 60,
            fadeTime: 5,
            ...options
        });
    }

    /**
     * Spawn scorch/explosion mark
     * @param {THREE.Object3D} target
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} normal
     * @param {Object} options
     */
    spawnScorch(target, position, normal, options = {}) {
        return this.spawn('scorch', target, position, normal, {
            size: 1.0,
            sizeVariation: 0.3,
            lifetime: 120,
            fadeTime: 10,
            ...options
        });
    }

    _getAvailableDecal() {
        // Find inactive decal
        for (const decal of this.decals) {
            if (!decal.active) {
                return decal;
            }
        }

        // Create new if under limit
        if (this.decals.length < this.maxDecals) {
            const decal = new Decal();
            this.decals.push(decal);
            return decal;
        }

        // Recycle oldest decal
        const oldest = this.decals.reduce((a, b) =>
            (a.active && b.active) ? (a.age > b.age ? a : b) : (a.active ? a : b)
        );
        this._removeDecal(oldest);
        return oldest;
    }

    _removeDecal(decal) {
        if (decal.mesh) {
            this.container.remove(decal.mesh);
            decal.mesh.geometry.dispose();
            if (decal.material !== decal.mesh.material) {
                decal.mesh.material.dispose();
            }
            decal.mesh = null;
        }
        decal.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
    }

    /**
     * Update decals (call every frame)
     * @param {number} deltaTime
     */
    update(deltaTime) {
        for (const decal of this.decals) {
            if (!decal.active) continue;

            decal.age += deltaTime;

            // Check lifetime
            if (decal.lifetime > 0) {
                const remaining = decal.lifetime - decal.age;

                if (remaining <= 0) {
                    this._removeDecal(decal);
                } else if (remaining <= decal.fadeTime) {
                    // Fade out
                    const fadeProgress = remaining / decal.fadeTime;
                    if (decal.mesh && decal.mesh.material) {
                        decal.mesh.material.opacity = decal.opacity * fadeProgress;
                    }
                }
            }
        }
    }

    /**
     * Remove all decals
     */
    clear() {
        for (const decal of this.decals) {
            if (decal.active) {
                this._removeDecal(decal);
            }
        }
    }

    /**
     * Get current decal count
     * @returns {number}
     */
    getActiveCount() {
        return this.activeCount;
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.clear();
        this.materials.forEach(mat => mat.dispose());
        this.materials.clear();
        this.scene.remove(this.container);
    }
}

export default DecalSystem;
