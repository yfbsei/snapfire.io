import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, GameConfig.PLAYER.HEIGHT, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);

    // Player stats
    this.health = GameConfig.PLAYER.HEALTH;
    this.ammo = GameConfig.PLAYER.AMMO.CURRENT;
    this.maxAmmo = GameConfig.PLAYER.AMMO.MAX;

    // Movement state
    this.onGround = false;
    this.isRunning = false;
    this.wasOnGround = false;
    this.timeSinceGrounded = 0;

    // Jump mechanics
    this.canJump = true;
    this.lastJumpTime = 0;
    this.jumpBufferTime = 0;
    this.coyoteTime = 0;

    // Mouse look
    this.mouseX = 0;
    this.mouseY = 0;

    // Raycaster for shooting
    this.raycaster = new THREE.Raycaster();

    this.init();
  }

  init() {
    // Ensure position is valid
    this.position.set(0, GameConfig.PLAYER.HEIGHT, 0);
    this.camera.position.copy(this.position);

    // Initialize all numeric values
    this.velocity.set(0, 0, 0);
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastJumpTime = 0;
    this.timeSinceGrounded = 0;
    this.jumpBufferTime = 0;
    this.coyoteTime = 0;

    console.log('👤 Player initialized at position:', this.position);
  }

  handleMouseMove(deltaX, deltaY) {
    this.mouseX += deltaX * GameConfig.PLAYER.MOUSE_SENSITIVITY;
    this.mouseY += deltaY * GameConfig.PLAYER.MOUSE_SENSITIVITY;

    // Clamp vertical look
    this.mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mouseY));
  }

  update(deltaTime, keys, world) {
    const currentTime = Date.now();

    // Update jump mechanics
    this.updateJumpMechanics(deltaTime, currentTime);

    this.handleMovement(keys, world, deltaTime, currentTime);
    this.handlePhysics(deltaTime);
    this.updateCamera();
    this.updateUI();
  }

  updateJumpMechanics(deltaTime, currentTime) {
    // Simple jump cooldown reset
    if (!this.canJump && currentTime - this.lastJumpTime > GameConfig.PLAYER.JUMP_COOLDOWN) {
      this.canJump = true;
      console.log('🔄 Jump cooldown complete, can jump again');
    }
  }

  handleMovement(keys, world, deltaTime, currentTime) {
    // Get movement vectors
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    forward.applyQuaternion(this.camera.quaternion);
    right.applyQuaternion(this.camera.quaternion);

    // Remove Y component for ground movement
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    // Calculate movement input
    const moveVector = new THREE.Vector3();
    this.isRunning = keys.ShiftLeft || keys.ShiftRight;
    const speed = this.isRunning ? GameConfig.PLAYER.SPEED.RUN : GameConfig.PLAYER.SPEED.WALK;

    if (keys.KeyW || keys.ArrowUp) moveVector.add(forward);
    if (keys.KeyS || keys.ArrowDown) moveVector.sub(forward);
    if (keys.KeyA || keys.ArrowLeft) moveVector.sub(right);
    if (keys.KeyD || keys.ArrowRight) moveVector.add(right);

    // Apply movement based on ground state
    if (this.onGround) {
      // Direct movement on ground
      this.velocity.x = moveVector.x * speed;
      this.velocity.z = moveVector.z * speed;
    } else {
      // Reduced air control
      const airControl = GameConfig.PLAYER.AIR_CONTROL;
      this.velocity.x += moveVector.x * speed * airControl * deltaTime * 10;
      this.velocity.z += moveVector.z * speed * airControl * deltaTime * 10;

      // Air friction
      this.velocity.x *= GameConfig.PHYSICS.AIR_FRICTION;
      this.velocity.z *= GameConfig.PHYSICS.AIR_FRICTION;
    }

    // Debug jump input
    if (keys.Space) {
      console.log('Space key pressed! Jump conditions:', {
        onGround: this.onGround,
        canJump: this.canJump,
        position: this.position.y
      });
    }

    // Simplified jumping - just check if on ground and can jump
    if (keys.Space && this.onGround && this.canJump) {
      this.performJump(currentTime);
    }
  }

  performJump(currentTime) {
    this.velocity.y = GameConfig.PLAYER.SPEED.JUMP;
    this.onGround = false;
    this.canJump = false;
    this.lastJumpTime = currentTime;

    console.log('🦘 Jump! Velocity Y:', this.velocity.y);
  }

  handlePhysics(deltaTime) {
    // Ensure deltaTime is valid
    deltaTime = Math.max(0.001, Math.min(deltaTime, 0.1));

    // Apply gravity
    this.velocity.y += GameConfig.PHYSICS.GRAVITY;

    // Ensure velocity values are valid
    if (!isFinite(this.velocity.x)) this.velocity.x = 0;
    if (!isFinite(this.velocity.y)) this.velocity.y = 0;
    if (!isFinite(this.velocity.z)) this.velocity.z = 0;

    // Update position
    this.position.add(this.velocity);

    // Ensure position values are valid
    if (!isFinite(this.position.x)) this.position.x = 0;
    if (!isFinite(this.position.y)) this.position.y = GameConfig.PHYSICS.GROUND_LEVEL;
    if (!isFinite(this.position.z)) this.position.z = 0;

    // Ground collision with improved detection
    const wasOnGround = this.onGround;
    if (this.position.y <= GameConfig.PHYSICS.GROUND_LEVEL) {
      this.position.y = GameConfig.PHYSICS.GROUND_LEVEL;

      // Only reset vertical velocity if moving downward
      if (this.velocity.y <= 0) {
        this.velocity.y = 0;
        this.onGround = true;

        // Landing feedback
        if (!wasOnGround && this.timeSinceGrounded > 200) {
          console.log('🏃 Landed!');
        }
      }
    } else {
      this.onGround = false;
    }

    // World boundaries
    const halfWorld = GameConfig.WORLD.SIZE / 2;
    this.position.x = Math.max(-halfWorld, Math.min(halfWorld, this.position.x));
    this.position.z = Math.max(-halfWorld, Math.min(halfWorld, this.position.z));
  }

  updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.y = this.mouseX;
    this.camera.rotation.x = this.mouseY;
  }

  updateUI() {
    // Update health
    const healthElement = document.getElementById('health');
    if (healthElement) {
      healthElement.textContent = this.health;
    }

    // Update ammo
    const ammoElement = document.getElementById('ammo');
    if (ammoElement) {
      ammoElement.textContent = this.ammo;
    }

    // Update position
    const positionElement = document.getElementById('position');
    if (positionElement) {
      positionElement.textContent =
        `${Math.round(this.position.x)}, ${Math.round(this.position.y)}, ${Math.round(this.position.z)}`;
    }

    // Debug: Log movement (remove this later)
    if (Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01) {
      console.log('Moving:', {
        position: this.position,
        velocity: this.velocity,
        onGround: this.onGround
      });
    }
  }

  shoot(scene) {
    if (this.ammo <= 0) {
      console.log('🔫 Out of ammo!');
      return;
    }

    this.ammo--;
    console.log(`🔫 Shot fired! Ammo: ${this.ammo}`);

    // Create muzzle flash
    this.createMuzzleFlash(scene);

    // For now, just show where we're aiming
    // In multiplayer, this will send shot data to server
    const shootDirection = this.camera.getWorldDirection(new THREE.Vector3());
    console.log('🎯 Shooting towards:', shootDirection);

    // TODO: Add multiplayer hit detection here
  }

  createMuzzleFlash(scene) {
    const flashGeometry = new THREE.SphereGeometry(0.2);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: GameConfig.WEAPONS.MUZZLE_FLASH_COLOR,
      transparent: true,
      opacity: 0.8
    });

    const flash = new THREE.Mesh(flashGeometry, flashMaterial);

    // Position flash in front of camera
    const gunPosition = this.camera.position.clone();
    gunPosition.add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
    flash.position.copy(gunPosition);

    scene.add(flash);

    // Remove flash after duration
    setTimeout(() => {
      scene.remove(flash);
      flashGeometry.dispose();
      flashMaterial.dispose();
    }, GameConfig.WEAPONS.MUZZLE_FLASH_DURATION);
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    console.log(`💔 Player took ${amount} damage! Health: ${this.health}`);

    if (this.health <= 0) {
      console.log('💀 Game Over!');
      // TODO: Implement game over logic
    }
  }

  reload() {
    if (this.ammo < this.maxAmmo) {
      this.ammo = this.maxAmmo;
      console.log('🔄 Reloaded!');
    }
  }

  getPosition() {
    return this.position.clone();
  }

  getForwardDirection() {
    return this.camera.getWorldDirection(new THREE.Vector3());
  }
}