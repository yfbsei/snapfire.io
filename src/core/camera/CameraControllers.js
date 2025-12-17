import * as THREE from 'three';

/**
 * FPSCamera - First-person camera controller
 * Handles mouse look with pointer lock
 */
export class FPSCamera {
    constructor(camera, options = {}) {
        this.camera = camera;

        // Sensitivity
        this.sensitivity = options.sensitivity ?? 0.002;

        // Pitch limits (radians)
        this.minPitch = options.minPitch ?? -Math.PI / 2 + 0.1;
        this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.1;

        // Current rotation
        this.pitch = 0; // Up/down
        this.yaw = 0;   // Left/right

        // Target object (optional - for player body rotation)
        this.target = options.target || null;

        // Height offset from target
        this.heightOffset = options.heightOffset ?? 1.6;

        // Input reference
        this.input = options.input || null;
    }

    /**
     * Update camera based on input
     * @param {number} deltaTime
     * @param {{x: number, y: number}} mouseDelta
     */
    update(deltaTime, mouseDelta = null) {
        // Get mouse delta from input manager or parameter
        let delta = mouseDelta;
        if (!delta && this.input) {
            delta = this.input.getMouseDelta();
        }

        if (!delta) return;

        // Apply mouse movement
        this.yaw -= delta.x * this.sensitivity;
        this.pitch -= delta.y * this.sensitivity;

        // Clamp pitch
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

        // Apply rotation to camera
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.y = this.yaw;

        // If we have a target, rotate it for body yaw
        if (this.target) {
            this.target.rotation.y = this.yaw;

            // Position camera at target + height offset
            this.camera.position.copy(this.target.position);
            this.camera.position.y += this.heightOffset;
        }
    }

    /**
     * Set rotation directly
     * @param {number} yaw - Radians
     * @param {number} pitch - Radians
     */
    setRotation(yaw, pitch) {
        this.yaw = yaw;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, pitch));
    }

    /**
     * Get forward direction (for movement)
     * @returns {THREE.Vector3}
     */
    getForward() {
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return forward;
    }

    /**
     * Get right direction (for strafing)
     * @returns {THREE.Vector3}
     */
    getRight() {
        const right = new THREE.Vector3(1, 0, 0);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return right;
    }

    /**
     * Get movement direction based on input
     * @param {{x: number, z: number}} moveInput - Normalized movement input
     * @returns {THREE.Vector3}
     */
    getMoveDirection(moveInput) {
        const direction = new THREE.Vector3();

        if (moveInput.z !== 0 || moveInput.x !== 0) {
            const forward = this.getForward();
            const right = this.getRight();

            direction.addScaledVector(forward, -moveInput.z);
            direction.addScaledVector(right, moveInput.x);
            direction.normalize();
        }

        return direction;
    }
}

/**
 * TPSCamera - Third-person camera controller
 * Over-shoulder camera with collision avoidance
 */
export class TPSCamera {
    constructor(camera, target, options = {}) {
        this.camera = camera;
        this.target = target; // Object to follow

        // Camera settings
        this.distance = options.distance ?? 4;
        this.minDistance = options.minDistance ?? 1;
        this.maxDistance = options.maxDistance ?? 10;

        // Offset from target (shoulder offset)
        this.offset = options.offset ?? new THREE.Vector3(0.5, 1.6, 0);

        // Rotation
        this.yaw = 0;
        this.pitch = options.pitch ?? 0.2;
        this.sensitivity = options.sensitivity ?? 0.002;

        // Pitch limits
        this.minPitch = options.minPitch ?? -0.5;
        this.maxPitch = options.maxPitch ?? 1.2;

        // Smoothing
        this.smoothing = options.smoothing ?? 0.1;

        // Collision
        this.collisionEnabled = options.collision ?? true;
        this.collisionRadius = options.collisionRadius ?? 0.2;
        this.physics = options.physics || null;

        // Current position (for smoothing)
        this._currentPosition = new THREE.Vector3();
        this._targetPosition = new THREE.Vector3();

        // Input reference
        this.input = options.input || null;

        // Initialize position
        if (target) {
            this._currentPosition.copy(target.position);
        }
    }

    /**
     * Update camera
     * @param {number} deltaTime
     * @param {{x: number, y: number}} mouseDelta
     */
    update(deltaTime, mouseDelta = null) {
        if (!this.target) return;

        // Get mouse delta
        let delta = mouseDelta;
        if (!delta && this.input) {
            delta = this.input.getMouseDelta();
        }

        // Apply rotation from input
        if (delta) {
            this.yaw -= delta.x * this.sensitivity;
            this.pitch -= delta.y * this.sensitivity;
            this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
        }

        // Calculate ideal camera position
        const targetPos = this.target.position.clone().add(this.offset);

        // Spherical offset based on yaw/pitch
        const sphericalOffset = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
            Math.sin(this.pitch) * this.distance,
            Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance
        );

        this._targetPosition.copy(targetPos).add(sphericalOffset);

        // Collision check
        if (this.collisionEnabled && this.physics) {
            const direction = this._targetPosition.clone().sub(targetPos).normalize();
            const hit = this.physics.raycast(targetPos, direction, this.distance + 0.5);

            if (hit && hit.distance < this.distance) {
                // Move camera closer to avoid collision
                const safeDistance = Math.max(this.minDistance, hit.distance - this.collisionRadius);
                this._targetPosition.copy(targetPos).addScaledVector(direction, safeDistance);
            }
        }

        // Smooth camera movement
        const lerpFactor = 1 - Math.pow(this.smoothing, deltaTime * 60);
        this._currentPosition.lerp(this._targetPosition, lerpFactor);

        // Apply position and look at target
        this.camera.position.copy(this._currentPosition);
        this.camera.lookAt(targetPos);
    }

    /**
     * Set distance
     * @param {number} distance
     */
    setDistance(distance) {
        this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));
    }

    /**
     * Zoom (change distance)
     * @param {number} delta - Positive = zoom out, negative = zoom in
     */
    zoom(delta) {
        this.setDistance(this.distance + delta);
    }

    /**
     * Get forward direction (for player movement)
     * @returns {THREE.Vector3}
     */
    getForward() {
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return forward;
    }

    /**
     * Get right direction
     * @returns {THREE.Vector3}
     */
    getRight() {
        const right = new THREE.Vector3(1, 0, 0);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return right;
    }

    /**
     * Get movement direction based on input
     * @param {{x: number, z: number}} moveInput
     * @returns {THREE.Vector3}
     */
    getMoveDirection(moveInput) {
        const direction = new THREE.Vector3();

        if (moveInput.z !== 0 || moveInput.x !== 0) {
            const forward = this.getForward();
            const right = this.getRight();

            direction.addScaledVector(forward, -moveInput.z);
            direction.addScaledVector(right, moveInput.x);
            direction.normalize();
        }

        return direction;
    }
}

/**
 * OrbitCamera - Cinematic orbit camera
 */
export class OrbitCamera {
    constructor(camera, options = {}) {
        this.camera = camera;

        // Target point to orbit around
        this.target = options.target ?? new THREE.Vector3(0, 0, 0);

        // Orbit settings
        this.distance = options.distance ?? 10;
        this.minDistance = options.minDistance ?? 2;
        this.maxDistance = options.maxDistance ?? 50;

        this.yaw = options.yaw ?? 0;
        this.pitch = options.pitch ?? 0.5;
        this.minPitch = options.minPitch ?? 0.1;
        this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.1;

        // Auto-rotation
        this.autoRotate = options.autoRotate ?? false;
        this.autoRotateSpeed = options.autoRotateSpeed ?? 0.5;

        // Damping
        this.damping = options.damping ?? 0.05;
        this._yawVelocity = 0;
        this._pitchVelocity = 0;
    }

    /**
     * Update camera
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // Auto-rotate
        if (this.autoRotate) {
            this.yaw += this.autoRotateSpeed * deltaTime;
        }

        // Apply damping
        this._yawVelocity *= 1 - this.damping;
        this._pitchVelocity *= 1 - this.damping;

        this.yaw += this._yawVelocity;
        this.pitch += this._pitchVelocity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

        // Calculate camera position
        const x = this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
        const y = this.target.y + Math.sin(this.pitch) * this.distance;
        const z = this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;

        this.camera.position.set(x, y, z);
        this.camera.lookAt(this.target);
    }

    /**
     * Rotate camera
     * @param {number} yawDelta
     * @param {number} pitchDelta
     */
    rotate(yawDelta, pitchDelta) {
        this._yawVelocity += yawDelta;
        this._pitchVelocity += pitchDelta;
    }

    /**
     * Zoom
     * @param {number} delta
     */
    zoom(delta) {
        this.distance = Math.max(
            this.minDistance,
            Math.min(this.maxDistance, this.distance + delta)
        );
    }

    /**
     * Set target
     * @param {THREE.Vector3} target
     */
    setTarget(target) {
        this.target.copy(target);
    }
}
