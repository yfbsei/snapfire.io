import * as THREE from 'three';
import { RigidBody, Collider } from './PhysicsWorld.js';

/**
 * CharacterController - First/Third person character movement
 * Handles ground detection, slopes, jumping, and gravity
 */
export class CharacterController {
    constructor(world, object3D, options = {}) {
        this.physics = world;
        this.object3D = object3D;

        // Movement settings
        this.moveSpeed = options.moveSpeed || 5;
        this.runSpeedMultiplier = options.runSpeedMultiplier || 1.8;
        this.jumpForce = options.jumpForce || 8;
        this.gravity = options.gravity || 20;

        // Ground detection
        this.groundCheckDistance = options.groundCheckDistance || 0.1;
        this.slopeLimit = options.slopeLimit || 45; // degrees
        this.stepHeight = options.stepHeight || 0.3;

        // State
        this.velocity = new THREE.Vector3();
        this.isGrounded = false;
        this.isRunning = false;
        this.isJumping = false;

        // Capsule collider properties
        this.height = options.height || 2;
        this.radius = options.radius || 0.3;

        // Input state
        this.input = {
            forward: 0,
            right: 0,
            jump: false
        };

        // Physics body
        this.rigidBody = null;

        // Camera reference for movement direction
        this.camera = options.camera || null;

        // Internal
        this._groundNormal = new THREE.Vector3(0, 1, 0);
        this._moveDirection = new THREE.Vector3();

        this.init();
    }

    /**
     * Initialize character components
     */
    init() {
        // Create kinematic rigid body with capsule shape
        this.rigidBody = this.physics.createRigidBody({
            object: this.object3D,
            type: 'kinematic',
            shape: 'capsule',
            radius: this.radius,
            height: this.height,
            useGravity: false // We handle gravity ourselves
        });
    }

    /**
     * Update character movement
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        // Get movement direction relative to camera
        this._updateMoveDirection();

        // Apply horizontal movement
        const speed = this.isRunning ? this.moveSpeed * this.runSpeedMultiplier : this.moveSpeed;
        this.velocity.x = this._moveDirection.x * speed;
        this.velocity.z = this._moveDirection.z * speed;

        // Apply gravity if not grounded
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
        } else {
            // On ground
            if (this.input.jump && !this.isJumping) {
                this.jump();
            } else {
                this.velocity.y = 0;
            }
        }

        // Clamp falling speed
        this.velocity.y = Math.max(this.velocity.y, -50);

        // Apply movement
        this.object3D.position.addScaledVector(this.velocity, deltaTime);

        // Ground check
        this._checkGround();

        // Reset jump input
        this.input.jump = false;
    }

    /**
     * Calculate movement direction based on camera
     * @private
     */
    _updateMoveDirection() {
        if (!this.camera) {
            this._moveDirection.set(this.input.right, 0, -this.input.forward);
            this._moveDirection.normalize();
            return;
        }

        // Get camera forward/right vectors
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
        cameraRight.normalize();

        // Calculate move direction
        this._moveDirection.set(0, 0, 0);
        this._moveDirection.addScaledVector(cameraDirection, this.input.forward);
        this._moveDirection.addScaledVector(cameraRight, this.input.right);

        if (this._moveDirection.lengthSq() > 0) {
            this._moveDirection.normalize();
        }
    }

    /**
     * Check if character is on ground
     * @private
     */
    /**
     * Check if character is on ground
     * @private
     */
    _checkGround() {
        const rayOrigin = this.object3D.position.clone();
        // Start slightly above feet to avoid skimming
        rayOrigin.y += this.height / 2; // Center of capsule

        const rayDir = new THREE.Vector3(0, -1, 0);
        // Cast down: Half height + check distance
        const rayLen = (this.height / 2) + this.groundCheckDistance;

        const hit = this.physics.raycast(rayOrigin, rayDir, rayLen);

        if (hit) {
            this._groundNormal.copy(hit.normal);

            // Slope check
            const slopeAngle = this._groundNormal.angleTo(new THREE.Vector3(0, 1, 0));
            if (slopeAngle > THREE.MathUtils.degToRad(this.slopeLimit)) {
                // Too steep
                this.isGrounded = false;
                return;
            }

            if (this.velocity.y <= 0) {
                this.isGrounded = true;
                this.isJumping = false;

                // Snap to ground (optional, or let physics solve it)
                // For kinematic we manually snap
                this.object3D.position.y = hit.point.y + (this.height / 2);
                this.velocity.y = 0;
            }
        } else {
            this.isGrounded = false;
            this._groundNormal.set(0, 1, 0);
        }
    }

    /**
     * Perform ground check against terrain/physics
     * @param {Function} heightFunc - (x, z) => ground height
     */
    checkGroundWithTerrain(heightFunc) {
        const pos = this.object3D.position;
        const groundHeight = heightFunc(pos.x, pos.z);
        const feetY = pos.y - this.height / 2;

        if (feetY <= groundHeight + this.groundCheckDistance) {
            if (this.velocity.y <= 0) {
                this.isGrounded = true;
                this.isJumping = false;
                this.object3D.position.y = groundHeight + this.height / 2;
            }
        } else {
            this.isGrounded = false;
        }
    }

    /**
     * Make the character jump
     */
    jump() {
        if (this.isGrounded && !this.isJumping) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
            this.isJumping = true;
        }
    }

    /**
     * Set movement input
     * @param {number} forward - -1 to 1 (backward to forward)
     * @param {number} right - -1 to 1 (left to right)
     */
    setMoveInput(forward, right) {
        this.input.forward = Math.max(-1, Math.min(1, forward));
        this.input.right = Math.max(-1, Math.min(1, right));
    }

    /**
     * Trigger jump on next update
     */
    setJumpInput(jump) {
        this.input.jump = jump;
    }

    /**
     * Set running state
     */
    setRunning(running) {
        this.isRunning = running;
    }

    /**
     * Teleport character to position
     */
    teleport(position) {
        this.object3D.position.copy(position);
        this.velocity.set(0, 0, 0);
    }

    /**
     * Set camera for movement direction
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * Get current movement state
     */
    getState() {
        return {
            position: this.object3D.position.clone(),
            velocity: this.velocity.clone(),
            isGrounded: this.isGrounded,
            isRunning: this.isRunning,
            isJumping: this.isJumping
        };
    }

    /**
     * Dispose
     */
    dispose() {
        if (this.rigidBody) this.rigidBody.dispose();
        if (this.collider) this.collider.dispose();
    }
}
