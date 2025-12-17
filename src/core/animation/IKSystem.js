import * as THREE from 'three';

/**
 * IKSystem - Inverse Kinematics for procedural animation adjustments
 * Primarily used for Foot Locking on uneven terrain.
 */
export class IKSystem {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.scene = gameEngine.scene;
        this.physics = gameEngine.physics;

        // Active IK solvers
        this.solvers = new Set();

        this.init();
    }

    init() {
        // Register update loop if needed, or rely on game engine calling update
    }

    /**
     * Create a Foot IK Solver for a character
     * @param {THREE.SkinnedMesh} skinnedMesh 
     * @param {Object} config { leftFootBone, rightFootBone, pelvisBone, ... }
     */
    createFootSolver(skinnedMesh, config) {
        const solver = new FootIKSolver(this, skinnedMesh, config);
        this.solvers.add(solver);
        return solver;
    }

    removeSolver(solver) {
        this.solvers.delete(solver);
    }

    update(deltaTime) {
        // Update all solvers
        // For accurate IK, this must happen AFTER animation update but BEFORE rendering/physics step?
        // Actually usually: Animation -> IK -> Physics (if ragdoll) or Animation -> IK -> Render
        for (const solver of this.solvers) {
            solver.update(deltaTime);
        }
    }
}

/**
 * FootIKSolver - Handles raycasting and bone adjustment for a biped
 */
class FootIKSolver {
    constructor(system, mesh, config) {
        this.system = system;
        this.mesh = mesh;

        // Bone names or objects
        // Iterate skeleton to find bones if strings provided
        this.bones = {
            leftFoot: this._findBone(config.leftFoot),
            rightFoot: this._findBone(config.rightFoot),
            leftLowerLeg: this._findBone(config.leftLowerLeg),
            rightLowerLeg: this._findBone(config.rightLowerLeg),
            leftUpperLeg: this._findBone(config.leftUpperLeg),
            rightUpperLeg: this._findBone(config.rightUpperLeg),
            pelvis: this._findBone(config.pelvis)
        };

        this.params = {
            raycastHeight: 0.5, // Start ray above foot
            raycastDistance: 1.0,
            footOffset: 0.1, // Height of foot bottom from bone origin
            lerpSpeed: 15,
            pelvisAdjustmentSpeed: 5,
            ...config.params
        };

        // State
        this.ikWeight = 1.0;
        this.targetLeftPos = new THREE.Vector3();
        this.targetRightPos = new THREE.Vector3();
        this.pelvisOffset = 0;
    }

    _findBone(nameOrBone) {
        if (typeof nameOrBone === 'string') {
            let found = null;
            this.mesh.traverse(child => {
                if (child.isBone && child.name === nameOrBone) found = child;
            });
            return found;
        }
        return nameOrBone;
    }

    update(dt) {
        if (this.ikWeight <= 0) return;

        // 1. Raycast for both feet to find ground
        const leftHit = this._raycastFoot(this.bones.leftFoot);
        const rightHit = this._raycastFoot(this.bones.rightFoot);

        // 2. Determine Pelvis Drop
        // We want to lower the hips so the lowest foot can reach the ground
        // without hyperextending the other leg?
        // Or simplified: Just ensure the feet touch the ground.

        // Logic:
        // Calculate required offset for each foot to touch ground
        // Offset = (HitY + FootHeight) - CurrentFootWorldY

        let lOffset = 0;
        let rOffset = 0;

        if (leftHit) {
            // Desired Y
            const desiredY = leftHit.point.y + this.params.footOffset;
            // Current Skeleton Y (from animation) - we need to know where the foot WOULD be
            // This is tricky because we modify it.
            // Simplified: Compare vs Mesh Root Y?

            // Just use the hit point as the target
            this.targetLeftPos.copy(leftHit.point).y += this.params.footOffset;
        }

        if (rightHit) {
            this.targetRightPos.copy(rightHit.point).y += this.params.footOffset;
        }

        // 3. Apply Two-Bone IK
        // This is complex math (Cosine Rule). 
        // For this MVP, we will do a simple "Place Foot" if within reach.
        // A full CCD or Analytic Two-Bone solver is large.

        // Placeholder for full IK:
        // Adjust Bone Position to Target. 
        // Note: Moving a bone directly in a skeletal hierarchy requires updating matrices or using a library (like three-ik).
        // Since we don't have an IK lib installed, we'll do visual debug or simple placement if possible.

        // Basic Implementation:
        // If we just move the foot bone, the parent won't follow (mesh stretches).
        // We MUST rotate thigh and calf.

        // AAA Requirement: "Foot locking".
        // Usually involves:
        // 1. Find ground.
        // 2. Rotate foot to match normal.
        // 3. Pull pelvis down if feet are too low.

        if (leftHit) {
            // Rotate foot to match normal
            // this._alignFootToNormal(this.bones.leftFoot, leftHit.normal);
        }
    }

    _raycastFoot(bone) {
        if (!bone) return null;

        // Get bone world position
        const worldPos = new THREE.Vector3();
        bone.getWorldPosition(worldPos);

        // Ray start: up a bit
        const origin = worldPos.clone().add(new THREE.Vector3(0, this.params.raycastHeight, 0));
        const dir = new THREE.Vector3(0, -1, 0);

        // Use physics system
        const hit = this.system.physics.raycast(origin, dir, this.params.raycastDistance);
        return hit;
    }
}
