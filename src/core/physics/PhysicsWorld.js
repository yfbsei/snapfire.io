import * as THREE from 'three';
import { SimplePhysicsAdapter } from './SimplePhysicsAdapter.js';
import { RapierAdapter } from './RapierAdapter.js';

/**
 * PhysicsWorld - Physics manager that supports pluggable backends (Rapier, Simple)
 */
export class PhysicsWorld {
    constructor(options = {}) {
        this.options = options;
        this.adapter = null;
        this.useRapier = options.useRapier !== false;

        // Default to simple adapter until init
        this.adapter = new SimplePhysicsAdapter();
    }

    /**
     * Initialize physics engine
     * @returns {Promise<boolean>} Success
     */
    async init() {
        if (this.useRapier) {
            const rapierAdapter = new RapierAdapter();
            const success = await rapierAdapter.init();

            if (success) {
                // Migrate any existing bodies if needed (unlikely for init)
                this.adapter = rapierAdapter;
                return true;
            }
        }

        // Fallback or explicit simple
        console.log('Using Simple Physics Adapter');
        await this.adapter.init();
        return true;
    }

    createRigidBody(options = {}) {
        const body = new RigidBody(this, options);
        return body;
    }

    createJoint(bodyA, bodyB, options = {}) {
        // Adapter must support createJoint
        if (this.adapter.createJoint) {
            return new Joint(this, bodyA, bodyB, options);
        }
        return null;
    }

    removeRigidBody(body) {
        if (body.uuid) {
            this.adapter.removeBody(body.uuid);
        }
    }

    update(deltaTime) {
        if (this.adapter) {
            this.adapter.step(deltaTime);
        }
    }

    raycast(origin, direction, maxDistance) {
        return this.adapter.raycast(origin, direction, maxDistance);
    }

    setGravity(x, y, z) {
        this.adapter.setGravity(x, y, z);
    }
}

/**
 * RigidBody - Handle for a physics body
 * Adapters must provide:
 * - createBody(uuid, options) -> Handle
 * - setPosition(handle, x, y, z)
 * - setRotation(handle, x, y, z, w)
 * - applyForce(handle, vec3)
 * - applyImpulse(handle, vec3)
 * - setVelocity(handle, vec3)
 * - getVelocity(handle) -> vec3
 */
export class RigidBody {
    constructor(world, options = {}) {
        this.world = world;
        this.uuid = THREE.MathUtils.generateUUID();
        this.options = options;

        // Create actual body in adapter
        // Adapter should return an opaque handle/identifier
        this.handle = this.world.adapter.createBody(this.uuid, options);

        // Mirror three.js object
        this.object = options.object;
    }

    get velocity() {
        return this.world.adapter.getVelocity(this.handle);
    }

    set velocity(v) {
        this.world.adapter.setVelocity(this.handle, v);
    }

    applyForce(force) {
        this.world.adapter.applyForce(this.handle, force);
    }

    applyForceAtPoint(force, point) {
        if (this.world.adapter.applyForceAtPoint) {
            this.world.adapter.applyForceAtPoint(this.handle, force, point);
        } else {
            // Fallback to center force + torque if adapter doesn't support it
            console.warn('Adapter does not support applyForceAtPoint');
            this.applyForce(force);
        }
    }

    applyTorque(torque) {
        this.world.adapter.applyTorque(this.handle, torque);
    }

    applyImpulse(impulse) {
        this.world.adapter.applyImpulse(this.handle, impulse);
    }

    applyImpulseAtPoint(impulse, point) {
        if (this.world.adapter.applyImpulseAtPoint) {
            this.world.adapter.applyImpulseAtPoint(this.handle, impulse, point);
        } else {
            console.warn('Adapter does not support applyImpulseAtPoint');
            this.applyImpulse(impulse);
        }
    }

    setPosition(position) {
        this.world.adapter.setPosition(this.handle, position.x, position.y, position.z);
    }

    setRotation(quaternion) {
        this.world.adapter.setRotation(this.handle, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }

    dispose() {
        this.world.removeRigidBody(this);
    }
}

/**
 * Joint - Constraint between two bodies
 */
export class Joint {
    constructor(world, bodyA, bodyB, options) {
        this.world = world;
        this.bodyA = bodyA;
        this.bodyB = bodyB;
        this.handle = world.adapter.createJoint(bodyA.handle, bodyB.handle, options);
    }
}

/**
 * Collider - Configuration holder for physics shapes
 */
export class Collider {
    constructor(options = {}) {
        Object.assign(this, options);
    }

    attachTo(rigidBody) {
        // No-op in new system, RigidBody creation handles shape
        console.warn('Collider.attachTo is deprecated. Pass shape options to createRigidBody instead.');
    }

    dispose() { }
}

// Export CharacterController from its own file
// export { CharacterController } from './CharacterController.js';
// (Commented out to avoid circular dependency if CharacterController imports RigidBody)
