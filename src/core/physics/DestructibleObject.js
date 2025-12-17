import * as THREE from 'three';

/**
 * DestructionSystem - AAA-Quality Object Destruction
 * Manages destructible objects with pre-fractured or procedural fracturing
 */
export class DestructionSystem {
    constructor(physicsWorld, scene) {
        this.world = physicsWorld;
        this.scene = scene;
        this.destructibles = new Map(); // uuid -> config
        this.debrisPool = []; // Pool for shard reuse
        this.maxDebrisPool = 200;
    }

    /**
     * Register a destructible object
     * @param {THREE.Object3D} object - The intact object
     * @param {RigidBody} rigidBody - The object's physics body
     * @param {Object} options
     */
    register(object, rigidBody, options = {}) {
        const config = {
            object,
            rigidBody,
            shards: options.shards || null, // Pre-fractured pieces
            health: options.health || 100,
            impulseThreshold: options.impulseThreshold || 15,
            fractureCount: options.fractureCount || 12, // For procedural fracture
            onDestruction: options.onDestruction || null,
            onDamage: options.onDamage || null,
            isDestroyed: false,
            ...options
        };

        this.destructibles.set(object.uuid, config);
        return config;
    }

    /**
     * Handle collision event
     * @param {Object} collisionEvent 
     */
    onCollision(collisionEvent) {
        const objA = collisionEvent.bodyA?.object;
        const objB = collisionEvent.bodyB?.object;
        const impulse = collisionEvent.impulse || 10;

        if (objA && this.destructibles.has(objA.uuid)) {
            this._handleImpact(this.destructibles.get(objA.uuid), impulse);
        }

        if (objB && this.destructibles.has(objB.uuid)) {
            this._handleImpact(this.destructibles.get(objB.uuid), impulse);
        }
    }

    /**
     * Manually trigger destruction
     * @param {THREE.Object3D} object 
     * @param {THREE.Vector3} explosionCenter - Optional explosion point
     * @param {number} explosionForce - Explosion force magnitude
     */
    destroy(object, explosionCenter = null, explosionForce = 500) {
        const config = this.destructibles.get(object.uuid);
        if (!config || config.isDestroyed) return;

        config.isDestroyed = true;

        // Hide original
        object.visible = false;

        // Get shards (pre-fractured or generate procedurally)
        const shards = config.shards || this._generateProceduralShards(object, config.fractureCount);

        const center = explosionCenter || object.position.clone();

        shards.forEach((shard, index) => {
            // Get or create debris physics body
            const debris = this._getDebrisFromPool();

            // Position shard mesh
            const mesh = shard.clone();
            mesh.position.copy(object.position).add(shard.position);
            mesh.quaternion.copy(object.quaternion).multiply(shard.quaternion);
            mesh.scale.copy(object.scale);

            this.scene.add(mesh);
            debris.visual = mesh;

            // Create physics body for shard
            const body = this.world.createRigidBody({
                object: mesh,
                type: 'dynamic',
                shape: 'box', // Simplified collision shape
                mass: (config.mass || 10) / shards.length,
                restitution: 0.3,
                friction: 0.5
            });

            debris.body = body;

            // Apply explosion force
            if (explosionForce > 0) {
                const directionFromCenter = mesh.position.clone().sub(center).normalize();
                const distance = mesh.position.distanceTo(center);
                const forceMagnitude = explosionForce / (1 + distance * 0.5); // Falloff

                const impulse = directionFromCenter.multiplyScalar(forceMagnitude);
                body.applyImpulse(impulse);

                // Random torque for realistic tumbling
                const randomTorque = new THREE.Vector3(
                    (Math.random() - 0.5) * 100,
                    (Math.random() - 0.5) * 100,
                    (Math.random() - 0.5) * 100
                );
                body.applyTorque(randomTorque);
            }

            // Auto-cleanup after delay
            setTimeout(() => {
                this._returnDebrisToPool(debris);
            }, 5000);
        });

        // Remove original physics body
        if (config.rigidBody) {
            this.world.removeRigidBody(config.rigidBody);
        }

        // Callback
        if (config.onDestruction) {
            config.onDestruction();
        }
    }

    _handleImpact(config, impulseMagnitude) {
        if (config.isDestroyed) return;

        if (impulseMagnitude > config.impulseThreshold) {
            config.health -= impulseMagnitude;

            if (config.onDamage) {
                config.onDamage(config.health, impulseMagnitude);
            }

            if (config.health <= 0) {
                this.destroy(config.object);
            }
        }
    }

    /**
     * Generate procedural fracture shards using Voronoi-like cells
     * @param {THREE.Object3D} object 
     * @param {number} count 
     * @returns {Array<THREE.Object3D>}
     */
    _generateProceduralShards(object, count) {
        const shards = [];
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Generate random seed points for Voronoi cells
        const seedPoints = [];
        for (let i = 0; i < count; i++) {
            seedPoints.push(new THREE.Vector3(
                (Math.random() - 0.5) * size.x,
                (Math.random() - 0.5) * size.y,
                (Math.random() - 0.5) * size.z
            ));
        }

        // Create simple box shards (simplified - true Voronoi would be more complex)
        const shardSize = size.clone().divideScalar(Math.cbrt(count) * 1.5);
        const geometry = new THREE.BoxGeometry(shardSize.x, shardSize.y, shardSize.z);

        // Get material from original object
        let material = new THREE.MeshStandardMaterial({ color: 0x888888 });
        if (object.material) {
            material = object.material.clone ? object.material.clone() : object.material;
        }

        seedPoints.forEach(point => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(point);
            mesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            shards.push(mesh);
        });

        return shards;
    }

    _getDebrisFromPool() {
        // Reuse existing debris or create new
        if (this.debrisPool.length > 0) {
            return this.debrisPool.pop();
        }
        return { visual: null, body: null };
    }

    _returnDebrisToPool(debris) {
        // Clean up and return to pool
        if (debris.visual) {
            this.scene.remove(debris.visual);
            debris.visual.geometry?.dispose();
            debris.visual = null;
        }

        if (debris.body) {
            this.world.removeRigidBody(debris.body);
            debris.body = null;
        }

        if (this.debrisPool.length < this.maxDebrisPool) {
            this.debrisPool.push(debris);
        }
    }

    /**
     * Clean up all destructibles
     */
    dispose() {
        this.destructibles.clear();
        this.debrisPool.forEach(debris => this._returnDebrisToPool(debris));
        this.debrisPool = [];
    }
}

// For backward compatibility
export class DestructibleObject extends DestructionSystem {
    constructor(physicsWorld) {
        console.warn('DestructibleObject is deprecated. Use DestructionSystem instead.');
        super(physicsWorld, null);
    }
}
