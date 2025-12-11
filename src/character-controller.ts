import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';

/**
 * Configuration for the character controller
 */
export interface CharacterConfig {
    /** Movement speed in units per second */
    moveSpeed: number;
    /** Rotation speed in radians per second */
    rotationSpeed: number;
    /** Height of the character */
    height: number;
    /** Spawn position */
    spawnPosition: Vector3;
    /** Gravity strength */
    gravity: number;
}

/**
 * Default character configuration
 */
export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
    moveSpeed: 25,           // Units per second
    rotationSpeed: 10,       // Radians per second
    height: 2.0,             // 2 meters tall
    spawnPosition: new Vector3(0, 100, 0),  // Start above terrain, will fall down
    gravity: 40,             // Gravity acceleration
};

/**
 * Third-person character controller with WASD movement
 * Creates a simple mannequin and handles keyboard input for movement
 */
export class CharacterController {
    private scene: Scene;
    private terrain: Mesh | null;
    private config: CharacterConfig;

    // Character mesh - this is the main collider mesh that handles physics
    private colliderMesh!: Mesh;

    // Visual components (parented to collider)
    private bodyMesh!: Mesh;
    private headMesh!: Mesh;

    // Input state
    private keys: { [key: string]: boolean } = {};

    // Movement state
    private verticalVelocity: number = 0;
    private isGrounded: boolean = false;

    constructor(scene: Scene, terrain: Mesh | null, config: Partial<CharacterConfig> = {}) {
        this.scene = scene;
        this.terrain = terrain;
        this.config = { ...DEFAULT_CHARACTER_CONFIG, ...config };
    }

    /**
     * Initialize the character controller
     */
    async init(): Promise<void> {
        console.log('🧍 Initializing character controller...');

        // Enable collisions in the scene
        this.scene.collisionsEnabled = true;

        // Enable collision on terrain if available
        if (this.terrain) {
            this.terrain.checkCollisions = true;
            console.log('   ✅ Terrain collision enabled');
        }

        // Create the mannequin mesh
        this.createMannequin();

        // Setup keyboard input handlers
        this.setupInputHandlers();

        // Setup per-frame update
        this.setupUpdateLoop();

        console.log('✅ Character controller initialized');
        console.log('   ⌨️  Use WASD to move the character');
    }

    /**
     * Create a simple mannequin from primitive shapes
     */
    private createMannequin(): void {
        // Create material for the mannequin
        const mannequinMaterial = new StandardMaterial('mannequinMaterial', this.scene);
        mannequinMaterial.diffuseColor = new Color3(0.8, 0.7, 0.6);  // Skin-like tan color
        mannequinMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

        // Create the main collision mesh (box is more stable for collision)
        this.colliderMesh = MeshBuilder.CreateBox('characterCollider', {
            width: 0.8,
            height: 2.0,
            depth: 0.8,
        }, this.scene);
        this.colliderMesh.isVisible = false;  // Hide the collision box
        this.colliderMesh.position = this.config.spawnPosition.clone();

        // Configure collision ellipsoid for moveWithCollisions
        this.colliderMesh.ellipsoid = new Vector3(0.5, 1.0, 0.5);
        this.colliderMesh.ellipsoidOffset = new Vector3(0, 1.0, 0);
        this.colliderMesh.checkCollisions = true;

        // Create visible body (capsule shape) - parented to the collider
        this.bodyMesh = MeshBuilder.CreateCapsule('characterBody', {
            height: 1.4,
            radius: 0.25,
            tessellation: 16,
            subdivisions: 4,
        }, this.scene);
        this.bodyMesh.material = mannequinMaterial;
        this.bodyMesh.parent = this.colliderMesh;
        this.bodyMesh.position = Vector3.Zero();  // Centered on parent

        // Create head (sphere) - parented to the collider
        this.headMesh = MeshBuilder.CreateSphere('characterHead', {
            diameter: 0.35,
            segments: 12,
        }, this.scene);
        this.headMesh.material = mannequinMaterial;
        this.headMesh.parent = this.colliderMesh;
        this.headMesh.position.y = 0.9;  // Position head at top of body

        console.log('   ✅ Mannequin created at', this.config.spawnPosition.toString());
    }

    /**
     * Setup keyboard input event handlers
     */
    private setupInputHandlers(): void {
        // Key down event
        window.addEventListener('keydown', (event) => {
            this.keys[event.key.toLowerCase()] = true;
        });

        // Key up event
        window.addEventListener('keyup', (event) => {
            this.keys[event.key.toLowerCase()] = false;
        });
    }

    /**
     * Setup the per-frame update loop
     */
    private setupUpdateLoop(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            this.update();
        });
    }

    /**
     * Per-frame update for character movement
     */
    private update(): void {
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;  // Convert to seconds

        // Get camera for movement direction reference
        const camera = this.scene.activeCamera;
        if (!camera) return;

        // Calculate movement input
        let inputX = 0;
        let inputZ = 0;

        if (this.keys['w']) inputZ = 1;
        if (this.keys['s']) inputZ = -1;
        if (this.keys['a']) inputX = -1;
        if (this.keys['d']) inputX = 1;

        // Check if there's any movement input
        const hasInput = inputX !== 0 || inputZ !== 0;

        // Build velocity vector
        let velocityX = 0;
        let velocityZ = 0;

        if (hasInput) {
            // Get camera's forward and right directions (projected to horizontal plane)
            const cameraForward = camera.getDirection(Vector3.Forward());
            const cameraRight = camera.getDirection(Vector3.Right());

            // Project to horizontal plane (Y = 0)
            cameraForward.y = 0;
            cameraForward.normalize();
            cameraRight.y = 0;
            cameraRight.normalize();

            // Calculate movement direction based on camera orientation
            const moveDirection = cameraForward.scale(inputZ).add(cameraRight.scale(inputX));
            moveDirection.normalize();

            // Calculate horizontal velocity
            velocityX = moveDirection.x * this.config.moveSpeed * deltaTime;
            velocityZ = moveDirection.z * this.config.moveSpeed * deltaTime;

            // Calculate target rotation to face movement direction
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);

            // Smoothly rotate character towards movement direction
            const currentRotation = this.colliderMesh.rotation.y;
            let rotationDiff = targetRotation - currentRotation;

            // Normalize rotation difference to [-PI, PI]
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;

            // Apply smooth rotation
            const rotationStep = this.config.rotationSpeed * deltaTime;
            if (Math.abs(rotationDiff) < rotationStep) {
                this.colliderMesh.rotation.y = targetRotation;
            } else {
                this.colliderMesh.rotation.y += Math.sign(rotationDiff) * rotationStep;
            }
        }

        // Apply gravity only when not grounded
        if (!this.isGrounded) {
            this.verticalVelocity -= this.config.gravity * deltaTime;

            // Clamp falling speed
            if (this.verticalVelocity < -50) {
                this.verticalVelocity = -50;
            }
        } else {
            // When grounded, apply a small downward force to keep snapped to ground
            // This prevents floating over slight terrain changes
            this.verticalVelocity = -0.1;
        }

        // Build final velocity
        const velocity = new Vector3(velocityX, this.verticalVelocity * deltaTime, velocityZ);

        // Store Y position before move to detect ground collision
        const previousY = this.colliderMesh.position.y;

        // Apply movement with collisions
        this.colliderMesh.moveWithCollisions(velocity);

        // Check if we hit ground (Y position didn't change much despite downward velocity)
        const currentY = this.colliderMesh.position.y;
        const actualYMovement = currentY - previousY;  // Positive = moved up, negative = moved down
        const intendedYMovement = velocity.y;  // Should be negative when falling

        // Ground detection: we're grounded if we tried to move down but didn't move down as expected
        if (intendedYMovement < -0.0001) {  // We were trying to move down
            // If we didn't move down (or moved up due to slope), we're on the ground
            if (actualYMovement >= intendedYMovement * 0.5) {
                // We hit something below - now grounded
                this.isGrounded = true;
                this.verticalVelocity = 0;
            } else {
                // We're falling freely (moved nearly as much as intended)
                this.isGrounded = false;
            }
        }
    }

    /**
     * Get the main character mesh (for camera targeting)
     */
    getMesh(): Mesh {
        return this.colliderMesh;
    }

    /**
     * Get the character's current position
     */
    getPosition(): Vector3 {
        return this.colliderMesh.position.clone();
    }

    /**
     * Set the character's position
     */
    setPosition(position: Vector3): void {
        this.colliderMesh.position = position.clone();
    }

    /**
     * Dispose of the character controller
     */
    dispose(): void {
        this.bodyMesh?.dispose();
        this.headMesh?.dispose();
        this.colliderMesh?.dispose();
    }
}
