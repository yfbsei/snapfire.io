import * as THREE from 'three';

export class Player {
    constructor(scene, camera, terrainSystem) {
        this.scene = scene;
        this.camera = camera;
        this.terrainSystem = terrainSystem;

        this.speed = 10.0;
        this.height = 0.16; // Eye height (~1.6m at 1:10 scale)
        this.radius = 0.05; // Sphere size (~0.5m at 1:10 scale)
        this.position = new THREE.Vector3(0, this.height, 0);

        // Visible representation
        const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: 0x3498db,
            roughness: 0.3,
            metalness: 0.7
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        // Mouse look
        this.pitch = 0;
        this.yaw = 0;
        this.sensitivity = 0.003;

        // Movement keys
        this.keys = { forward: false, backward: false, left: false, right: false };

        this._setupInput();
    }

    _setupInput() {
        this._keydown = (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.forward = true; break;
                case 'KeyS': this.keys.backward = true; break;
                case 'KeyA': this.keys.left = true; break;
                case 'KeyD': this.keys.right = true; break;
            }
        };

        this._keyup = (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.forward = false; break;
                case 'KeyS': this.keys.backward = false; break;
                case 'KeyA': this.keys.left = false; break;
                case 'KeyD': this.keys.right = false; break;
            }
        };

        this._mousemove = (e) => {
            if (document.pointerLockElement) {
                this.yaw -= e.movementX * this.sensitivity;
                this.pitch -= e.movementY * this.sensitivity;
                this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
            }
        };

        window.addEventListener('keydown', this._keydown);
        window.addEventListener('keyup', this._keyup);
        window.addEventListener('mousemove', this._mousemove);
    }

    setEnabled(enabled) {
        if (enabled) {
            document.body.requestPointerLock();
            // Hide mesh in first-person to avoid camera clipping
            this.mesh.visible = false;
        } else {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            this.mesh.visible = true;
        }
    }

    update(deltaTime) {
        if (document.pointerLockElement) {
            const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));

            if (this.keys.forward) this.position.addScaledVector(forward, this.speed * deltaTime);
            if (this.keys.backward) this.position.addScaledVector(forward, -this.speed * deltaTime);
            if (this.keys.left) this.position.addScaledVector(right, this.speed * deltaTime);
            if (this.keys.right) this.position.addScaledVector(right, -this.speed * deltaTime);
        }

        // Always snap to terrain so we don't "fall through" visually
        const terrainHeight = this.terrainSystem.getHeight(this.position.x, this.position.z);
        this.position.y = terrainHeight + this.height;

        // Update mesh position (centered on terrain, base touches ground)
        this.mesh.position.set(this.position.x, terrainHeight + this.radius, this.position.z);

        // Update camera (at eye height)
        this.camera.position.copy(this.position);
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    }

    dispose() {
        window.removeEventListener('keydown', this._keydown);
        window.removeEventListener('keyup', this._keyup);
        window.removeEventListener('mousemove', this._mousemove);

        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }

        if (document.pointerLockElement) document.exitPointerLock();
    }
}
