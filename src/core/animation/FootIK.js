import * as THREE from 'three';

/**
 * FootIK - Adjusts feet to terrain
 */
export class FootIK {
    constructor(character, ikSystem) {
        this.character = character; // Object3D root
        this.ikSystem = ikSystem;
        this.enabled = true;

        this.legs = []; // { chain: [Hip, Knee, Ankle], solver, rayOriginOffset }
        this.physicsWorld = null; // Need physics for raycast
        this.groundOffset = 0.1;
    }

    /**
     * Setup leg chain
     * @param {Array<THREE.Bone>} bones - [Hip, Knee, Ankle]
     * @param {THREE.Vector3} rayOriginOffset - Offset from root for raycast
     */
    addLeg(bones, rayOriginOffset = new THREE.Vector3(0, 0.5, 0)) {
        if (bones.length < 2) return;

        const solver = this.ikSystem.createFABRIKSolver(bones, {
            iterations: 5,
            tolerance: 0.01,
            weight: 0.0 // Start disabled, fade in
        });

        this.legs.push({
            bones,
            solver,
            rayOriginOffset,
            targetPos: new THREE.Vector3(),
            currentWeight: 0
        });
    }

    setPhysicsWorld(world) {
        this.physicsWorld = world;
    }

    update(dt) {
        if (!this.enabled || !this.physicsWorld) return;

        const rootPos = this.character.position;

        for (const leg of this.legs) {
            // 1. Raycast to find ground
            // Origin relative to character position
            const rayOrigin = rootPos.clone().add(
                leg.rayOriginOffset.clone().applyQuaternion(this.character.quaternion)
            );

            // Raycast down
            const hit = this.physicsWorld.raycast(rayOrigin, new THREE.Vector3(0, -1, 0), 2.0);

            if (hit) {
                // Target is hit point + offset (ankle height)
                const targetY = hit.point.y + this.groundOffset;

                // If target is reachable (within leg length from hip), invoke IK
                // Simple logic for now: Set target vector

                leg.targetPos.copy(hit.point);
                leg.targetPos.y = targetY;

                leg.solver.target = leg.targetPos;
                leg.solver.weight = THREE.MathUtils.lerp(leg.solver.weight, 1.0, dt * 5); // Smooth fade in
            } else {
                leg.solver.weight = THREE.MathUtils.lerp(leg.solver.weight, 0.0, dt * 5); // Fade out if no ground
            }
        }
    }
}
