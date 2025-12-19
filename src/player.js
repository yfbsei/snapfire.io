import * as THREE from 'three';

export class Player {
    constructor(scene, camera, terrainSystem) {
        this.scene = scene;
        this.camera = camera;
        this.terrainSystem = terrainSystem;

        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 40.0;
        this.height = 1.8; // Camera height above ground
        this.radius = 0.5;

        // Player physical representation (sphere)
        const geometry = new THREE.SphereGeometry(this.radius, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        // Movement state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };

        // Mouse look state
        this.pitch = 0;
        this.yaw = 0;
        this.sensitivity = 0.002;

        // Initial position snap
        this.mesh.position.set(0, 0, 0); // Start at origin
        const startHeight = this.terrainSystem.getHeight(0, 0);
        this.mesh.position.y = startHeight + this.radius;

        this._setupInput();
    }

    _setupInput() {
        this._keydownHandler = (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.forward = true; break;
                case 'KeyS': this.keys.backward = true; break;
                case 'KeyA': this.keys.left = true; break;
                case 'KeyD': this.keys.right = true; break;
            }
        };

        this._keyupHandler = (e) => {
            switch (e.code) {
                case 'KeyW': this.keys.forward = false; break;
                case 'KeyS': this.keys.backward = false; break;
                case 'KeyA': this.keys.left = false; break;
                case 'KeyD': this.keys.right = false; break;
            }
        };

        this._mousemoveHandler = (e) => {
            if (document.pointerLockElement === document.body) {
                this.yaw -= e.movementX * this.sensitivity;
                this.pitch -= e.movementY * this.sensitivity;
                this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
            }
        };

        window.addEventListener('keydown', this._keydownHandler);
        window.addEventListener('keyup', this._keyupHandler);
        window.addEventListener('mousemove', this._mousemoveHandler);
    }

    update(deltaTime) {
        if (deltaTime > 0.1) deltaTime = 0.1; // Cap delta time

        // Calculate movement direction based on camera yaw
        // Only move if pointer lock is active (standard FPS behavior)
        if (document.pointerLockElement === document.body) {
            this.direction.set(0, 0, 0);

            // Forward direction is relative to where the player is looking
            const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
            const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));

            if (this.keys.forward) this.direction.add(forward);
            if (this.keys.backward) this.direction.sub(forward);
            if (this.keys.left) this.direction.add(right);
            if (this.keys.right) this.direction.sub(right);

            if (this.direction.length() > 0) {
                this.direction.normalize();
                this.mesh.position.addScaledVector(this.direction, this.speed * deltaTime);
            }
        }

        // Terrain Snapping / Gravity
        const terrainHeight = this.terrainSystem.getHeight(this.mesh.position.x, this.mesh.position.z);
        this.mesh.position.y = terrainHeight + this.radius;

        // Update Camera
        this.camera.position.set(
            this.mesh.position.x,
            this.mesh.position.y + (this.height - this.radius),
            this.mesh.position.z
        );

        // Update camera rotation (Pitch/Yaw)
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ'));
    }

    setEnabled(enabled) {
        if (enabled) {
            document.body.requestPointerLock();
            this.mesh.visible = false; // Hide sphere in first person
        } else {
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
            this.mesh.visible = true;
        }
    }

    dispose() {
        // Remove event listeners
        window.removeEventListener('keydown', this._keydownHandler);
        window.removeEventListener('keyup', this._keyupHandler);
        window.removeEventListener('mousemove', this._mousemoveHandler);

        // Cleanup physical mesh
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }

        if (document.pointerLockElement === document.body) {
            document.exitPointerLock();
        }
    }
}
