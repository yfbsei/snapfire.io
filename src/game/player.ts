import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

// Import GLTF loader
import '@babylonjs/loaders/glTF';

// Character states for the state machine
enum CharacterState {
    IDLE,
    WALK,
    SPRINT,
    JUMP_START,
    JUMPING,      // In air - ascending
    FALLING,      // In air - descending
    LANDING,
    CROUCH_IDLE,
    CROUCH_WALK
}

export class ThirdPersonPlayer {
    private scene: Scene;
    private camera: ArcRotateCamera;
    private playerMesh: AbstractMesh | null = null;
    private colliderMesh: any;
    private rotationNode: any; // TransformNode for rotation (not affected by physics)
    private physicsAggregate: PhysicsAggregate;
    private inputMap: { [key: string]: boolean } = {};
    private characterSkeleton: any = null;

    // Animation properties
    private animations: Map<string, AnimationGroup> = new Map();
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: string = '';

    // State machine
    private state: CharacterState = CharacterState.IDLE;
    private previousState: CharacterState = CharacterState.IDLE;

    // Movement settings
    private walkSpeed = 3;
    private sprintSpeed = 6;
    private crouchSpeed = 1.5;
    private jumpForce = 8;
    private isGrounded = false;
    private wasGrounded = false;
    private currentSpeed = 0;
    private isSprinting = false;
    private isCrouching = false;
    private isJumping = false;
    private jumpCooldown = false;
    private jumpInitiatedTime: number = 0; // Track when jump started

    // Ground detection tracking
    private lastGroundedTime: number = 0;
    private lastAirborneTime: number = 0;
    private groundedVelocityThreshold: number = 1.5; // Increased from 0.5

    // Bone name mapping: animation library (DEF-*) -> character skeleton
    private static readonly BONE_MAPPING: { [key: string]: string } = {
        // Spine/Torso
        'DEF-hips': 'pelvis',
        'DEF-spine': 'pelvis',
        'DEF-spine.001': 'spine_01',
        'DEF-spine.002': 'spine_02',
        'DEF-spine.003': 'spine_03',
        'DEF-spine.004': 'spine_03',
        'DEF-spine.005': 'spine_03',
        'DEF-spine.006': 'spine_03',

        // Head/Neck
        'DEF-neck': 'neck_01',
        'DEF-head': 'Head',

        // Left Arm
        'DEF-shoulder.L': 'clavicle_l',
        'DEF-upper_arm.L': 'upperarm_l',
        'DEF-upper_arm.L.001': 'upperarm_l',
        'DEF-forearm.L': 'lowerarm_l',
        'DEF-forearm.L.001': 'lowerarm_l',
        'DEF-hand.L': 'hand_l',

        // Right Arm
        'DEF-shoulder.R': 'clavicle_r',
        'DEF-upper_arm.R': 'upperarm_r',
        'DEF-upper_arm.R.001': 'upperarm_r',
        'DEF-forearm.R': 'lowerarm_r',
        'DEF-forearm.R.001': 'lowerarm_r',
        'DEF-hand.R': 'hand_r',

        // Left Leg
        'DEF-thigh.L': 'thigh_l',
        'DEF-thigh.L.001': 'thigh_l',
        'DEF-shin.L': 'calf_l',
        'DEF-shin.L.001': 'calf_l',
        'DEF-foot.L': 'foot_l',
        'DEF-toe.L': 'ball_l',

        // Right Leg
        'DEF-thigh.R': 'thigh_r',
        'DEF-thigh.R.001': 'thigh_r',
        'DEF-shin.R': 'calf_r',
        'DEF-shin.R.001': 'calf_r',
        'DEF-foot.R': 'foot_r',
        'DEF-toe.R': 'ball_r',

        // Left Hand Fingers
        'DEF-f_index.01.L': 'index_01_l',
        'DEF-f_index.02.L': 'index_02_l',
        'DEF-f_index.03.L': 'index_03_l',
        'DEF-f_middle.01.L': 'middle_01_l',
        'DEF-f_middle.02.L': 'middle_02_l',
        'DEF-f_middle.03.L': 'middle_03_l',
        'DEF-f_ring.01.L': 'ring_01_l',
        'DEF-f_ring.02.L': 'ring_02_l',
        'DEF-f_ring.03.L': 'ring_03_l',
        'DEF-f_pinky.01.L': 'pinky_01_l',
        'DEF-f_pinky.02.L': 'pinky_02_l',
        'DEF-f_pinky.03.L': 'pinky_03_l',
        'DEF-thumb.01.L': 'thumb_01_l',
        'DEF-thumb.02.L': 'thumb_02_l',
        'DEF-thumb.03.L': 'thumb_03_l',

        // Right Hand Fingers
        'DEF-f_index.01.R': 'index_01_r',
        'DEF-f_index.02.R': 'index_02_r',
        'DEF-f_index.03.R': 'index_03_r',
        'DEF-f_middle.01.R': 'middle_01_r',
        'DEF-f_middle.02.R': 'middle_02_r',
        'DEF-f_middle.03.R': 'middle_03_r',
        'DEF-f_ring.01.R': 'ring_01_r',
        'DEF-f_ring.02.R': 'ring_02_r',
        'DEF-f_ring.03.R': 'ring_03_r',
        'DEF-f_pinky.01.R': 'pinky_01_r',
        'DEF-f_pinky.02.R': 'pinky_02_r',
        'DEF-f_pinky.03.R': 'pinky_03_r',
        'DEF-thumb.01.R': 'thumb_01_r',
        'DEF-thumb.02.R': 'thumb_02_r',
        'DEF-thumb.03.R': 'thumb_03_r',
    };

    // Animation name mapping: animation library name -> our key
    private static readonly ANIMATION_MAPPING: { [key: string]: string } = {
        'Idle_Loop': 'idle',
        'Walk_Loop': 'walk',
        'Sprint_Loop': 'sprint',
        'Jog_Fwd_Loop': 'jog',
        'Jump_Start': 'jumpStart',
        'Jump_Loop': 'jumping',
        'Jump_Land': 'landing',
        'Crouch_Idle_Loop': 'crouchIdle',
        'Crouch_Fwd_Loop': 'crouchWalk',
        'Roll': 'roll',
        'Death01': 'death',
        'Hit_Chest': 'hitChest',
        'Hit_Head': 'hitHead',
        'Dance_Loop': 'dance',
    };

    private constructor(scene: Scene, camera: ArcRotateCamera) {
        this.scene = scene;
        this.camera = camera;

        // Create invisible collider mesh for physics
        this.colliderMesh = MeshBuilder.CreateCapsule(
            'playerCollider',
            {
                height: 1.8,
                radius: 0.3,
                subdivisions: 16
            },
            scene
        );

        // Position collider above terrain
        this.colliderMesh.position = new Vector3(0, 20, 0);
        this.colliderMesh.isVisible = false;

        // Add physics to collider
        this.physicsAggregate = new PhysicsAggregate(
            this.colliderMesh,
            PhysicsShapeType.CAPSULE,
            {
                mass: 1,
                restitution: 0.1,
                friction: 0.5
            },
            scene
        );

        // Lock rotation so player doesn't fall over
        this.physicsAggregate.body.setAngularDamping(1000);
        this.physicsAggregate.body.disablePreStep = false;

        // Lock all rotational axes to prevent tipping
        this.physicsAggregate.body.setMassProperties({
            inertia: new Vector3(0, 0, 0)
        });

        // Create a rotation wrapper node that's not affected by physics
        // This allows us to rotate the character model independently
        this.rotationNode = MeshBuilder.CreateBox('rotationNode', { size: 0.01 }, scene);
        this.rotationNode.isVisible = false;
        this.rotationNode.parent = this.colliderMesh;

        // Setup camera to follow collider
        this.setupCamera();

        // Setup input controls
        this.setupInputControls();

        // Update loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.update();
        });
    }

    public static async create(scene: Scene, camera: ArcRotateCamera, shadowGenerator: ShadowGenerator): Promise<ThirdPersonPlayer> {
        const player = new ThirdPersonPlayer(scene, camera);
        await player.loadModel(shadowGenerator);
        await player.loadAnimations();
        return player;
    }

    private async loadModel(shadowGenerator: ShadowGenerator): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync(
                '',
                '/assets/hero/',
                'Superhero_Female.gltf',
                this.scene
            );

            if (result.meshes.length > 0) {
                this.playerMesh = result.meshes[0];
                this.playerMesh.scaling = new Vector3(1, 1, 1);

                // Parent to rotation node (which is parented to collider)
                this.playerMesh.parent = this.rotationNode;
                this.playerMesh.position = new Vector3(0, -0.9, 0);
                this.playerMesh.rotation.y = Math.PI; // Face forward

                result.meshes.forEach(mesh => {
                    if (mesh) {
                        if (mesh.physicsBody) {
                            mesh.physicsBody.dispose();
                        }
                        mesh.checkCollisions = false;
                        shadowGenerator.addShadowCaster(mesh);
                    }
                });

                if (result.skeletons.length > 0) {
                    this.characterSkeleton = result.skeletons[0];
                    console.log('Character skeleton found:', this.characterSkeleton.name);
                    console.log('Number of bones:', this.characterSkeleton.bones.length);
                }

                console.log('Superhero_Female model loaded successfully');
            }
        } catch (error) {
            console.error('Error loading Superhero_Female model:', error);
            const fallbackMesh = MeshBuilder.CreateCapsule(
                'playerFallback',
                { height: 1.8, radius: 0.3 },
                this.scene
            );
            const material = new StandardMaterial('fallbackMaterial', this.scene);
            material.diffuseColor = new Color3(0.2, 0.5, 0.8);
            fallbackMesh.material = material;
            fallbackMesh.parent = this.colliderMesh;
            this.playerMesh = fallbackMesh;
        }
    }

    private async loadAnimations(): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync(
                '',
                '/assets/animation/',
                'hero_Animation.glb',
                this.scene
            );

            // Build a map of character's TransformNodes by name
            const characterNodeMap = new Map<string, any>();

            if (this.playerMesh) {
                const allNodes = this.playerMesh.getChildTransformNodes(false);
                allNodes.forEach(node => {
                    characterNodeMap.set(node.name, node);
                });
                characterNodeMap.set(this.playerMesh.name, this.playerMesh);
            }

            console.log('Character has', characterNodeMap.size, 'TransformNodes');

            // Helper function to find matching character node
            const targetConverter = (target: any) => {
                if (!target || !target.name) return null;

                const animNodeName = target.name;
                const mappedName = ThirdPersonPlayer.BONE_MAPPING[animNodeName];

                if (mappedName && characterNodeMap.has(mappedName)) {
                    return characterNodeMap.get(mappedName);
                }

                if (characterNodeMap.has(animNodeName)) {
                    return characterNodeMap.get(animNodeName);
                }

                return null;
            };

            // Load all animations from the library
            if (result.animationGroups.length > 0) {
                console.log('Available animations:', result.animationGroups.map(g => g.name));

                result.animationGroups.forEach(animGroup => {
                    const name = animGroup.name;
                    const animKey = ThirdPersonPlayer.ANIMATION_MAPPING[name];

                    // Stop the original animation
                    animGroup.stop();

                    if (animKey) {
                        // Clone the animation group with targetConverter
                        const clonedAnim = animGroup.clone(animKey + '_retargeted', targetConverter);

                        if (clonedAnim) {
                            const originalCount = animGroup.targetedAnimations.length;
                            const clonedCount = clonedAnim.targetedAnimations.length;
                            console.log(`✓ ${animKey}: Retargeted ${clonedCount}/${originalCount} animations`);

                            this.animations.set(animKey, clonedAnim);
                            clonedAnim.stop();
                        }
                    }
                });

                console.log('Animation retargeting complete!');
                console.log('Mapped animations:', Array.from(this.animations.keys()));

                // Start with idle animation
                this.playAnimation('idle');
            }

            // Hide animation meshes
            result.meshes.forEach(mesh => {
                mesh.isVisible = false;
                if (mesh.physicsBody) {
                    mesh.physicsBody.dispose();
                }
                mesh.checkCollisions = false;
            });

        } catch (error) {
            console.warn('Could not load animations:', error);
        }
    }

    private playAnimation(animationName: string, loop: boolean = true, blendingSpeed: number = 0.1): void {
        const animation = this.animations.get(animationName);

        if (!animation) {
            console.warn(`Animation '${animationName}' not found`);
            return;
        }

        if (this.currentAnimationName === animationName && this.currentAnimation?.isPlaying) {
            return; // Already playing this animation
        }

        // Stop current animation with blending
        if (this.currentAnimation && this.currentAnimation !== animation) {
            this.currentAnimation.stop();
        }

        // Enable blending for smooth transitions
        animation.enableBlending = true;
        animation.blendingSpeed = blendingSpeed;

        // Play new animation
        animation.start(loop, 1.0, animation.from, animation.to, false);
        this.currentAnimation = animation;
        this.currentAnimationName = animationName;
    }

    private setupCamera() {
        this.camera.lockedTarget = this.colliderMesh;
        this.camera.radius = 5;
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 15;
    }

    private setupInputControls() {
        this.scene.onKeyboardObservable.add((kbInfo) => {
            switch (kbInfo.type) {
                case 1: // KEYDOWN
                    this.inputMap[kbInfo.event.key.toLowerCase()] = true;
                    break;
                case 2: // KEYUP
                    this.inputMap[kbInfo.event.key.toLowerCase()] = false;
                    break;
            }
        });
    }

    /**
     * Check if character is grounded using velocity-based detection
     * This approach checks if vertical velocity is near zero and position is stable
     */
    private checkGrounded(): boolean {
        if (!this.physicsAggregate?.body) return false;

        // If we're actively jumping UPWARD, force not-grounded
        // (Once descending, allow ground detection for landing)
        if (this.isJumping) {
            const velocity = this.physicsAggregate.body.getLinearVelocity();
            // Stay not-grounded for at least 300ms after jump initiation
            const minJumpTime = 300;
            const jumpElapsed = Date.now() - this.jumpInitiatedTime;
            if (jumpElapsed < minJumpTime || velocity.y > 0) {
                return false; // Still in jump phase
            }
            // Going down and enough time has passed - allow landing detection below
        }

        const velocity = this.physicsAggregate.body.getLinearVelocity();
        const verticalVelocity = Math.abs(velocity.y);

        // Track when we were last in the air
        if (verticalVelocity > this.groundedVelocityThreshold) {
            this.lastAirborneTime = Date.now();
        }

        // Must have low vertical velocity
        const hasLowVerticalVelocity = verticalVelocity < this.groundedVelocityThreshold;

        // Must have been airborne for at least 200ms before we can land
        // (prevents detecting as grounded at peak of jump)
        const minAirTime = 200;
        const wasAirborneRecently = (Date.now() - this.lastAirborneTime) < minAirTime;

        // Only grounded if low velocity AND either:
        // - we haven't been airborne recently, OR
        // - we've been grounded long enough
        const isGrounded = hasLowVerticalVelocity && !wasAirborneRecently && this.colliderMesh.position.y > -5;

        // Track grounded time for stable detection
        if (isGrounded) {
            this.lastGroundedTime = Date.now();
        }

        return isGrounded;
    }

    /**
     * Get animation name for current state
     */
    private getAnimationForState(state: CharacterState): { name: string; loop: boolean } {
        switch (state) {
            case CharacterState.IDLE:
                return { name: 'idle', loop: true };
            case CharacterState.WALK:
                return { name: 'walk', loop: true };
            case CharacterState.SPRINT:
                return { name: 'sprint', loop: true };
            case CharacterState.JUMP_START:
                return { name: 'jumpStart', loop: false };
            case CharacterState.JUMPING:
            case CharacterState.FALLING:
                return { name: 'jumping', loop: true };
            case CharacterState.LANDING:
                return { name: 'landing', loop: false };
            case CharacterState.CROUCH_IDLE:
                return { name: 'crouchIdle', loop: true };
            case CharacterState.CROUCH_WALK:
                return { name: 'crouchWalk', loop: true };
            default:
                return { name: 'idle', loop: true };
        }
    }

    /**
     * Set character state and play corresponding animation
     */
    private setState(newState: CharacterState): void {
        if (this.state === newState) return;

        this.previousState = this.state;
        this.state = newState;

        const animInfo = this.getAnimationForState(newState);

        // Use faster blending for action transitions
        const blendSpeed = (newState === CharacterState.LANDING ||
            newState === CharacterState.JUMP_START) ? 0.2 : 0.1;

        this.playAnimation(animInfo.name, animInfo.loop, blendSpeed);
    }

    /**
     * Update character state based on physics and input
     */
    private updateState(): void {
        const velocity = this.physicsAggregate.body.getLinearVelocity();
        const verticalVelocity = velocity.y;

        // Store previous grounded state
        this.wasGrounded = this.isGrounded;
        this.isGrounded = this.checkGrounded();

        // Get movement input
        const isMoving = this.currentSpeed > 0.5;

        // Check crouch input
        this.isCrouching = this.inputMap['c'] || this.inputMap['control'] || false;

        // State machine logic
        if (!this.isGrounded) {
            // In the air
            if (this.state === CharacterState.JUMP_START) {
                // Stay in jump start briefly, then transition
                if (verticalVelocity < 0) {
                    this.setState(CharacterState.FALLING);
                } else {
                    this.setState(CharacterState.JUMPING);
                }
            } else if (verticalVelocity > 0.5) {
                this.setState(CharacterState.JUMPING);
            } else {
                this.setState(CharacterState.FALLING);
            }
        } else {
            // On the ground
            // Reset jump flags when grounded
            if (this.isJumping || this.jumpCooldown) {
                // Small delay before allowing another jump
                if (!this.wasGrounded) {
                    // Just landed - set landing state and schedule reset
                    this.setState(CharacterState.LANDING);
                    this.isJumping = false;

                    setTimeout(() => {
                        this.jumpCooldown = false;
                    }, 200);
                } else {
                    // Already on ground, reset immediately if cooldown expired
                    this.isJumping = false;
                }
            }

            // Normal ground movement (skip if in landing animation)
            if (this.state !== CharacterState.LANDING) {
                if (this.isCrouching) {
                    if (isMoving) {
                        this.setState(CharacterState.CROUCH_WALK);
                    } else {
                        this.setState(CharacterState.CROUCH_IDLE);
                    }
                } else if (isMoving) {
                    if (this.isSprinting) {
                        this.setState(CharacterState.SPRINT);
                    } else {
                        this.setState(CharacterState.WALK);
                    }
                } else {
                    this.setState(CharacterState.IDLE);
                }
            }
        }
    }

    private update() {
        if (!this.physicsAggregate || !this.physicsAggregate.body) return;

        const body = this.physicsAggregate.body;
        const velocity = body.getLinearVelocity();

        // Get camera forward and right directions
        const cameraForward = this.camera.getForwardRay().direction.clone();
        cameraForward.y = 0;
        cameraForward.normalize();

        const cameraRight = Vector3.Cross(cameraForward, Vector3.Up()).normalize();

        // Calculate movement direction based on input
        let moveDirection = Vector3.Zero();

        if (this.inputMap['w'] || this.inputMap['arrowup']) {
            moveDirection.addInPlace(cameraForward);
        }
        if (this.inputMap['s'] || this.inputMap['arrowdown']) {
            moveDirection.subtractInPlace(cameraForward);
        }
        if (this.inputMap['a'] || this.inputMap['arrowleft']) {
            moveDirection.subtractInPlace(cameraRight);
        }
        if (this.inputMap['d'] || this.inputMap['arrowright']) {
            moveDirection.addInPlace(cameraRight);
        }

        // Normalize movement direction
        const isMoving = moveDirection.length() > 0;
        if (isMoving) {
            moveDirection.normalize();

            // Rotate the ROTATION NODE to face movement direction
            // (playerMesh is parented to rotationNode, which is parented to collider)
            // Negate X to fix left/right direction
            const targetAngle = Math.atan2(-moveDirection.x, moveDirection.z);

            // Smooth rotation interpolation
            let currentAngle = this.rotationNode.rotation.y;

            // Normalize angles to prevent jumping
            while (targetAngle - currentAngle > Math.PI) currentAngle += 2 * Math.PI;
            while (targetAngle - currentAngle < -Math.PI) currentAngle -= 2 * Math.PI;

            // Lerp towards target angle
            this.rotationNode.rotation.y = currentAngle + (targetAngle - currentAngle) * 0.15;
        }

        // Debug: Log jump state periodically
        if (this.inputMap[' ']) {
            console.log('Space pressed - isGrounded:', this.isGrounded, 'isJumping:', this.isJumping, 'jumpCooldown:', this.jumpCooldown, 'isCrouching:', this.isCrouching);
        }

        // Check sprint input
        this.isSprinting = (this.inputMap['shift'] || false) && !this.isCrouching;

        // Determine movement speed based on state
        let currentMoveSpeed = this.walkSpeed;
        if (this.isCrouching) {
            currentMoveSpeed = this.crouchSpeed;
        } else if (this.isSprinting) {
            currentMoveSpeed = this.sprintSpeed;
        }

        // Apply movement
        const newVelocity = new Vector3(
            moveDirection.x * currentMoveSpeed,
            velocity.y,
            moveDirection.z * currentMoveSpeed
        );

        body.setLinearVelocity(newVelocity);

        // Calculate current horizontal speed
        const horizontalVelocity = new Vector3(velocity.x, 0, velocity.z);
        this.currentSpeed = horizontalVelocity.length();

        // Update state machine FIRST to set isGrounded correctly
        this.updateState();

        // Handle jump input (after state update so isGrounded is correct)
        if ((this.inputMap[' '] || this.inputMap['space']) &&
            this.isGrounded &&
            !this.isJumping &&
            !this.jumpCooldown &&
            !this.isCrouching) {

            this.isJumping = true;
            this.jumpCooldown = true;
            this.jumpInitiatedTime = Date.now(); // Track jump start time
            this.setState(CharacterState.JUMP_START);

            // Apply jump impulse after short delay for animation sync
            setTimeout(() => {
                if (this.physicsAggregate?.body) {
                    const vel = this.physicsAggregate.body.getLinearVelocity();
                    vel.y = this.jumpForce;
                    this.physicsAggregate.body.setLinearVelocity(vel);
                }
            }, 50);
        }

        // Prevent falling through world
        if (this.colliderMesh.position.y < -10) {
            this.colliderMesh.position = new Vector3(0, 20, 0);
            body.setLinearVelocity(Vector3.Zero());
            this.setState(CharacterState.IDLE);
        }
    }

    public getPosition(): Vector3 {
        return this.colliderMesh.position;
    }

    public getMesh() {
        return this.colliderMesh;
    }

    public getModelMesh() {
        return this.playerMesh;
    }

    public getState(): CharacterState {
        return this.state;
    }

    public isCharacterGrounded(): boolean {
        return this.isGrounded;
    }
}
