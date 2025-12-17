import * as THREE from 'three';

/**
 * RagdollSystem - Manages physical ragdolls for characters
 * Maps SkinnedMesh bones to RigidBodies and Constraints
 */
export class RagdollSystem {
    constructor(physicsWorld) {
        this.world = physicsWorld;
        this.ragdolls = new Map(); // uuid -> { bodies, joints, mesh }
    }

    /**
     * Create a ragdoll from a skinned mesh
     * @param {THREE.SkinnedMesh} mesh 
     * @param {Object} config - Bone mapping configuration
     */
    createRagdoll(mesh, config) {
        const bodies = [];
        const joints = [];

        // Config structure:
        // [
        //   { bone: 'Hips', radius: 0.15, mass: 10 },
        //   { bone: 'LegL', parent: 'Hips', ... }
        // ] (Simplified)

        // Real implementation requires recursive bone traversal or explicit map
        // For this implementation, we assume a simple config array

        const boneMap = new Map(); // boneName -> { bone, body }

        // First pass: Create RigidBodies
        config.bones.forEach(boneConfig => {
            const bone = mesh.skeleton.getBoneByName(boneConfig.name);
            if (!bone) {
                console.warn(`Bone not found: ${boneConfig.name}`);
                return;
            }

            // Get world position/rotation of bone
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            bone.getWorldPosition(position);
            bone.getWorldQuaternion(quaternion);

            // Create Body
            const body = this.world.createRigidBody({
                type: 'dynamic',
                shape: boneConfig.shape || 'capsule',
                radius: boneConfig.radius || 0.1,
                height: boneConfig.height || 0.4,
                width: boneConfig.width || 0.2,
                depth: boneConfig.depth || 0.2, // for box
                mass: boneConfig.mass || 1,
                object: null // We don't attach bone directly yet, we sync later
            });

            // Set initial transform
            body.setPosition(position);
            body.setRotation(quaternion);

            boneMap.set(boneConfig.name, { bone, body, config: boneConfig });
            bodies.push(body);
        });

        // Second pass: Create Joints
        config.bones.forEach(boneConfig => {
            if (!boneConfig.parent) return; // Root

            const item = boneMap.get(boneConfig.name);
            const parentItem = boneMap.get(boneConfig.parent);

            if (item && parentItem) {
                // Calculate anchor points in local space of bodies?
                // Or just use world points if physics engine supports it
                // Rapier joints usually defined in local frames
                // For simplicity, we assume generic spherical joints for now

                const joint = this.world.createJoint(parentItem.body, item.body, {
                    type: boneConfig.jointType || 'spherical',
                    anchorA: { x: 0, y: -0.2, z: 0 }, // Placeholder offset
                    anchorB: { x: 0, y: 0.2, z: 0 },
                    limits: boneConfig.limits
                });

                if (joint) joints.push(joint);
            }
        });

        const ragdoll = {
            mesh,
            boneMap,
            bodies,
            joints,
            enabled: false
        };

        this.ragdolls.set(mesh.uuid, ragdoll);
        return ragdoll;
    }

    /**
     * Enable ragdoll mode (physics drives bones)
     */
    enable(mesh) {
        const ragdoll = this.ragdolls.get(mesh.uuid);
        if (!ragdoll) return;

        ragdoll.enabled = true;

        // Initialize bodies to match current animation pose relative to root?
        // Usually we snap physics to animation frame 0 of ragdoll

        ragdoll.boneMap.forEach(item => {
            const position = new THREE.Vector3();
            const quaternion = new THREE.Quaternion();
            item.bone.getWorldPosition(position);
            item.bone.getWorldQuaternion(quaternion);

            item.body.setPosition(position);
            item.body.setRotation(quaternion);
            item.body.velocity = new THREE.Vector3(0, 0, 0);
        });
    }

    update(dt) {
        for (const ragdoll of this.ragdolls.values()) {
            if (!ragdoll.enabled) continue;

            ragdoll.boneMap.forEach(item => {
                // Map physics body transform back to bone
                const bodyPos = new THREE.Vector3(); // item.body.position (need getter)
                // Since we don't have getter for position in our Refactored RigidBody yet (only mirror object), 
                // we assume the Adapter sync mechanism updates an 'object' if attached.
                // But here we didn't attach the bone directly as 'object' in createRigidBody options 
                // because bones are in a hierarchy and physics bodies are flat.
                // We must manually read from body (adapter) and apply to bone (helper).

                // NOTE: Detailed implementation omitted for brevity. 
                // In production: read handle pose -> convert to bone local space -> apply.
            });
        }
    }
}
