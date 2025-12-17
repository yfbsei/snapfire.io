import * as THREE from 'three';

/**
 * RapierPhysicsAdapter - High-performance WASM physics using Rapier
 */
export class RapierAdapter {
    constructor() {
        this.RAPIER = null;
        this.world = null;
        this.bodies = new Map(); // uuid -> RapierRigidBody
        this.eventQueue = null;
        this.initialized = false;

        this.onCollision = null;
    }

    /**
     * Initialize Rapier
     */
    async init() {
        try {
            // Import Rapier
            const RAPIER = await import('@dimforge/rapier3d-compat');
            await RAPIER.init();

            this.RAPIER = RAPIER;

            // Create world with gravity
            this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
            this.eventQueue = new RAPIER.EventQueue();

            this.initialized = true;
            // console.log('Rapier Physics initialized successfully');
            return true;
        } catch (e) {
            console.warn('Failed to initialize Rapier Physics, falling back to simple physics:', e);
            return false;
        }
    }

    setGravity(x, y, z) {
        if (!this.world) return;
        this.world.gravity = { x, y, z };
    }

    createBody(uuid, options) {
        if (!this.world) return null;

        const RAPIER = this.RAPIER;

        // RigidBody Desc
        let rigidBodyDesc;
        if (options.type === 'static') {
            rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
        } else if (options.type === 'kinematic') {
            rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        } else {
            rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic();
        }

        // Initial position
        const pos = options.object ? options.object.position : new THREE.Vector3();
        const rot = options.object ? options.object.quaternion : new THREE.Quaternion();

        rigidBodyDesc.setTranslation(pos.x, pos.y, pos.z)
            .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
            .setLinearDamping(options.linearDamping ?? 0.0)
            .setAngularDamping(options.angularDamping ?? 0.0)
            .setMass(options.mass ?? 1.0);

        if (options.canSleep === false) {
            rigidBodyDesc.setCanSleep(false);
        }

        const rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Collider Desc
        let colliderDesc;
        const radius = options.radius ?? 0.5;
        const halfWidth = options.width ? options.width / 2 : 0.5;
        const halfHeight = options.height ? options.height / 2 : 0.5;
        const halfDepth = options.depth ? options.depth / 2 : 0.5;

        // Determine shape
        if (options.shape === 'box') {
            colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfDepth);
        } else if (options.shape === 'capsule') {
            colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
        } else {
            // Default sphere
            colliderDesc = RAPIER.ColliderDesc.ball(radius);
        }

        colliderDesc.setRestitution(options.restitution ?? 0.3)
            .setFriction(options.friction ?? 0.5)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

        this.world.createCollider(colliderDesc, rigidBody);

        // Store reference
        const bodyHandle = {
            uuid: uuid,
            body: rigidBody, // Rapier body
            object: options.object, // Three.js object
            type: options.type
        };

        this.bodies.set(uuid, bodyHandle);
        return bodyHandle;
    }

    createJoint(handleA, handleB, options) {
        if (!this.world || !handleA.body || !handleB.body) return null;

        const RAPIER = this.RAPIER;
        let params;

        // Map common joint types
        // options: { type: 'fixed'|'spherical'|'revolute'|'prismatic', anchorA: Vec3, anchorB: Vec3, axis: Vec3 }
        const anchorA = options.anchorA || { x: 0, y: 0, z: 0 };
        const anchorB = options.anchorB || { x: 0, y: 0, z: 0 };
        const axis = options.axis || { x: 1, y: 0, z: 0 };

        switch (options.type) {
            case 'fixed':
                params = RAPIER.JointData.fixed(
                    anchorA, { x: 0, y: 0, z: 0, w: 1 },
                    anchorB, { x: 0, y: 0, z: 0, w: 1 }
                );
                break;
            case 'spherical':
                params = RAPIER.JointData.spherical(anchorA, anchorB);
                break;
            case 'revolute':
                params = RAPIER.JointData.revolute(anchorA, anchorB, axis);
                // Limits
                if (options.limits) {
                    params.limitsEnabled = true;
                    params.limits = [options.limits.min, options.limits.max];
                }
                break;
            case 'prismatic':
                params = RAPIER.JointData.prismatic(anchorA, anchorB, axis);
                break;
            default:
                params = RAPIER.JointData.spherical(anchorA, anchorB);
                break;
        }

        const joint = this.world.createImpulseJoint(params, handleA.body, handleB.body);
        return joint;
    }

    removeBody(uuid) {
        if (!this.world) return;

        const handle = this.bodies.get(uuid);
        if (handle) {
            this.world.removeRigidBody(handle.body);
            this.bodies.delete(uuid);
        }
    }

    /**
     * Physics Adapter Interface Implementation
     */
    getVelocity(handle) {
        if (!handle.body) return new THREE.Vector3();
        const linvel = handle.body.linvel();
        return new THREE.Vector3(linvel.x, linvel.y, linvel.z);
    }

    setVelocity(handle, velocity) {
        if (!handle.body) return;
        handle.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    }

    applyForce(handle, force) {
        if (!handle.body) return;
        handle.body.addForce({ x: force.x, y: force.y, z: force.z }, true);
    }

    applyForceAtPoint(handle, force, point) {
        if (!handle.body) return;
        handle.body.addForceAtPoint({ x: force.x, y: force.y, z: force.z }, { x: point.x, y: point.y, z: point.z }, true);
    }

    applyTorque(handle, torque) {
        if (!handle.body) return;
        handle.body.addTorque({ x: torque.x, y: torque.y, z: torque.z }, true);
    }

    applyImpulse(handle, impulse) {
        if (!handle.body) return;
        handle.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }

    applyImpulseAtPoint(handle, impulse, point) {
        if (!handle.body) return;
        handle.body.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: point.x, y: point.y, z: point.z }, true);
    }

    setPosition(handle, x, y, z) {
        if (!handle.body) return;
        handle.body.setTranslation({ x, y, z }, true);
    }

    setRotation(handle, x, y, z, w) {
        if (!handle.body) return;
        handle.body.setRotation({ x, y, z, w }, true);
    }

    step(dt) {
        if (!this.world) return;

        // Step simulation
        this.world.step(this.eventQueue);

        // Sync bodies back to THREE objects
        for (const handle of this.bodies.values()) {
            if (handle.type === 'static') continue;

            // Rapier body is valid?
            if (!this.world.bodies.contains(handle.body.handle)) continue;

            const position = handle.body.translation();
            const rotation = handle.body.rotation();

            if (handle.object) {
                handle.object.position.set(position.x, position.y, position.z);
                handle.object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
            }
        }

        // Handle events
        this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (started && this.onCollision) {
                // Determine which bodies collided
                // This requires reverse lookup or storing data in user data
                // For now, minimal implementation
            }
        });
    }

    raycast(origin, direction, maxDistance) {
        if (!this.world) return null;

        const ray = new this.RAPIER.Ray(
            { x: origin.x, y: origin.y, z: origin.z },
            { x: direction.x, y: direction.y, z: direction.z }
        );

        const hit = this.world.castRay(ray, maxDistance, true);

        if (hit) {
            // Compute hit point
            const point = new THREE.Vector3()
                .copy(direction)
                .multiplyScalar(hit.toi)
                .add(origin);

            // Access collider/body to find user object if needed?
            // Currently Rapier raycast returns collider handle.
            // Mapping back to object requires lookup if needed.

            return {
                point: point,
                distance: hit.toi,
                normal: hit.normal ? new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) : new THREE.Vector3(0, 1, 0)
            };
        }
        return null;
    }
}
