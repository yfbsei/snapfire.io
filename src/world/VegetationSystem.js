import * as THREE from 'three';

/**
 * VegetationSystem - Instanced vegetation rendering
 * Renders grass, trees, and other foliage efficiently using GPU instancing
 */
export class VegetationSystem {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.scene = engine.scene;

        // Vegetation layers
        this.layers = new Map(); // name -> VegetationLayer

        // LOD settings
        this.lodDistances = options.lodDistances ?? [50, 100, 200];

        // Culling
        this.viewDistance = options.viewDistance ?? 150;

        // Wind animation
        this.windStrength = options.windStrength ?? 0.5;
        this.windDirection = options.windDirection ?? new THREE.Vector2(1, 0.5).normalize();
        this.windSpeed = options.windSpeed ?? 1;

        this._time = 0;
    }

    /**
     * Add a vegetation layer
     * @param {string} name
     * @param {Object} options
     */
    addLayer(name, options = {}) {
        const layer = new VegetationLayer(this, name, options);
        this.layers.set(name, layer);
        return layer;
    }

    /**
     * Get layer by name
     */
    getLayer(name) {
        return this.layers.get(name);
    }

    /**
     * Remove layer
     */
    removeLayer(name) {
        const layer = this.layers.get(name);
        if (layer) {
            layer.dispose();
            this.layers.delete(name);
        }
    }

    /**
     * Add grass layer with defaults
     */
    addGrass(options = {}) {
        return this.addLayer('grass', {
            geometry: this._createGrassGeometry(options),
            material: this._createGrassMaterial(options),
            density: options.density ?? 5,
            minScale: options.minScale ?? 0.5,
            maxScale: options.maxScale ?? 1.2,
            windAffected: true,
            ...options
        });
    }

    /**
     * Add trees layer
     */
    addTrees(options = {}) {
        return this.addLayer('trees', {
            geometry: options.geometry || this._createSimpleTreeGeometry(options),
            material: options.material || this._createTreeMaterial(options),
            density: options.density ?? 0.02,
            minScale: options.minScale ?? 0.8,
            maxScale: options.maxScale ?? 1.5,
            windAffected: false,
            castShadow: true,
            ...options
        });
    }

    /**
     * Create grass blade geometry
     */
    _createGrassGeometry(options = {}) {
        const width = options.width ?? 0.1;
        const height = options.height ?? 0.5;

        const geometry = new THREE.BufferGeometry();

        // Simple triangle blade
        const positions = new Float32Array([
            -width / 2, 0, 0,
            width / 2, 0, 0,
            0, height, 0
        ]);

        const uvs = new Float32Array([
            0, 0,
            1, 0,
            0.5, 1
        ]);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();

        return geometry;
    }

    /**
     * Create grass material with wind animation
     */
    _createGrassMaterial(options = {}) {
        const material = new THREE.MeshStandardMaterial({
            color: options.color ?? 0x4a8f29,
            roughness: 0.8,
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.5
        });

        return material;
    }

    /**
     * Create simple tree geometry (placeholder)
     */
    _createSimpleTreeGeometry(options = {}) {
        const trunkHeight = options.trunkHeight ?? 2;
        const trunkRadius = options.trunkRadius ?? 0.2;
        const crownRadius = options.crownRadius ?? 1.5;
        const crownHeight = options.crownHeight ?? 3;

        // Combine trunk and crown
        const trunkGeo = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight, 8);
        trunkGeo.translate(0, trunkHeight / 2, 0);

        const crownGeo = new THREE.ConeGeometry(crownRadius, crownHeight, 8);
        crownGeo.translate(0, trunkHeight + crownHeight / 2, 0);

        // Merge geometries
        const merged = new THREE.BufferGeometry();

        // For simplicity, just use the crown
        return crownGeo;
    }

    /**
     * Create tree material
     */
    _createTreeMaterial(options = {}) {
        return new THREE.MeshStandardMaterial({
            color: options.color ?? 0x2d5a27,
            roughness: 0.9
        });
    }

    /**
     * Populate vegetation in an area
     * @param {string} layerName
     * @param {Object} bounds - { minX, maxX, minZ, maxZ }
     * @param {Function} heightGetter - (x, z) => height
     */
    populate(layerName, bounds, heightGetter = null) {
        const layer = this.layers.get(layerName);
        if (!layer) {
            console.warn(`Layer ${layerName} not found`);
            return;
        }

        layer.populate(bounds, heightGetter);
    }

    /**
     * Clear vegetation from a layer
     */
    clear(layerName) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.clear();
        }
    }

    /**
     * Update vegetation (wind animation, LOD)
     * @param {number} deltaTime
     * @param {THREE.Vector3} cameraPosition
     */
    update(deltaTime, cameraPosition) {
        this._time += deltaTime * this.windSpeed;

        for (const [, layer] of this.layers) {
            layer.update(deltaTime, cameraPosition, this._time);
        }
    }

    /**
     * Dispose all vegetation
     */
    dispose() {
        for (const [, layer] of this.layers) {
            layer.dispose();
        }
        this.layers.clear();
    }
}

/**
 * VegetationLayer - Single layer of instanced vegetation
 */
class VegetationLayer {
    constructor(system, name, options = {}) {
        this.system = system;
        this.name = name;

        this.geometry = options.geometry;
        this.material = options.material;
        this.density = options.density ?? 1;
        this.minScale = options.minScale ?? 0.8;
        this.maxScale = options.maxScale ?? 1.2;
        this.windAffected = options.windAffected ?? false;
        this.castShadow = options.castShadow ?? false;

        this.instancedMesh = null;
        this.instances = [];
        this.maxInstances = options.maxInstances ?? 100000;

        this._dummy = new THREE.Object3D();
    }

    /**
     * Populate instances in area
     */
    populate(bounds, heightGetter) {
        const { minX, maxX, minZ, maxZ } = bounds;
        const width = maxX - minX;
        const depth = maxZ - minZ;
        const area = width * depth;
        const count = Math.min(Math.floor(area * this.density), this.maxInstances);

        // Clear existing
        this.clear();

        // Generate instances
        this.instances = [];

        for (let i = 0; i < count; i++) {
            const x = minX + Math.random() * width;
            const z = minZ + Math.random() * depth;
            const y = heightGetter ? heightGetter(x, z) : 0;

            const scale = this.minScale + Math.random() * (this.maxScale - this.minScale);
            const rotation = Math.random() * Math.PI * 2;

            this.instances.push({
                position: new THREE.Vector3(x, y, z),
                rotation,
                scale
            });
        }

        // Create instanced mesh
        this._createInstancedMesh();
    }

    /**
     * Add single instance
     */
    addInstance(x, y, z, scale = 1, rotation = 0) {
        this.instances.push({
            position: new THREE.Vector3(x, y, z),
            rotation,
            scale
        });

        // Rebuild mesh
        this._createInstancedMesh();
    }

    /**
     * Create/update instanced mesh
     */
    _createInstancedMesh() {
        // Remove existing
        if (this.instancedMesh) {
            this.system.scene.remove(this.instancedMesh);
            this.instancedMesh.dispose();
        }

        if (this.instances.length === 0) return;

        this.instancedMesh = new THREE.InstancedMesh(
            this.geometry,
            this.material,
            this.instances.length
        );

        this.instancedMesh.castShadow = this.castShadow;
        this.instancedMesh.receiveShadow = true;
        this.instancedMesh.frustumCulled = true;
        this.instancedMesh.name = `Vegetation_${this.name}`;

        // Set transforms
        for (let i = 0; i < this.instances.length; i++) {
            const inst = this.instances[i];

            this._dummy.position.copy(inst.position);
            this._dummy.rotation.y = inst.rotation;
            this._dummy.scale.setScalar(inst.scale);
            this._dummy.updateMatrix();

            this.instancedMesh.setMatrixAt(i, this._dummy.matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.system.scene.add(this.instancedMesh);
    }

    /**
     * Update layer (wind, LOD)
     */
    update(deltaTime, cameraPosition, time) {
        if (!this.instancedMesh || !this.windAffected) return;

        // Wind animation would require custom shader
        // For now, just ensure matrix is updated
    }

    /**
     * Clear all instances
     */
    clear() {
        if (this.instancedMesh) {
            this.system.scene.remove(this.instancedMesh);
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }
        this.instances = [];
    }

    /**
     * Dispose
     */
    dispose() {
        this.clear();
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
    }
}
