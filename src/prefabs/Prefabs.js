import * as THREE from 'three';
import { GameObject } from '../core/GameObject.js';
import { Script } from '../core/scripting/Script.js';

/**
 * Prefab - Base class for reusable game object templates
 */
export class Prefab {
    /**
     * Create an instance of this prefab
     * @param {GameEngine} engine
     * @param {Object} options
     * @returns {GameObject}
     */
    static create(engine, options = {}) {
        throw new Error('Prefab.create() must be implemented by subclass');
    }
}

// ==================== Dual Mode Player (FPS/TPS Toggle) ====================

/**
 * DualModePlayerScript - FPS/TPS player controller with V key toggle
 */
export class DualModePlayerScript extends Script {
    start() {
        // Movement settings
        this.speed = this.options?.speed ?? 5;
        this.sprintMultiplier = this.options?.sprintMultiplier ?? 2;
        this.jumpForce = this.options?.jumpForce ?? 8;
        this.gravity = this.options?.gravity ?? 25;
        this.playerHeight = this.options?.playerHeight ?? 0.9;

        // State
        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this.canJump = true;

        // Camera mode
        this.cameraMode = this.options?.startMode ?? 'fps';
        this.cameraSwitchCooldown = 0;

        // Terrain height function
        this.getGroundHeight = this.options?.getGroundHeight ?? null;

        // TPS rotation tracking
        this._targetRotation = 0;
        this.rotationSpeed = 10;

        // Setup initial camera
        this._setupCamera();
    }

    _setupCamera() {
        if (this.cameraMode === 'fps') {
            this.engine.setupFPSCamera({
                target: this.gameObject.object3D,
                heightOffset: this.playerHeight * 0.8,
                sensitivity: 0.002
            });
        } else {
        }

        // Hide/Show player mesh based on mode (prevents glare from inside capsule in FPS)
        if (this.gameObject.object3D) {
            this.gameObject.object3D.visible = (this.cameraMode === 'tps');
        }
        // console.log('Camera mode:', this.cameraMode.toUpperCase(), 'Mesh visible:', this.gameObject.object3D.visible);
    }

    update(deltaTime) {
        // Update cooldown
        this.cameraSwitchCooldown = Math.max(0, this.cameraSwitchCooldown - deltaTime);

        // Handle camera toggle (V key)
        if (this.input.isKeyPressed('KeyV') && this.cameraSwitchCooldown <= 0) {
            this.cameraMode = this.cameraMode === 'fps' ? 'tps' : 'fps';
            this._setupCamera();
            this.cameraSwitchCooldown = 0.5;
        }

        if (!this.engine.cameraController) return;

        // Get movement input
        const moveInput = this.input.getMovementInput();
        const isMoving = moveInput.x !== 0 || moveInput.z !== 0;

        if (isMoving) {
            const direction = this.engine.cameraController.getMoveDirection(moveInput);

            // Apply sprint
            let speed = this.speed;
            if (this.input.isActionDown('sprint')) {
                speed *= this.sprintMultiplier;
            }

            // Horizontal movement
            this.transform.position.x += direction.x * speed * deltaTime;
            this.transform.position.z += direction.z * speed * deltaTime;

            // In TPS mode, rotate player to face movement direction
            if (this.cameraMode === 'tps') {
                this._targetRotation = Math.atan2(direction.x, direction.z);
                const currentY = this.transform.rotation.y;
                const diff = this._targetRotation - currentY;
                this.transform.rotation.y += diff * this.rotationSpeed * deltaTime;
            }
        }

        // Jumping
        if (this.isGrounded && this.input.isActionPressed('jump') && this.canJump) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
            this.canJump = false;
        }

        // Gravity
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
        }
        this.transform.position.y += this.velocity.y * deltaTime;

        // Ground check
        let groundHeight = 0;
        if (this.getGroundHeight) {
            groundHeight = this.getGroundHeight(this.transform.position.x, this.transform.position.z);
        }

        const targetY = groundHeight + this.playerHeight;

        if (this.transform.position.y <= targetY) {
            this.transform.position.y = targetY;
            this.velocity.y = 0;
            this.isGrounded = true;
            this.canJump = true;
        }
    }
}

/**
 * DualModePlayer Prefab - Player with FPS/TPS toggle support
 */
export class DualModePlayer extends Prefab {
    static create(engine, options = {}) {
        const height = options.height ?? 1.8;
        const radius = options.radius ?? 0.3;

        // Create player capsule
        const geometry = new THREE.CapsuleGeometry(radius, height - radius * 2, 8, 16);
        const material = new THREE.MeshStandardMaterial({
            color: options.color ?? 0x4a90d9,
            roughness: 1.0, // Forced matte (was 0.5)
            metalness: 0.0  // Ensure no metallic reflections
        });

        const go = new GameObject(options.name ?? 'Player');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        go.object3D.add(mesh);

        // Position
        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? height / 2,
            options.z ?? 0
        );

        // Add to scene
        engine.addGameObject(go);

        // Add dual mode player script
        const script = go.addScript(DualModePlayerScript, engine);
        script.options = {
            speed: options.speed ?? 5,
            sprintMultiplier: options.sprintMultiplier ?? 2,
            jumpForce: options.jumpForce ?? 8,
            gravity: options.gravity ?? 25,
            playerHeight: height / 2,
            startMode: options.startMode ?? 'fps',
            getGroundHeight: options.getGroundHeight ?? null
        };

        // Also set getGroundHeight directly
        if (options.getGroundHeight) {
            script.getGroundHeight = options.getGroundHeight;
        }

        return go;
    }
}

// ==================== FPS Player Prefab ====================

/**
 * FPS Player Controller Script
 */
export class FPSPlayerScript extends Script {
    start() {
        this.speed = this.options?.speed ?? 5;
        this.sprintMultiplier = this.options?.sprintMultiplier ?? 2;
        this.jumpForce = this.options?.jumpForce ?? 8;
        this.gravity = this.options?.gravity ?? 20;
        this.playerHeight = this.options?.playerHeight ?? 1;

        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this.canJump = true;

        // Terrain height function - can be set externally
        this.getGroundHeight = this.options?.getGroundHeight ?? null;
    }

    update(deltaTime) {
        if (!this.engine.cameraController) return;

        // Get movement input
        const moveInput = this.input.getMovementInput();
        const direction = this.engine.cameraController.getMoveDirection(moveInput);

        // Apply sprint
        let speed = this.speed;
        if (this.input.isActionDown('sprint')) {
            speed *= this.sprintMultiplier;
        }

        // Horizontal movement
        this.transform.position.x += direction.x * speed * deltaTime;
        this.transform.position.z += direction.z * speed * deltaTime;

        // Jumping
        if (this.isGrounded && this.input.isActionPressed('jump') && this.canJump) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
            this.canJump = false;
        }

        // Gravity
        if (!this.isGrounded) {
            this.velocity.y -= this.gravity * deltaTime;
        }
        this.transform.position.y += this.velocity.y * deltaTime;

        // Ground check - use terrain height function if available
        let groundHeight = this.options?.groundHeight ?? 0;
        if (this.getGroundHeight) {
            groundHeight = this.getGroundHeight(this.transform.position.x, this.transform.position.z);
        }

        const targetY = groundHeight + this.playerHeight;

        if (this.transform.position.y <= targetY) {
            this.transform.position.y = targetY;
            this.velocity.y = 0;
            this.isGrounded = true;
            this.canJump = true;
        }
    }
}

/**
 * FPS Player Prefab
 */
export class FPSPlayer extends Prefab {
    static create(engine, options = {}) {
        const height = options.height ?? 1.8;
        const radius = options.radius ?? 0.3;

        // Create player capsule
        const geometry = new THREE.CapsuleGeometry(radius, height - radius * 2, 8, 16);
        const material = new THREE.MeshStandardMaterial({
            color: options.color ?? 0x4a90d9,
            roughness: 1.0, // Forced matte
            metalness: 0.0
        });

        const go = new GameObject(options.name ?? 'FPSPlayer');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.visible = false; // Always hidden in FPS mode
        go.object3D.add(mesh);

        // Position
        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? height / 2,
            options.z ?? 0
        );

        // Add to scene
        engine.addGameObject(go);

        // Setup FPS camera
        engine.setupFPSCamera({
            target: go.object3D,
            heightOffset: height * 0.4,
            sensitivity: options.sensitivity ?? 0.002
        });

        // Add player script
        const script = go.addScript(FPSPlayerScript, engine);
        script.options = {
            speed: options.speed ?? 5,
            sprintMultiplier: options.sprintMultiplier ?? 2,
            jumpForce: options.jumpForce ?? 8,
            gravity: options.gravity ?? 20,
            playerHeight: height / 2, // Half height for capsule center offset
            groundHeight: 0,
            getGroundHeight: options.getGroundHeight ?? null
        };

        // Also set directly on script for immediate access
        if (options.getGroundHeight) {
            script.getGroundHeight = options.getGroundHeight;
        }

        return go;
    }
}

// ==================== TPS Player Prefab ====================

/**
 * TPS Player Controller Script
 */
export class TPSPlayerScript extends Script {
    start() {
        this.speed = this.options?.speed ?? 5;
        this.sprintMultiplier = this.options?.sprintMultiplier ?? 2;
        this.jumpForce = this.options?.jumpForce ?? 8;
        this.gravity = this.options?.gravity ?? 20;
        this.rotationSpeed = this.options?.rotationSpeed ?? 10;

        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this._targetRotation = 0;
    }

    update(deltaTime) {
        if (!this.engine.cameraController) return;

        const moveInput = this.input.getMovementInput();

        if (moveInput.x !== 0 || moveInput.z !== 0) {
            // Get camera-relative direction
            const direction = this.engine.cameraController.getMoveDirection(moveInput);

            // Rotate player to face movement direction
            this._targetRotation = Math.atan2(direction.x, direction.z);

            // Apply sprint
            let speed = this.speed;
            if (this.input.isActionDown('sprint')) {
                speed *= this.sprintMultiplier;
            }

            // Move
            this.transform.position.x += direction.x * speed * deltaTime;
            this.transform.position.z += direction.z * speed * deltaTime;
        }

        // Smooth rotation
        const currentY = this.transform.rotation.y;
        const diff = this._targetRotation - currentY;
        this.transform.rotation.y += diff * this.rotationSpeed * deltaTime;

        // Jumping
        if (this.isGrounded && this.input.isActionPressed('jump')) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
        }

        // Gravity
        this.velocity.y -= this.gravity * deltaTime;
        this.transform.position.y += this.velocity.y * deltaTime;

        // Ground check
        if (this.transform.position.y <= 0) {
            this.transform.position.y = 0;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }
}

/**
 * TPS Player Prefab
 */
export class TPSPlayer extends Prefab {
    static create(engine, options = {}) {
        const height = options.height ?? 1.8;
        const radius = options.radius ?? 0.3;

        const geometry = new THREE.CapsuleGeometry(radius, height - radius * 2, 8, 16);
        const material = new THREE.MeshStandardMaterial({
            color: options.color ?? 0x4a90d9,
            roughness: 1.0, // Forced matte
            metalness: 0.0
        });

        const go = new GameObject(options.name ?? 'TPSPlayer');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        go.object3D.add(mesh);

        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? 0,
            options.z ?? 0
        );

        engine.addGameObject(go);

        // Setup TPS camera
        engine.setupTPSCamera(go.object3D, {
            distance: options.cameraDistance ?? 5,
            offset: new THREE.Vector3(0.5, height * 0.8, 0),
            sensitivity: options.sensitivity ?? 0.002
        });

        // Add player script
        const script = go.addScript(TPSPlayerScript, engine);
        script.options = options;

        return go;
    }
}

// ==================== Enemy Prefab ====================

/**
 * Basic Enemy AI Script
 */
export class EnemyAIScript extends Script {
    start() {
        this.speed = this.options?.speed ?? 2;
        this.detectionRange = this.options?.detectionRange ?? 15;
        this.attackRange = this.options?.attackRange ?? 2;
        this.health = this.options?.health ?? 100;

        this.target = null;
        this.state = 'idle'; // idle, chase, attack
        this._wanderTimer = 0;
        this._wanderDir = new THREE.Vector3();
    }

    update(deltaTime) {
        // Find player
        if (!this.target) {
            this.target = this.engine.findGameObject('FPSPlayer') ||
                this.engine.findGameObject('TPSPlayer') ||
                this.engine.findGameObject('Player');
        }

        if (!this.target) {
            this._wander(deltaTime);
            return;
        }

        const targetPos = this.target.transform.position;
        const myPos = this.transform.position;
        const distance = myPos.distanceTo(targetPos);

        if (distance < this.attackRange) {
            this.state = 'attack';
            this._attack();
        } else if (distance < this.detectionRange) {
            this.state = 'chase';
            this._chase(targetPos, deltaTime);
        } else {
            this.state = 'idle';
            this._wander(deltaTime);
        }
    }

    _chase(targetPos, deltaTime) {
        const direction = new THREE.Vector3()
            .subVectors(targetPos, this.transform.position)
            .normalize();

        direction.y = 0;

        this.transform.position.addScaledVector(direction, this.speed * deltaTime);
        this.transform.lookAt(targetPos.x, this.transform.position.y, targetPos.z);
    }

    _wander(deltaTime) {
        this._wanderTimer -= deltaTime;

        if (this._wanderTimer <= 0) {
            this._wanderTimer = 2 + Math.random() * 3;
            this._wanderDir.set(
                (Math.random() - 0.5) * 2,
                0,
                (Math.random() - 0.5) * 2
            ).normalize();
        }

        this.transform.position.addScaledVector(
            this._wanderDir,
            this.speed * 0.5 * deltaTime
        );
    }

    _attack() {
        // Override in subclass for attack behavior
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.engine.removeGameObject(this.gameObject);
    }
}

/**
 * Enemy Prefab
 */
export class Enemy extends Prefab {
    static create(engine, options = {}) {
        const size = options.size ?? 1;

        const geometry = new THREE.BoxGeometry(size, size * 1.5, size);
        const material = new THREE.MeshStandardMaterial({
            color: options.color ?? 0xff4444,
            roughness: 0.6
        });

        const go = new GameObject(options.name ?? 'Enemy');
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        go.object3D.add(mesh);

        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? size * 0.75,
            options.z ?? 0
        );
        go.tag = 'enemy';

        engine.addGameObject(go);

        const script = go.addScript(EnemyAIScript, engine);
        script.options = options;

        return go;
    }
}

// ==================== Pickup Prefab ====================

/**
 * Pickup Script - Collectible items
 */
export class PickupScript extends Script {
    start() {
        this.rotationSpeed = this.options?.rotationSpeed ?? 2;
        this.bobSpeed = this.options?.bobSpeed ?? 2;
        this.bobHeight = this.options?.bobHeight ?? 0.2;
        this.pickupRange = this.options?.pickupRange ?? 1.5;
        this.type = this.options?.type ?? 'item';
        this.value = this.options?.value ?? 1;

        this._startY = this.transform.position.y;
        this._time = Math.random() * Math.PI * 2;
    }

    update(deltaTime) {
        // Rotate
        this.transform.rotate(0, this.rotationSpeed * deltaTime * 60, 0);

        // Bob up and down
        this._time += deltaTime * this.bobSpeed;
        this.transform.position.y = this._startY + Math.sin(this._time) * this.bobHeight;

        // Check for player pickup
        const player = this.engine.findGameObject('FPSPlayer') ||
            this.engine.findGameObject('TPSPlayer') ||
            this.engine.findGameObject('Player');

        if (player) {
            const distance = this.transform.position.distanceTo(player.transform.position);
            if (distance < this.pickupRange) {
                this.collect(player);
            }
        }
    }

    collect(player) {
        // Override for custom behavior
        console.log(`Collected ${this.type} with value ${this.value}`);
        this.engine.removeGameObject(this.gameObject);
    }
}

/**
 * Pickup Prefab
 */
export class Pickup extends Prefab {
    static create(engine, options = {}) {
        const size = options.size ?? 0.5;
        const type = options.type ?? 'coin';

        let geometry;
        let color = options.color;

        switch (type) {
            case 'health':
                geometry = new THREE.BoxGeometry(size, size, size);
                color = color ?? 0xff6b6b;
                break;
            case 'ammo':
                geometry = new THREE.CylinderGeometry(size * 0.3, size * 0.3, size, 8);
                color = color ?? 0xffd93d;
                break;
            case 'coin':
            default:
                geometry = new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.15, 16);
                color = color ?? 0xffd700;
                break;
        }

        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.3,
            metalness: 0.8,
            emissive: color,
            emissiveIntensity: 0.2
        });

        const go = new GameObject(options.name ?? `Pickup_${type}`);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        go.object3D.add(mesh);

        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? 1,
            options.z ?? 0
        );
        go.tag = 'pickup';

        engine.addGameObject(go);

        const script = go.addScript(PickupScript, engine);
        script.options = { type, ...options };

        return go;
    }
}

// ==================== Projectile Prefab ====================

/**
 * Projectile Script
 */
export class ProjectileScript extends Script {
    start() {
        this.speed = this.options?.speed ?? 50;
        this.damage = this.options?.damage ?? 25;
        this.lifetime = this.options?.lifetime ?? 5;
        this.direction = this.options?.direction ?? new THREE.Vector3(0, 0, -1);

        this._age = 0;
    }

    update(deltaTime) {
        this._age += deltaTime;

        if (this._age >= this.lifetime) {
            this.engine.removeGameObject(this.gameObject);
            return;
        }

        // Move
        this.transform.position.addScaledVector(this.direction, this.speed * deltaTime);

        // Raycast for collision
        const hit = this.physics.raycast(
            this.transform.position,
            this.direction,
            this.speed * deltaTime
        );

        if (hit) {
            this.onHit(hit);
        }
    }

    onHit(hit) {
        // Apply damage to enemy
        if (hit.gameObject?.tag === 'enemy') {
            const enemyScript = hit.gameObject.getScript(EnemyAIScript);
            if (enemyScript) {
                enemyScript.takeDamage(this.damage);
            }
        }

        this.engine.removeGameObject(this.gameObject);
    }
}

/**
 * Projectile Prefab
 */
export class Projectile extends Prefab {
    static create(engine, options = {}) {
        const radius = options.radius ?? 0.05;

        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: options.color ?? 0xffff00
        });

        const go = new GameObject('Projectile');
        const mesh = new THREE.Mesh(geometry, material);
        go.object3D.add(mesh);

        go.transform.setPosition(
            options.x ?? 0,
            options.y ?? 0,
            options.z ?? 0
        );
        go.tag = 'projectile';

        engine.addGameObject(go);

        const script = go.addScript(ProjectileScript, engine);
        script.options = options;

        return go;
    }
}

// Export all prefabs
export const Prefabs = {
    DualModePlayer,
    FPSPlayer,
    TPSPlayer,
    Enemy,
    Pickup,
    Projectile
};
