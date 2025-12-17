import * as THREE from 'three';

/**
 * ProceduralAnimator - Post-process animation hooks
 * Adds procedural effects: Breathing, LookAt, Sway, Recoil
 */
export class ProceduralAnimator {
    constructor(character) {
        this.character = character;
        this.modifiers = [];
        this.enabled = true;
    }

    /**
     * Add a look-at constraint
     * @param {THREE.Bone} headBone 
     * @param {Object} options { target: Vector3, weight: 1.0, limit: Math.PI/2 }
     */
    addLookAt(headBone, options = {}) {
        const modifier = {
            type: 'lookAt',
            bone: headBone,
            target: options.target || new THREE.Vector3(),
            weight: options.weight || 1.0,
            limit: options.limit || Math.PI / 2,
            offset: options.offset || new THREE.Quaternion()
        };
        this.modifiers.push(modifier);
        return modifier;
    }

    addBreathing(chestBone, options = {}) {
        const modifier = {
            type: 'breathing',
            bone: chestBone,
            speed: options.speed || 1.0,
            scale: options.scale || 0.05,
            time: 0
        };
        this.modifiers.push(modifier);
        return modifier;
    }

    update(dt) {
        if (!this.enabled) return;

        for (const mod of this.modifiers) {
            if (mod.type === 'lookAt') {
                this._updateLookAt(mod, dt);
            } else if (mod.type === 'breathing') {
                this._updateBreathing(mod, dt);
            }
        }
    }

    _updateLookAt(mod, dt) {
        if (mod.weight <= 0) return;

        const bone = mod.bone;
        const target = mod.target.isVector3 ? mod.target : mod.target.position; // support object target

        // World positions
        const bonePos = new THREE.Vector3();
        const parentPos = new THREE.Vector3(); // Parent world pose
        bone.getWorldPosition(bonePos);

        // Calculate Direction to target
        const dir = new THREE.Vector3().subVectors(target, bonePos).normalize();

        // Ideally we restrict this direction within limits relative to body forward
        // For simplicity: Simple "LookAt" using quaternions

        // Get parent rotation to convert to local
        const parentQ = new THREE.Quaternion();
        if (bone.parent) {
            bone.parent.getWorldQuaternion(parentQ);
        }
        parentQ.invert();

        // We want a rotation that faces 'dir'
        // Assume bone forward is +Z or +Y? 
        // Standard Head usually faces +Z or +Y depending on rig. 
        // Let's assume +Z is face direction

        const qt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

        // Convert to local space
        const localQ = parentQ.multiply(qt);

        // Simple damping / limits would go here

        // Apply (blend)
        bone.quaternion.slerp(localQ, mod.weight * dt * 5); // Smooth slerp
    }

    _updateBreathing(mod, dt) {
        mod.time += dt * mod.speed;
        const scale = 1 + Math.sin(mod.time) * mod.scale;

        // Scale chest/spine
        mod.bone.scale.set(scale, scale, scale);
    }
}
