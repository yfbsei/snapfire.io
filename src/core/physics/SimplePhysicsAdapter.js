import * as THREE from 'three';

/**
 * SimplePhysicsAdapter - Using custom simple collision detection
 * Fallback when Rapier is not available
 */
export class SimplePhysicsAdapter {
    constructor() {
        this.gravity = new THREE.Vector3(0, -9.81, 0);
        this.bodies = new Map(); // uuid -> RigidBody
        this.colliders = [];
        this.raycaster = new THREE.Raycaster();
        this._tempVec = new THREE.Vector3();

        this.onCollision = null;
    }

    init() {
        return Promise.resolve();
    }

    createBody(uuid, options) {
        const body = {
            uuid: uuid,
            type: options.type || 'dynamic',
            mass: options.mass ?? 1,
            velocity: new THREE.Vector3(),
            angularVelocity: new THREE.Vector3(),
            linearDamping: options.linearDamping ?? 0.1,
            angularDamping: options.angularDamping ?? 0.1,
            restitution: options.restitution ?? 0.3,
            friction: options.friction ?? 0.5,
            useGravity: options.useGravity ?? true,
            object: options.object,
            radius: options.radius ?? 0.5,
            isGrounded: false
        };
        this.bodies.set(uuid, body);
        return body;
    }

    removeBody(uuid) {
        this.bodies.delete(uuid);
    }

    /**
     * Physics Adapter Interface Implementation
     */
    getVelocity(body) {
        return body.velocity;
    }

    setVelocity(body, velocity) {
        body.velocity.copy(velocity);
    }

    applyForce(body, force) {
        // F = ma -> a = F/m
        // dv = a * dt (applied in step)
        // Here we just add to a persistent force accumulator or directly modify velocity for single impulse-like behavior if simple
        // For simple physics, let's treat it as instantaneous acceleration for now or add to velocity
        // v = v + (F/m) * dt. usage depends on loop.
        // Simplified: Add to velocity assuming 1/60s step? calling it "force" implies it scales with mass
        if (body.type !== 'dynamic') return;

        // This is physically incorrect as "applyForce" should be continuous, 
        // but for simple adapter we treat it as an impulse scaled by mass for immediate effect if called once, 
        // or we need a force accumulator.
        // Let's implement a force accumulator on the body.
        if (!body.force) body.force = new THREE.Vector3();
        body.force.add(force);
    }

    applyTorque(body, torque) {
        if (body.type !== 'dynamic') return;
        if (!body.torque) body.torque = new THREE.Vector3();
        body.torque.add(torque);
    }

    applyImpulse(body, impulse) {
        if (body.type !== 'dynamic') return;
        // J = m * dv -> dv = J / m
        const dv = impulse.clone().divideScalar(body.mass);
        body.velocity.add(dv);
    }

    setPosition(body, x, y, z) {
        if (body.object) {
            body.object.position.set(x, y, z);
        }
        // Also update internal state if we had one separate from object
    }

    setRotation(body, x, y, z, w) {
        if (body.object) {
            body.object.quaternion.set(x, y, z, w);
        }
    }

    step(dt) {
        // Update velocities and positions
        for (const [, body] of this.bodies) {
            if (body.type === 'static') continue;

            // Apply cumulative forces
            if (body.force) {
                const acceleration = body.force.clone().divideScalar(body.mass);
                body.velocity.addScaledVector(acceleration, dt);
                body.force.set(0, 0, 0); // Reset for next frame
            }

            // Apply gravity
            if (body.useGravity) {
                body.velocity.addScaledVector(this.gravity, dt);
            }

            // Apply damping
            body.velocity.multiplyScalar(Math.max(0, 1 - body.linearDamping * dt));

            // Update position
            if (body.object) {
                body.object.position.addScaledVector(body.velocity, dt);

                // Simple floor collision (y=0)
                if (body.object.position.y < 0) {
                    body.object.position.y = 0;
                    body.velocity.y = 0;
                    body.isGrounded = true;
                    // Friction
                    body.velocity.x *= 0.9;
                    body.velocity.z *= 0.9;
                } else {
                    body.isGrounded = false;
                }
            }
        }

        this._checkCollisions();
    }

    // ... (rest of collision logic)

    _checkCollisions() {
        // Simple O(N^2) sphere collision for now
        const bodies = Array.from(this.bodies.values());
        for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
                const a = bodies[i];
                const b = bodies[j];
                if (a.type === 'static' && b.type === 'static') continue;
                if (!a.object || !b.object) continue;

                const dist = a.object.position.distanceTo(b.object.position);
                const minDist = a.radius + b.radius;

                if (dist < minDist) {
                    this._resolveCollision(a, b, dist, minDist);
                }
            }
        }
    }

    _resolveCollision(a, b, dist, minDist) {
        const normal = this._tempVec.copy(b.object.position).sub(a.object.position).normalize();
        const overlap = minDist - dist;

        // Push apart
        if (a.type !== 'static' && b.type !== 'static') {
            a.object.position.addScaledVector(normal, -overlap * 0.5);
            b.object.position.addScaledVector(normal, overlap * 0.5);
        } else if (a.type !== 'static') {
            a.object.position.addScaledVector(normal, -overlap);
        } else {
            b.object.position.addScaledVector(normal, overlap);
        }

        // Notify callback
        if (this.onCollision) {
            this.onCollision({ bodyA: a, bodyB: b, normal });
        }
    }

    setGravity(x, y, z) {
        this.gravity.set(x, y, z);
    }

    raycast(origin, direction, maxDistance) {
        this.raycaster.set(origin, direction);
        this.raycaster.far = maxDistance;
        const objects = [];
        this.bodies.forEach(b => { if (b.object) objects.push(b.object); });

        const intersects = this.raycaster.intersectObjects(objects);
        if (intersects.length > 0) {
            return {
                point: intersects[0].point,
                distance: intersects[0].distance,
                object: intersects[0].object,
                normal: intersects[0].face ? intersects[0].face.normal : new THREE.Vector3(0, 1, 0)
            };
        }
        return null;
    }
}
