import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Vector2, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PhysicsCharacterController, CharacterSupportedState } from '@babylonjs/core/Physics/v2/characterController';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';

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
    private isLocked = false;
    private uiTexture!: AdvancedDynamicTexture;

    // Over-the-shoulder camera settings - using targetScreenOffset
    private crosshairContainer: Rectangle | null = null;

    // Camera control
    private isAiming = true;  // Always in aiming mode for PUBG-style

    // Jump state tracking
    private jumpRequested = false;
    private inJumpState = false;
    private groundedFrameCount = 0;

    // Capsule dimensions
    private capsuleHeight = 1.8;
    private capsuleRadius = 0.3;

    // Model alignment offset
    private modelGroundOffset = -0.15;

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

    // Animation name mapping
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

    private constructor(scene: Scene, camera: ArcRotateCamera, spawnPosition: Vector3) {
        this.scene = scene;
        this.camera = camera;

        // Create display capsule
        this.displayCapsule = MeshBuilder.CreateCapsule(
            'playerDisplay',
            {
                height: this.capsuleHeight,
                radius: this.capsuleRadius,
                subdivisions: 16
            },
            scene
        );
        this.displayCapsule.isVisible = false;

        // Use provided spawn position
        const startPosition = spawnPosition;

        // Create PhysicsCharacterController
        this.characterController = new PhysicsCharacterController(
            startPosition,
            {
                capsuleHeight: this.capsuleHeight,
                capsuleRadius: this.capsuleRadius
            },
            scene
        );

        // Create rotation node
        this.rotationNode = new TransformNode('rotationNode', scene);
        this.displayCapsule.position.copyFrom(startPosition);
        this.rotationNode.position.copyFrom(startPosition);

        // Setup camera, input, UI
        this.setupCamera();
        this.setupInputControls();
        this.setupUI();
        this.setupPointerLock();

        // Update loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.update();
        });
    }

    public static async create(scene: Scene, camera: ArcRotateCamera, shadowGenerator: ShadowGenerator, spawnPosition: Vector3): Promise<ThirdPersonPlayer> {
        const player = new ThirdPersonPlayer(scene, camera, spawnPosition);
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
                this.playerMesh.parent = this.rotationNode;
                this.playerMesh.position = new Vector3(0, -this.capsuleHeight / 2 + this.modelGroundOffset, 0);
                this.playerMesh.rotation.y = 0;

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

            const characterNodeMap = new Map<string, any>();

            if (this.playerMesh) {
                const allNodes = this.playerMesh.getChildTransformNodes(false);
                allNodes.forEach(node => {
                    characterNodeMap.set(node.name, node);
                });
                characterNodeMap.set(this.playerMesh.name, this.playerMesh);
            }

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

            if (result.animationGroups.length > 0) {
                result.animationGroups.forEach(animGroup => {
                    const name = animGroup.name;
                    const animKey = ThirdPersonPlayer.ANIMATION_MAPPING[name];

                    animGroup.stop();

                    if (animKey) {
                        const clonedAnim = animGroup.clone(animKey + '_retargeted', targetConverter);

                        if (clonedAnim) {
                            this.animations.set(animKey, clonedAnim);
                            clonedAnim.stop();
                        }
                    }
                });

                console.log('Animation retargeting complete!');
                this.playAnimation('idle');
            }

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
            return;
        }

        if (this.currentAnimation && this.currentAnimation !== animation) {
            this.currentAnimation.stop();
        }

        animation.enableBlending = true;
        animation.blendingSpeed = blendingSpeed;
        animation.start(loop, 1.0, animation.from, animation.to, false);
        this.currentAnimation = animation;
        this.currentAnimationName = animationName;
    }

    private setupCamera() {
        // Third-person camera with over-the-shoulder offset
        this.camera.lockedTarget = this.displayCapsule;

        // Set initial camera position
        this.camera.alpha = Math.PI; // Behind character
        this.camera.beta = 1.3;      // Looking slightly down
        this.camera.radius = 3;      // Closer distance - character behind crosshair

        // Camera limits
        this.camera.lowerRadiusLimit = 3;
        this.camera.upperRadiusLimit = 10;
        this.camera.lowerBetaLimit = 0.5;
        this.camera.upperBetaLimit = 1.8;

        // Over-the-shoulder offset - character appears RIGHT of center, crosshair on left side
        this.camera.targetScreenOffset = new Vector2(-0.5, -0.1);

        // Camera sensitivity
        this.camera.angularSensibilityX = 3000;
        this.camera.angularSensibilityY = 3000;
        this.camera.wheelPrecision = 50;

        this.camera.attachControl(this.scene.getEngine().getRenderingCanvas()!, true);
    }

    private setupInputControls() {
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();
            switch (kbInfo.type) {
                case 1: // KEYDOWN
                    this.inputMap[key] = true;
                    break;
                case 2: // KEYUP
                    this.inputMap[key] = false;
                    break;
            }
        });
    }

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

    private setState(newState: CharacterState): void {
        if (this.state === newState) return;

        this._previousState = this.state;
        this.state = newState;

        const animInfo = this.getAnimationForState(newState);
        const blendSpeed = (newState === CharacterState.LANDING ||
            newState === CharacterState.JUMP_START) ? 0.2 : 0.1;

        this.playAnimation(animInfo.name, animInfo.loop, blendSpeed);
    }

    private smoothRotateTo(targetAngle: number) {
        let currentAngle = this.rotationNode.rotation.y;
        while (targetAngle - currentAngle > Math.PI) currentAngle += 2 * Math.PI;
        while (targetAngle - currentAngle < -Math.PI) currentAngle -= 2 * Math.PI;
        this.rotationNode.rotation.y = Scalar.Lerp(currentAngle, targetAngle, 0.15);
    }

    private getDesiredVelocity(
        deltaTime: number,
        supportState: CharacterSupportedState,
        currentVelocity: Vector3
    ): Vector3 {
        // Get camera forward direction (projected on XZ plane)
        const cameraForward = this.camera.getDirection(Vector3.Forward());
        const forward = new Vector3(cameraForward.x, 0, cameraForward.z).normalize();
        const right = new Vector3(forward.z, 0, -forward.x);

        // Calculate movement direction
        let moveDirection = Vector3.Zero();

        if (this.inputMap['w'] || this.inputMap['arrowup']) {
            moveDirection.addInPlace(forward);
        }
        if (this.inputMap['s'] || this.inputMap['arrowdown']) {
            moveDirection.subtractInPlace(forward);
        }
        if (this.inputMap['a'] || this.inputMap['arrowleft']) {
            moveDirection.subtractInPlace(right);
        }
        if (this.inputMap['d'] || this.inputMap['arrowright']) {
            moveDirection.addInPlace(right);
        }

        const isMoving = moveDirection.length() > 0;
        if (isMoving) {
            moveDirection.normalize();
        }

        // Character always faces camera direction in aiming mode
        if (this.isAiming) {
            const cameraForward = this.camera.getDirection(Vector3.Forward());
            const targetAngle = Math.atan2(-cameraForward.x, -cameraForward.z);
            this.smoothRotateTo(targetAngle);
        }

        // Check sprint/crouch
        const wantsToCrouch = this.inputMap['c'] || this.inputMap['control'] || false;
        this.isCrouching = wantsToCrouch && this.isGrounded;
        this.isSprinting = (this.inputMap['shift'] || false) && !this.isCrouching;

        let currentMoveSpeed = this.walkSpeed;
        if (this.isCrouching) {
            currentMoveSpeed = this.crouchSpeed;
        } else if (this.isSprinting) {
            currentMoveSpeed = this.sprintSpeed;
        }

        const horizontalVelocity = new Vector3(
            moveDirection.x * currentMoveSpeed,
            0,
            moveDirection.z * currentMoveSpeed
        );

        this.currentSpeed = horizontalVelocity.length();

        // Vertical velocity
        let verticalVelocity = currentVelocity.y;

        if (supportState === CharacterSupportedState.SUPPORTED) {
            this.groundedFrameCount++;
        } else {
            this.groundedFrameCount = 0;
        }

        const isNowGrounded = supportState === CharacterSupportedState.SUPPORTED ||
            (this.groundedFrameCount > 0 && !this.inJumpState);

        if (isNowGrounded) {
            this.isGrounded = true;

            if (this.jumpRequested && !this.isCrouching) {
                verticalVelocity = this.jumpForce;
                this.inJumpState = true;
                this.jumpRequested = false;
                this.groundedFrameCount = 0;
                this.setState(CharacterState.JUMP_START);
            } else {
                if (this.inJumpState) {
                    this.inJumpState = false;
                    this.setState(CharacterState.LANDING);
                    setTimeout(() => {
                        if (this.isGrounded && this.state === CharacterState.LANDING) {
                            this.updateGroundState();
                        }
                    }, 200);
                } else if (this.state === CharacterState.LANDING) {
                    // If we're in LANDING state and grounded, immediately update to ground state
                    // This fixes the issue when landing on slopes where brief air-time can interrupt
                    this.updateGroundState();
                } else {
                    // Normal grounded state - not in jump and not in landing
                    this.updateGroundState();
                }

                verticalVelocity = -0.5;
            }
        } else {
            this.isGrounded = false;
            verticalVelocity += this.gravity.y * deltaTime;
            verticalVelocity = Math.max(verticalVelocity, -30);

            // Only play falling animation if we actually jumped (not when walking down slopes)
            // Also don't trigger falling if we're in LANDING state (just landed and sliding on slope)
            if (this.groundedFrameCount === 0 && this.inJumpState) {
                if (verticalVelocity > 0.5) {
                    this.setState(CharacterState.JUMPING);
                } else if (verticalVelocity < -1.0) {
                    this.setState(CharacterState.FALLING);
                }
            }

            // If we're in LANDING state but now in air on a slope, 
            // transition to ground state on next grounded frame
            // For now, just keep LANDING state - the timeout will handle it
            // But if vertical velocity is very negative, force ground state check
            if (this.state === CharacterState.LANDING && verticalVelocity < -5) {
                // We're sliding down a steep slope after landing, reset to allow movement
                this.updateGroundState();
            }
        }

        return new Vector3(horizontalVelocity.x, verticalVelocity, horizontalVelocity.z);
    }

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
        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

        // Handle jump input
        if ((this.inputMap[' '] || this.inputMap['space']) && this.isGrounded && !this.isCrouching) {
            this.jumpRequested = true;
        }

        // Character controller physics
        const down = new Vector3(0, -1, 0);
        const supportInfo = this.characterController.checkSupport(deltaTime, down);
        const currentVelocity = this.characterController.getVelocity();
        const desiredVelocity = this.getDesiredVelocity(deltaTime, supportInfo.supportedState, currentVelocity);

        this.characterController.setVelocity(desiredVelocity);
        this.characterController.integrate(deltaTime, supportInfo, this.gravity);

        // Update display mesh and rotation node
        const newPosition = this.characterController.getPosition();
        this.displayCapsule.position.copyFrom(newPosition);
        this.rotationNode.position.copyFrom(newPosition);

        // Prevent falling through world - respawn if falling too far
        if (newPosition.y < -10) {
            this.characterController.setPosition(new Vector3(0, 200, 0));
            this.characterController.setVelocity(Vector3.Zero());
            this.setState(CharacterState.IDLE);
        }
    }

    public getPosition(): Vector3 {
        return this.characterController.getPosition();
    }

    public getModelMesh() {
        return this.playerMesh;
    }

    private setupUI() {
        this.uiTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);

        // Fixed crosshair at screen center - PUBG style
        this.crosshairContainer = new Rectangle("crosshairContainer");
        this.crosshairContainer.width = "50px";
        this.crosshairContainer.height = "50px";
        this.crosshairContainer.thickness = 0;
        this.crosshairContainer.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_CENTER;
        this.crosshairContainer.verticalAlignment = Rectangle.VERTICAL_ALIGNMENT_CENTER;
        this.uiTexture.addControl(this.crosshairContainer);

        // PUBG-style "+" crosshair
        const lineWidth = 2;
        const lineLength = 10;
        const gap = 4;
        const color = "white";

        const topLine = new Rectangle("crosshairTop");
        topLine.width = `${lineWidth}px`;
        topLine.height = `${lineLength}px`;
        topLine.top = `${-(gap + lineLength / 2)}px`;
        topLine.background = color;
        topLine.thickness = 0;
        this.crosshairContainer.addControl(topLine);

        const bottomLine = new Rectangle("crosshairBottom");
        bottomLine.width = `${lineWidth}px`;
        bottomLine.height = `${lineLength}px`;
        bottomLine.top = `${gap + lineLength / 2}px`;
        bottomLine.background = color;
        bottomLine.thickness = 0;
        this.crosshairContainer.addControl(bottomLine);

        const leftLine = new Rectangle("crosshairLeft");
        leftLine.width = `${lineLength}px`;
        leftLine.height = `${lineWidth}px`;
        leftLine.left = `${-(gap + lineLength / 2)}px`;
        leftLine.background = color;
        leftLine.thickness = 0;
        this.crosshairContainer.addControl(leftLine);

        const rightLine = new Rectangle("crosshairRight");
        rightLine.width = `${lineLength}px`;
        rightLine.height = `${lineWidth}px`;
        rightLine.left = `${gap + lineLength / 2}px`;
        rightLine.background = color;
        rightLine.thickness = 0;
        this.crosshairContainer.addControl(rightLine);

        console.log("setupUI: Over-the-shoulder crosshair created.");
    }

    private setupPointerLock() {
        const canvas = this.scene.getEngine().getRenderingCanvas();
        if (!canvas) return;

        canvas.addEventListener("click", () => {
            if (!this.isLocked) {
                const anyCanvas = canvas as any;
                anyCanvas.requestPointerLock = anyCanvas.requestPointerLock ||
                    anyCanvas.msRequestPointerLock ||
                    anyCanvas.mozRequestPointerLock ||
                    anyCanvas.webkitRequestPointerLock;
                if (anyCanvas.requestPointerLock) {
                    anyCanvas.requestPointerLock();
                }
            }
        });

        const pointerlockchange = () => {
            const anyDoc = document as any;
            const control = anyDoc.pointerLockElement ||
                anyDoc.mozPointerLockElement ||
                anyDoc.webkitPointerLockElement ||
                anyDoc.msPointerLockElement ||
                null;

            if (control === canvas) {
                this.isLocked = true;
            } else {
                this.isLocked = false;
            }
        };

        document.addEventListener("pointerlockchange", pointerlockchange, false);
        document.addEventListener("mspointerlockchange", pointerlockchange, false);
        document.addEventListener("mozpointerlockchange", pointerlockchange, false);
        document.addEventListener("webkitpointerlockchange", pointerlockchange, false);
    }
}