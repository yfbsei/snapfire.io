import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsCharacterController, CharacterSupportedState } from '@babylonjs/core/Physics/v2/characterController';

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
    private displayCapsule: AbstractMesh;
    private rotationNode: TransformNode;
    private characterController: PhysicsCharacterController;
    private inputMap: { [key: string]: boolean } = {};
    private characterSkeleton: any = null;

    // Animation properties
    private animations: Map<string, AnimationGroup> = new Map();
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: string = '';

    // State machine
    private state: CharacterState = CharacterState.IDLE;
    private _previousState: CharacterState = CharacterState.IDLE;

    // Movement settings
    private walkSpeed = 3;
    private sprintSpeed = 6;
    private crouchSpeed = 1.5;
    private jumpForce = 8;
    private gravity = new Vector3(0, -20, 0);
    private isGrounded = false;
    private currentSpeed = 0;
    private isSprinting = false;
    private isCrouching = false;

    // Jump state tracking
    private jumpRequested = false;
    private inJumpState = false;
    private groundedFrameCount = 0;  // Counter to stabilize ground detection

    // Capsule dimensions
    private capsuleHeight = 1.8;
    private capsuleRadius = 0.3;

    // Model alignment offset - adjusts the model's Y position to align feet with ground
    // Negative values move the model down (use if character appears to float)
    // Positive values move the model up (use if feet clip through ground)
    private modelGroundOffset = -0.15;  // Compensate for physics gap

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

        // Create display capsule (visible mesh that follows the controller)
        this.displayCapsule = MeshBuilder.CreateCapsule(
            'playerDisplay',
            {
                height: this.capsuleHeight,
                radius: this.capsuleRadius,
                subdivisions: 16
            },
            scene
        );
        this.displayCapsule.isVisible = false; // Hide the capsule, we'll show the character model

        // Initial position
        const startPosition = new Vector3(0, 20, 0);

        // Create PhysicsCharacterController with capsule shape
        this.characterController = new PhysicsCharacterController(
            startPosition,
            {
                capsuleHeight: this.capsuleHeight,
                capsuleRadius: this.capsuleRadius
            },
            scene
        );

        // Create a rotation node for the character model
        // This allows us to rotate the character independently of physics
        this.rotationNode = new TransformNode('rotationNode', scene);

        // Initialize display mesh and rotation node at controller position
        this.displayCapsule.position.copyFrom(startPosition);
        this.rotationNode.position.copyFrom(startPosition);

        // Setup camera to follow display capsule
        this.setupCamera();

        // Setup input controls
        this.setupInputControls();

        // Update loop - using onBeforePhysicsObservable for physics-based updates
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

                // Parent to rotation node
                this.playerMesh.parent = this.rotationNode;

                // Position model so feet align with capsule bottom
                // The capsule center is at the controller position
                // Capsule bottom is at: position.y - capsuleHeight/2
                // The model's pivot/origin is typically at the root bone (hip level)
                // We need to offset by capsuleHeight/2 to bring the model down to capsule bottom
                // modelGroundOffset further adjusts for physics gap and model-specific alignment
                this.playerMesh.position = new Vector3(0, -this.capsuleHeight / 2 + this.modelGroundOffset, 0);
                this.playerMesh.rotation.y = 0; // Face forward

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
                { height: this.capsuleHeight, radius: this.capsuleRadius },
                this.scene
            );
            const material = new StandardMaterial('fallbackMaterial', this.scene);
            material.diffuseColor = new Color3(0.2, 0.5, 0.8);
            fallbackMesh.material = material;
            fallbackMesh.parent = this.rotationNode;
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
        // PUBG-style: Camera follows and rotates around character
        this.camera.lockedTarget = this.displayCapsule;
        this.camera.radius = 5;
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 15;

        // Enable mouse rotation for PUBG-style camera
        this.camera.attachControl(this.scene.getEngine().getRenderingCanvas()!, true);
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

        this._previousState = this.state;
        this.state = newState;

        const animInfo = this.getAnimationForState(newState);

        // Use faster blending for action transitions
        const blendSpeed = (newState === CharacterState.LANDING ||
            newState === CharacterState.JUMP_START) ? 0.2 : 0.1;

        this.playAnimation(animInfo.name, animInfo.loop, blendSpeed);
    }

    /**
     * Calculate desired velocity based on input, state, and support
     */
    private getDesiredVelocity(
        deltaTime: number,
        supportState: CharacterSupportedState,
        currentVelocity: Vector3
    ): Vector3 {
        // PUBG-style: W moves in direction camera is LOOKING

        // Get where camera is looking (its forward direction)
        // For ArcRotateCamera, getDirection(Forward) points TOWARD the target (character)
        // We need to negate it to get the direction AWAY from camera
        const cameraForward = this.camera.getDirection(Vector3.Forward());
        const forward = new Vector3(-cameraForward.x, 0, -cameraForward.z);
        forward.normalize();

        // Right is perpendicular to forward (90° clockwise when viewed from above)
        const right = new Vector3(forward.z, 0, -forward.x);

        // Calculate movement direction based on input
        let moveDirection = Vector3.Zero();

        if (this.inputMap['w'] || this.inputMap['arrowup']) {
            // W: Move away from camera (forward)
            moveDirection.addInPlace(forward);
        }
        if (this.inputMap['s'] || this.inputMap['arrowdown']) {
            // S: Move toward camera (backward)
            moveDirection.subtractInPlace(forward);
        }
        if (this.inputMap['a'] || this.inputMap['arrowleft']) {
            // A: Move left
            moveDirection.subtractInPlace(right);
        }
        if (this.inputMap['d'] || this.inputMap['arrowright']) {
            // D: Move right
            moveDirection.addInPlace(right);
        }

        // Normalize movement direction
        const isMoving = moveDirection.length() > 0;
        if (isMoving) {
            moveDirection.normalize();

            // Rotate the rotation node to face movement direction
            // Standard pattern: atan2(x, z) - no negative sign
            const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);

            // Smooth rotation interpolation
            let currentAngle = this.rotationNode.rotation.y;

            // Normalize angles to prevent jumping
            while (targetAngle - currentAngle > Math.PI) currentAngle += 2 * Math.PI;
            while (targetAngle - currentAngle < -Math.PI) currentAngle -= 2 * Math.PI;

            // Lerp towards target angle
            this.rotationNode.rotation.y = currentAngle + (targetAngle - currentAngle) * 0.15;
        }

        // Check sprint/crouch input - only allow crouch when grounded
        // This prevents the mid-air crouch appearance
        const wantsToCrouch = this.inputMap['c'] || this.inputMap['control'] || false;
        this.isCrouching = wantsToCrouch && this.isGrounded;
        this.isSprinting = (this.inputMap['shift'] || false) && !this.isCrouching;

        // Determine movement speed based on state
        let currentMoveSpeed = this.walkSpeed;
        if (this.isCrouching) {
            currentMoveSpeed = this.crouchSpeed;
        } else if (this.isSprinting) {
            currentMoveSpeed = this.sprintSpeed;
        }

        // Calculate horizontal velocity
        const horizontalVelocity = new Vector3(
            moveDirection.x * currentMoveSpeed,
            0,
            moveDirection.z * currentMoveSpeed
        );

        // Store current speed for state machine
        this.currentSpeed = horizontalVelocity.length();

        // Calculate vertical velocity based on support state
        let verticalVelocity = currentVelocity.y;

        // Use frame counting to stabilize ground detection
        // This prevents flickering between grounded/falling states when slightly above ground
        if (supportState === CharacterSupportedState.SUPPORTED) {
            this.groundedFrameCount++;
        } else {
            this.groundedFrameCount = 0;
        }

        // Consider grounded after a few consecutive frames of support
        // OR if we're not in a jump and have any support
        const isNowGrounded = supportState === CharacterSupportedState.SUPPORTED ||
            (this.groundedFrameCount > 0 && !this.inJumpState);

        if (isNowGrounded) {
            // On ground
            this.isGrounded = true;

            // Handle jump request
            if (this.jumpRequested && !this.isCrouching) {
                verticalVelocity = this.jumpForce;
                this.inJumpState = true;
                this.jumpRequested = false;
                this.groundedFrameCount = 0;  // Reset ground counter on jump
                this.setState(CharacterState.JUMP_START);
            } else {
                // Reset jump state when grounded
                if (this.inJumpState) {
                    this.inJumpState = false;
                    this.setState(CharacterState.LANDING);
                    // After a short delay, return to normal ground state
                    setTimeout(() => {
                        if (this.isGrounded && this.state === CharacterState.LANDING) {
                            this.updateGroundState();
                        }
                    }, 200);
                } else if (this.state !== CharacterState.LANDING) {
                    this.updateGroundState();
                }

                // Small downward velocity to keep grounded
                verticalVelocity = -0.5;  // Slightly stronger to maintain ground contact
            }
        } else {
            // In the air
            this.isGrounded = false;

            // Apply gravity
            verticalVelocity += this.gravity.y * deltaTime;

            // Cap fall speed
            verticalVelocity = Math.max(verticalVelocity, -30);

            // Only switch to air states if we've been in the air for a bit
            // This prevents brief state flickers
            if (this.groundedFrameCount === 0) {
                if (verticalVelocity > 0.5) {
                    this.setState(CharacterState.JUMPING);
                } else if (verticalVelocity < -1.0) {
                    // Only show falling animation when actually falling significantly
                    this.setState(CharacterState.FALLING);
                }
            }
        }

        return new Vector3(horizontalVelocity.x, verticalVelocity, horizontalVelocity.z);
    }

    /**
     * Update ground state based on movement
     */
    private updateGroundState(): void {
        const isMoving = this.currentSpeed > 0.5;

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

    private update() {
        // Get delta time
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

        // Handle jump input
        if ((this.inputMap[' '] || this.inputMap['space']) && this.isGrounded && !this.isCrouching) {
            this.jumpRequested = true;
        }

        // Debug logging
        if (this.inputMap[' ']) {
            console.log('Space pressed - isGrounded:', this.isGrounded, 'inJumpState:', this.inJumpState, 'isCrouching:', this.isCrouching);
        }

        // The 3-step character controller loop:
        // 1. Check support (what surface is character on)
        const down = new Vector3(0, -1, 0);
        const supportInfo = this.characterController.checkSupport(deltaTime, down);

        // 2. Get desired velocity based on input, state, and support
        const currentVelocity = this.characterController.getVelocity();
        const desiredVelocity = this.getDesiredVelocity(deltaTime, supportInfo.supportedState, currentVelocity);

        // 3. Set velocity and integrate
        this.characterController.setVelocity(desiredVelocity);
        this.characterController.integrate(deltaTime, supportInfo, this.gravity);

        // Update display mesh position from controller
        const newPosition = this.characterController.getPosition();
        this.displayCapsule.position.copyFrom(newPosition);
        this.rotationNode.position.copyFrom(newPosition);

        // Update camera target
        this.camera.lockedTarget = this.displayCapsule;

        // Prevent falling through world
        if (newPosition.y < -10) {
            this.characterController.setPosition(new Vector3(0, 20, 0));
            this.characterController.setVelocity(Vector3.Zero());
            this.setState(CharacterState.IDLE);
        }
    }

    public getPosition(): Vector3 {
        return this.characterController.getPosition();
    }

    public getMesh() {
        return this.displayCapsule;
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
