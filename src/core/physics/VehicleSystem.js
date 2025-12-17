import * as THREE from 'three';

/**
 * VehicleSystem - AAA-Quality Raycast Vehicle Controller
 * Simulates realistic vehicle physics with engine, transmission, and drivetrain
 */
export class VehicleSystem {
    constructor(physicsWorld) {
        this.world = physicsWorld;
        this.vehicles = [];
    }

    /**
     * Create a vehicle controller
     * @param {RigidBody} chassisBody - The physics body for the car chassis
     * @param {Object} options - Vehicle tuning
     */
    createVehicle(chassisBody, options = {}) {
        const vehicle = new Vehicle(this.world, chassisBody, options);
        this.vehicles.push(vehicle);
        return vehicle;
    }

    removeVehicle(vehicle) {
        const index = this.vehicles.indexOf(vehicle);
        if (index !== -1) {
            this.vehicles.splice(index, 1);
        }
    }

    update(dt) {
        for (const vehicle of this.vehicles) {
            vehicle.update(dt);
        }
    }
}

class Vehicle {
    constructor(world, chassisBody, options = {}) {
        this.world = world;
        this.chassis = chassisBody;

        // Physical properties
        this.mass = options.mass || 1500;

        // Suspension
        this.suspensionStiffness = options.suspensionStiffness || 30.0;
        this.suspensionDamping = options.suspensionDamping || 2.3;
        this.suspensionRestLength = options.suspensionRestLength || 0.6;
        this.radius = options.wheelRadius || 0.3;

        // Engine properties
        this.enginePower = options.enginePower || 200; // HP
        this.engineTorque = this._calculateTorque(this.enginePower);
        this.maxRPM = options.maxRPM || 6000;
        this.idleRPM = options.idleRPM || 800;
        this.currentRPM = this.idleRPM;

        // Transmission
        this.gearRatios = options.gearRatios || [3.5, 2.5, 1.8, 1.3, 1.0, 0.8]; // 6-speed
        this.currentGear = 1; // Start in first gear
        this.finalDriveRatio = options.finalDriveRatio || 3.5;
        this.autoTransmission = options.autoTransmission !== false;

        // Drivetrain
        this.drivetrain = options.drivetrain || 'RWD'; // 'FWD', 'RWD', 'AWD'

        // Steering
        this.maxSteerAngle = options.maxSteerAngle || 0.6; // radians (~35 degrees)
        this.steerSpeed = options.steerSpeed || 3.0;
        this.currentSteerAngle = 0;

        // Friction and Grip
        this.tireGrip = options.tireGrip || 2.5;
        this.brakeTorque = options.brakeTorque || 3000;

        // Aerodynamics
        this.dragCoefficient = options.dragCoefficient || 0.3;
        this.downforceCoefficient = options.downforceCoefficient || 0.5;

        this.wheels = [];
        this.wheelVisuals = []; // Three.js mesh references for visual updates

        // Inputs
        this.input = {
            throttle: 0,    // -1 to 1 (negative for reverse)
            steering: 0,    // -1 to 1
            brake: 0,       // 0 to 1
            handbrake: 0    // 0 to 1
        };

        // Audio callback for engine sounds
        this.onRPMChange = options.onRPMChange || null;
    }

    /**
     * Add a wheel to the vehicle
     * @param {THREE.Vector3} connectionPoint - Local position on chassis
     * @param {boolean} isFront - Front wheels (for steering)
     * @param {boolean} isPowered - Driven wheels (for power delivery)
     * @param {THREE.Object3D} visual - Optional visual mesh
     */
    addWheel(connectionPoint, isFront = false, isPowered = false, visual = null) {
        this.wheels.push({
            connectionPoint: connectionPoint.clone(),
            isFront: isFront,
            isPowered: isPowered,
            suspensionLength: this.suspensionRestLength,
            steerAngle: 0,
            wheelSpeed: 0, // Angular velocity
            contact: null,
            visual: visual
        });

        if (visual) {
            this.wheelVisuals.push(visual);
        }
    }

    update(dt) {
        if (dt <= 0 || dt > 0.1) return; // Safety check

        // Get chassis properties
        const chassisPos = new THREE.Vector3().setFromMatrixPosition(this.chassis.object.matrixWorld);
        const chassisVel = this.chassis.velocity;
        const chassisTransform = this.chassis.object.matrixWorld;

        // Calculate direction vectors
        const forwardDir = new THREE.Vector3(0, 0, 1)
            .applyMatrix4(chassisTransform)
            .sub(chassisPos)
            .normalize();
        const rightDir = new THREE.Vector3(1, 0, 0)
            .applyMatrix4(chassisTransform)
            .sub(chassisPos)
            .normalize();
        const upDir = new THREE.Vector3(0, 1, 0)
            .applyMatrix4(chassisTransform)
            .sub(chassisPos)
            .normalize();

        // Calculate vehicle speed
        const forwardSpeed = chassisVel.dot(forwardDir);
        const speedKmh = Math.abs(forwardSpeed) * 3.6;

        // Update engine and transmission
        this._updateEngine(dt, speedKmh, forwardSpeed);

        // Smooth steering
        const targetSteer = this.input.steering * this.maxSteerAngle;
        this.currentSteerAngle = THREE.MathUtils.lerp(
            this.currentSteerAngle,
            targetSteer,
            dt * this.steerSpeed
        );

        // Process each wheel
        let totalDownforce = 0;

        for (const wheel of this.wheels) {
            const wheelPos = wheel.connectionPoint.clone().applyMatrix4(chassisTransform);

            // Apply steering to front wheels
            wheel.steerAngle = wheel.isFront ? this.currentSteerAngle : 0;

            // Calculate wheel-specific directions
            const wheelForward = this._rotateVectorY(forwardDir, wheel.steerAngle);
            const wheelRight = this._rotateVectorY(rightDir, wheel.steerAngle);

            // Raycast for suspension
            const rayDir = upDir.clone().negate();
            const rayLen = this.suspensionRestLength + this.radius;
            const hit = this.world.raycast(wheelPos, rayDir, rayLen);

            if (hit) {
                wheel.contact = hit;

                // ===== SUSPENSION =====
                const distance = hit.distance - this.radius;
                const compression = Math.max(0, this.suspensionRestLength - distance);
                const velProjected = chassisVel.dot(upDir);

                let suspensionForce = 0;
                if (compression > 0) {
                    suspensionForce = (compression * this.suspensionStiffness) -
                        (velProjected * this.suspensionDamping);
                    suspensionForce = Math.max(0, suspensionForce);
                }

                const suspensionVec = upDir.clone().multiplyScalar(suspensionForce);
                this.chassis.applyForceAtPoint(suspensionVec, wheelPos);
                totalDownforce += suspensionForce;

                // ===== LATERAL FRICTION (Grip) =====
                const lateralVel = chassisVel.dot(wheelRight);
                const grip = this.tireGrip * (1.0 - this.input.handbrake * 0.7);
                const frictionForce = -lateralVel * this.mass * 0.25 * grip;
                const frictionVec = wheelRight.clone().multiplyScalar(frictionForce);
                this.chassis.applyForceAtPoint(frictionVec, wheelPos);

                // ===== DRIVE FORCE =====
                if (this._isWheelPowered(wheel)) {
                    const driveTorque = this._calculateWheelTorque();
                    const driveForce = (driveTorque / this.radius) * this.input.throttle;
                    const driveVec = wheelForward.clone().multiplyScalar(driveForce);
                    this.chassis.applyForceAtPoint(driveVec, wheelPos);
                }

                // ===== BRAKING =====
                if (this.input.brake > 0) {
                    const brakeForce = -Math.sign(forwardSpeed) * this.input.brake * this.brakeTorque;
                    const brakeVec = wheelForward.clone().multiplyScalar(brakeForce);
                    this.chassis.applyForceAtPoint(brakeVec, wheelPos);
                }

                // Update wheel visual suspension
                wheel.suspensionLength = distance;

            } else {
                wheel.contact = null;
                wheel.suspensionLength = this.suspensionRestLength;
            }

            // Update wheel rotation for visuals
            if (wheel.visual) {
                this._updateWheelVisual(wheel, forwardSpeed, dt);
            }
        }

        // ===== AERODYNAMICS =====
        const speed = chassisVel.length();
        const speedSq = speed * speed;

        // Drag
        const drag = -speedSq * this.dragCoefficient;
        const dragVec = chassisVel.clone().normalize().multiplyScalar(drag);
        this.chassis.applyForce(dragVec);

        // Downforce
        const downforce = -speedSq * this.downforceCoefficient;
        const downforceVec = upDir.clone().multiplyScalar(downforce);
        this.chassis.applyForce(downforceVec);
    }

    _calculateTorque(hp) {
        // Simplified: Peak torque ~200-400 Nm for typical car
        return (hp * 1.5);
    }

    _updateEngine(dt, speedKmh, forwardSpeed) {
        // Auto-transmission gear selection
        if (this.autoTransmission) {
            if (speedKmh > 120 && this.currentGear < this.gearRatios.length - 1) {
                this.currentGear++;
            } else if (speedKmh < 40 && this.currentGear > 0) {
                this.currentGear--;
            }
        }

        // Calculate RPM based on wheel speed and gear
        const gearRatio = this.gearRatios[this.currentGear] * this.finalDriveRatio;
        const wheelRPS = Math.abs(forwardSpeed) / (2 * Math.PI * this.radius);
        const engineRPS = wheelRPS * gearRatio;
        const calculatedRPM = engineRPS * 60;

        // Blend RPM (with throttle influence)
        const targetRPM = Math.max(
            this.idleRPM,
            Math.min(this.maxRPM, calculatedRPM + this.input.throttle * 1000)
        );

        this.currentRPM = THREE.MathUtils.lerp(this.currentRPM, targetRPM, dt * 5);

        // Trigger audio callback
        if (this.onRPMChange) {
            this.onRPMChange(this.currentRPM, this.maxRPM);
        }
    }

    _calculateWheelTorque() {
        // Torque curve (simplified)
        const rpmRatio = this.currentRPM / this.maxRPM;
        const torqueCurve = 1.0 - Math.pow(rpmRatio - 0.6, 2); // Peak at 60% RPM
        const engineTorqueNow = this.engineTorque * Math.max(0.3, torqueCurve);

        const gearRatio = this.gearRatios[this.currentGear];
        const totalRatio = gearRatio * this.finalDriveRatio;

        return engineTorqueNow * totalRatio;
    }

    _isWheelPowered(wheel) {
        if (this.drivetrain === 'AWD') return true;
        if (this.drivetrain === 'FWD') return wheel.isFront;
        if (this.drivetrain === 'RWD') return !wheel.isFront;
        return false;
    }

    _rotateVectorY(vec, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector3(
            vec.x * cos + vec.z * sin,
            vec.y,
            -vec.x * sin + vec.z * cos
        );
    }

    _updateWheelVisual(wheel, forwardSpeed, dt) {
        if (!wheel.visual) return;

        // Update wheel rotation (around X axis)
        const wheelRPS = forwardSpeed / (2 * Math.PI * this.radius);
        wheel.visual.rotation.x += wheelRPS * dt * 2 * Math.PI;

        // Update steering (around Y axis)
        wheel.visual.rotation.y = wheel.steerAngle;

        // Update suspension compression (position along Y)
        const compressionOffset = this.suspensionRestLength - wheel.suspensionLength;
        const localY = wheel.connectionPoint.y - compressionOffset;
        wheel.visual.position.y = localY;
    }

    /**
     * Set vehicle input
     * @param {number} throttle - -1 to 1 (negative for reverse)
     * @param {number} steering - -1 to 1 (left to right)
     * @param {number} brake - 0 to 1
     * @param {number} handbrake - 0 to 1
     */
    setInput(throttle, steering, brake = 0, handbrake = 0) {
        this.input.throttle = THREE.MathUtils.clamp(throttle, -1, 1);
        this.input.steering = THREE.MathUtils.clamp(steering, -1, 1);
        this.input.brake = THREE.MathUtils.clamp(brake, 0, 1);
        this.input.handbrake = THREE.MathUtils.clamp(handbrake, 0, 1);
    }

    /**
     * Shift gear manually
     * @param {number} gear - Gear index (0 = reverse, 1-6 = forward)
     */
    shiftGear(gear) {
        if (gear >= 0 && gear < this.gearRatios.length) {
            this.currentGear = gear;
        }
    }

    /**
     * Get current vehicle stats
     * @returns {Object}
     */
    getStats() {
        return {
            rpm: this.currentRPM,
            gear: this.currentGear + 1,
            speed: this.chassis.velocity.length() * 3.6, // km/h
            wheelsOnGround: this.wheels.filter(w => w.contact !== null).length
        };
    }
}
