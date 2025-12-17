/**
 * GPUParticleSystem - High-performance GPU-accelerated particle system
 * Uses WebGPU compute shaders for physics simulation
 */

// Node.js compatibility: 'self' global is required by three.webgpu.js
if (typeof self === 'undefined') {
    globalThis.self = globalThis;
}

import * as THREE from 'three';
import {
    storage,
    instanceIndex,
    float,
    vec3,
    vec4,
    uniform,
    Fn,
    If,
    Loop,
    hash,
    mix,
    clamp,
    min,
    max,
    length,
    normalize,
    select,
    attribute
} from 'three/tsl';

/**
 * ParticleEmitter - Configuration for particle emission
 */
export class ParticleEmitter {
    constructor(options = {}) {
        this.position = options.position || new THREE.Vector3(0, 0, 0);
        this.direction = options.direction || new THREE.Vector3(0, 1, 0);
        this.spread = options.spread || 0.5;          // Cone angle in radians
        this.rate = options.rate || 1000;             // Particles per second
        this.lifetime = options.lifetime || [1, 3];   // [min, max] seconds
        this.velocity = options.velocity || [2, 5];   // [min, max] speed
        this.size = options.size || [0.1, 0.05];      // [start, end] size
        this.color = options.color || [
            new THREE.Color(1, 0.8, 0.2),             // Start color
            new THREE.Color(1, 0.2, 0.0)              // End color
        ];
        this.gravity = options.gravity || new THREE.Vector3(0, -9.8, 0);
        this.enabled = true;

        // Internal state
        this._accumulator = 0;
    }
}

/**
 * GPUParticleSystem - Main particle system class
 */
export class GPUParticleSystem {
    constructor(options = {}) {
        this.maxParticles = options.maxParticles || 100000;
        this.emitters = [];
        this.renderer = options.renderer || null;
        this.isWebGPU = false;

        // Storage buffers
        this.positionBuffer = null;
        this.velocityBuffer = null;
        this.lifetimeBuffer = null;   // [remaining, total]
        this.colorBuffer = null;
        this.sizeBuffer = null;

        // Uniforms
        this.deltaTimeUniform = uniform(0.016);
        this.gravityUniform = uniform(new THREE.Vector3(0, -9.8, 0));
        this.timeUniform = uniform(0);

        // Compute nodes
        this.updateComputeNode = null;
        this.spawnComputeNode = null;

        // Rendering
        this._mesh = null;
        this._geometry = null;
        this._material = null;

        // State
        this.activeParticles = 0;
        this.initialized = false;
        this.particlePool = []; // Indices of dead particles for recycling
    }

    /**
     * Initialize the particle system
     * @param {THREE.WebGPURenderer} renderer
     * @returns {Promise<boolean>}
     */
    async init(renderer) {
        this.renderer = renderer;
        this.isWebGPU = renderer.isWebGPURenderer || false;

        if (!this.isWebGPU) {
            console.warn('GPUParticleSystem: WebGPU not available, using CPU fallback');
            this._initCPUFallback();
            return false;
        }

        this._initBuffers();
        this._createComputeNodes();
        this._createMesh();

        this.initialized = true;
        console.log(`GPUParticleSystem initialized with ${this.maxParticles} max particles`);
        return true;
    }

    /**
     * Initialize storage buffers
     * @private
     */
    _initBuffers() {
        const count = this.maxParticles;

        // Position buffer (vec3)
        const positions = new Float32Array(count * 3);
        this.positionBuffer = new THREE.StorageInstancedBufferAttribute(positions, 3);

        // Velocity buffer (vec3)
        const velocities = new Float32Array(count * 3);
        this.velocityBuffer = new THREE.StorageInstancedBufferAttribute(velocities, 3);

        // Lifetime buffer (vec2: remaining, total)
        const lifetimes = new Float32Array(count * 2);
        // Initialize all as dead (remaining = 0)
        for (let i = 0; i < count; i++) {
            lifetimes[i * 2] = 0;     // remaining
            lifetimes[i * 2 + 1] = 1; // total (avoid div by zero)
            this.particlePool.push(i);
        }
        this.lifetimeBuffer = new THREE.StorageInstancedBufferAttribute(lifetimes, 2);

        // Color buffer (vec4: rgba)
        const colors = new Float32Array(count * 4);
        for (let i = 0; i < count * 4; i += 4) {
            colors[i] = 1;     // r
            colors[i + 1] = 1; // g
            colors[i + 2] = 1; // b
            colors[i + 3] = 1; // a
        }
        this.colorBuffer = new THREE.StorageInstancedBufferAttribute(colors, 4);

        // Size buffer (vec2: current, target)
        const sizes = new Float32Array(count * 2);
        this.sizeBuffer = new THREE.StorageInstancedBufferAttribute(sizes, 2);
    }

    /**
     * Create compute shader nodes using TSL
     * @private
     */
    _createComputeNodes() {
        const positionStorage = storage(this.positionBuffer, 'vec3', this.maxParticles);
        const velocityStorage = storage(this.velocityBuffer, 'vec3', this.maxParticles);
        const lifetimeStorage = storage(this.lifetimeBuffer, 'vec2', this.maxParticles);
        const colorStorage = storage(this.colorBuffer, 'vec4', this.maxParticles);
        const sizeStorage = storage(this.sizeBuffer, 'vec2', this.maxParticles);

        const deltaTime = this.deltaTimeUniform;
        const gravity = this.gravityUniform;
        const time = this.timeUniform;

        // Update compute - physics simulation
        const updateFn = Fn(() => {
            const i = instanceIndex;

            // Read current state
            const position = positionStorage.element(i);
            const velocity = velocityStorage.element(i);
            const lifetime = lifetimeStorage.element(i);
            const color = colorStorage.element(i);
            const size = sizeStorage.element(i);

            // Get remaining lifetime
            const remaining = lifetime.x;
            const total = lifetime.y;

            // Only update if alive
            If(remaining.greaterThan(0), () => {
                // Apply gravity
                velocity.addAssign(gravity.mul(deltaTime));

                // Update position
                position.addAssign(velocity.mul(deltaTime));

                // Decrease lifetime
                lifetime.x.subAssign(deltaTime);

                // Calculate life ratio (0 = dead, 1 = fresh)
                const lifeRatio = clamp(remaining.div(total), 0, 1);

                // Fade alpha as particle dies
                color.w.assign(lifeRatio);

                // Interpolate size
                const startSize = size.x;
                const endSize = size.y;
                // size.x is now used for current render size
                // We store start/end differently - use a temp approach
            });
        });

        this.updateComputeNode = updateFn().compute(this.maxParticles);
    }

    /**
     * Create particle mesh for rendering
     * @private
     */
    _createMesh() {
        // Simple point geometry
        this._geometry = new THREE.BufferGeometry();

        // Dummy position attribute (actual positions from storage buffer)
        const dummyPositions = new Float32Array(this.maxParticles * 3);
        this._geometry.setAttribute('position', new THREE.BufferAttribute(dummyPositions, 3));

        // Add storage buffers as attributes for rendering
        this._geometry.setAttribute('particlePosition', this.positionBuffer);
        this._geometry.setAttribute('particleColor', this.colorBuffer);
        this._geometry.setAttribute('particleLifetime', this.lifetimeBuffer);
        this._geometry.setAttribute('particleSize', this.sizeBuffer);

        // Create node material for particles
        this._material = new THREE.PointsNodeMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        // Use storage buffer positions in shader
        const particlePosition = attribute('particlePosition');
        const particleColor = attribute('particleColor');
        const particleLifetime = attribute('particleLifetime');
        const particleSize = attribute('particleSize');

        // Vertex position from storage buffer
        this._material.positionNode = particlePosition;

        // Color with alpha from lifetime
        this._material.colorNode = vec4(
            particleColor.xyz,
            particleColor.w.mul(select(particleLifetime.x.greaterThan(0), 1.0, 0.0))
        );

        // Size from buffer
        this._material.sizeNode = particleSize.x.mul(50.0); // Scale factor

        this._mesh = new THREE.Points(this._geometry, this._material);
        this._mesh.frustumCulled = false; // Particles can be anywhere
    }

    /**
     * CPU fallback initialization
     * @private
     */
    _initCPUFallback() {
        // Limit particle count for CPU
        this.maxParticles = Math.min(this.maxParticles, 10000);

        this._geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const colors = new Float32Array(this.maxParticles * 4);
        const sizes = new Float32Array(this.maxParticles);

        this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
        this._geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        this._material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this._mesh = new THREE.Points(this._geometry, this._material);

        // CPU particle data
        this._cpuParticles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this._cpuParticles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                lifetime: 0,
                maxLifetime: 1,
                size: 0.1,
                alive: false
            });
            this.particlePool.push(i);
        }

        this.initialized = true;
        console.log(`GPUParticleSystem CPU fallback: ${this.maxParticles} max particles`);
    }

    /**
     * Add an emitter to the system
     * @param {ParticleEmitter|Object} emitter
     * @returns {ParticleEmitter}
     */
    addEmitter(emitter) {
        if (!(emitter instanceof ParticleEmitter)) {
            emitter = new ParticleEmitter(emitter);
        }
        this.emitters.push(emitter);
        return emitter;
    }

    /**
     * Remove an emitter
     * @param {ParticleEmitter} emitter
     */
    removeEmitter(emitter) {
        const idx = this.emitters.indexOf(emitter);
        if (idx !== -1) {
            this.emitters.splice(idx, 1);
        }
    }

    /**
     * Spawn a single particle
     * @private
     */
    _spawnParticle(emitter) {
        if (this.particlePool.length === 0) return;

        const idx = this.particlePool.pop();

        // Random direction within cone
        const dir = emitter.direction.clone().normalize();
        const randomAngle = Math.random() * Math.PI * 2;
        const randomSpread = Math.random() * emitter.spread;

        // Create perpendicular vectors for cone spread
        const up = Math.abs(dir.y) < 0.99
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const forward = new THREE.Vector3().crossVectors(right, dir).normalize();

        // Apply spread
        const spreadDir = dir.clone()
            .add(right.clone().multiplyScalar(Math.cos(randomAngle) * Math.sin(randomSpread)))
            .add(forward.clone().multiplyScalar(Math.sin(randomAngle) * Math.sin(randomSpread)))
            .normalize();

        // Random lifetime and velocity
        const lifetime = emitter.lifetime[0] + Math.random() * (emitter.lifetime[1] - emitter.lifetime[0]);
        const speed = emitter.velocity[0] + Math.random() * (emitter.velocity[1] - emitter.velocity[0]);

        if (this.isWebGPU) {
            // Write to storage buffers
            const posArr = this.positionBuffer.array;
            const velArr = this.velocityBuffer.array;
            const lifeArr = this.lifetimeBuffer.array;
            const colorArr = this.colorBuffer.array;
            const sizeArr = this.sizeBuffer.array;

            // Position
            posArr[idx * 3] = emitter.position.x;
            posArr[idx * 3 + 1] = emitter.position.y;
            posArr[idx * 3 + 2] = emitter.position.z;

            // Velocity
            velArr[idx * 3] = spreadDir.x * speed;
            velArr[idx * 3 + 1] = spreadDir.y * speed;
            velArr[idx * 3 + 2] = spreadDir.z * speed;

            // Lifetime
            lifeArr[idx * 2] = lifetime;
            lifeArr[idx * 2 + 1] = lifetime;

            // Color (start color)
            colorArr[idx * 4] = emitter.color[0].r;
            colorArr[idx * 4 + 1] = emitter.color[0].g;
            colorArr[idx * 4 + 2] = emitter.color[0].b;
            colorArr[idx * 4 + 3] = 1.0;

            // Size
            sizeArr[idx * 2] = emitter.size[0];
            sizeArr[idx * 2 + 1] = emitter.size[1];

            // Mark buffers for update
            this.positionBuffer.needsUpdate = true;
            this.velocityBuffer.needsUpdate = true;
            this.lifetimeBuffer.needsUpdate = true;
            this.colorBuffer.needsUpdate = true;
            this.sizeBuffer.needsUpdate = true;
        } else {
            // CPU fallback
            const p = this._cpuParticles[idx];
            p.position.copy(emitter.position);
            p.velocity.copy(spreadDir).multiplyScalar(speed);
            p.color.copy(emitter.color[0]);
            p.lifetime = lifetime;
            p.maxLifetime = lifetime;
            p.size = emitter.size[0];
            p.alive = true;
        }

        this.activeParticles++;
    }

    /**
     * Update the particle system
     * @param {number} deltaTime - Time since last frame in seconds
     */
    async update(deltaTime) {
        if (!this.initialized) return;

        // Update uniforms
        this.deltaTimeUniform.value = deltaTime;
        this.timeUniform.value += deltaTime;

        // Process emitters - spawn new particles
        for (const emitter of this.emitters) {
            if (!emitter.enabled) continue;

            // Update gravity from first emitter (simplified)
            this.gravityUniform.value.copy(emitter.gravity);

            // Calculate particles to spawn this frame
            emitter._accumulator += emitter.rate * deltaTime;
            const toSpawn = Math.floor(emitter._accumulator);
            emitter._accumulator -= toSpawn;

            for (let i = 0; i < toSpawn && this.particlePool.length > 0; i++) {
                this._spawnParticle(emitter);
            }
        }

        if (this.isWebGPU) {
            // Run GPU compute
            await this.renderer.computeAsync(this.updateComputeNode);

            // Recycle dead particles (check lifetime buffer)
            // This requires readback which is expensive, so we do it periodically
            // For now, we'll skip recycling and let pool run out
            // A production system would use atomic counters or indirect dispatch
        } else {
            // CPU update
            this._updateCPU(deltaTime);
        }
    }

    /**
     * CPU fallback update
     * @private
     */
    _updateCPU(deltaTime) {
        const positions = this._geometry.attributes.position.array;
        const colors = this._geometry.attributes.color.array;
        const sizes = this._geometry.attributes.size.array;

        const gravity = this.emitters[0]?.gravity || new THREE.Vector3(0, -9.8, 0);

        for (let i = 0; i < this._cpuParticles.length; i++) {
            const p = this._cpuParticles[i];

            if (!p.alive) {
                // Hide dead particles
                sizes[i] = 0;
                continue;
            }

            // Apply gravity
            p.velocity.add(gravity.clone().multiplyScalar(deltaTime));

            // Update position
            p.position.add(p.velocity.clone().multiplyScalar(deltaTime));

            // Update lifetime
            p.lifetime -= deltaTime;

            if (p.lifetime <= 0) {
                p.alive = false;
                this.particlePool.push(i);
                this.activeParticles--;
                sizes[i] = 0;
                continue;
            }

            // Life ratio
            const lifeRatio = p.lifetime / p.maxLifetime;

            // Update buffers
            positions[i * 3] = p.position.x;
            positions[i * 3 + 1] = p.position.y;
            positions[i * 3 + 2] = p.position.z;

            colors[i * 4] = p.color.r;
            colors[i * 4 + 1] = p.color.g;
            colors[i * 4 + 2] = p.color.b;
            colors[i * 4 + 3] = lifeRatio;

            sizes[i] = p.size * lifeRatio;
        }

        this._geometry.attributes.position.needsUpdate = true;
        this._geometry.attributes.color.needsUpdate = true;
        this._geometry.attributes.size.needsUpdate = true;
    }

    /**
     * Get the renderable mesh
     * @returns {THREE.Points}
     */
    get mesh() {
        return this._mesh;
    }

    /**
     * Emit a burst of particles
     * @param {number} count - Number of particles to emit
     * @param {ParticleEmitter} emitter - Emitter configuration
     */
    burst(count, emitter) {
        if (!emitter) emitter = this.emitters[0];
        if (!emitter) return;

        for (let i = 0; i < count && this.particlePool.length > 0; i++) {
            this._spawnParticle(emitter);
        }
    }

    /**
     * Clear all particles
     */
    clear() {
        this.particlePool = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool.push(i);

            if (this.isWebGPU) {
                this.lifetimeBuffer.array[i * 2] = 0;
            } else if (this._cpuParticles) {
                this._cpuParticles[i].alive = false;
            }
        }

        if (this.isWebGPU) {
            this.lifetimeBuffer.needsUpdate = true;
        }

        this.activeParticles = 0;
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this._geometry) this._geometry.dispose();
        if (this._material) this._material.dispose();

        this.positionBuffer = null;
        this.velocityBuffer = null;
        this.lifetimeBuffer = null;
        this.colorBuffer = null;
        this.sizeBuffer = null;

        this.emitters = [];
        this.initialized = false;
    }
}

export default GPUParticleSystem;
