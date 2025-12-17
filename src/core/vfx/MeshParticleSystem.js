/**
 * MeshParticleSystem - GPU-instanced mesh particle system
 * Renders thousands of mesh instances with full transform control
 */
import * as THREE from 'three';

/**
 * MeshParticle - Individual mesh particle data
 */
class MeshParticle {
    constructor() {
        this.active = false;
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.rotation = new THREE.Euler();
        this.angularVelocity = new THREE.Vector3();
        this.scale = new THREE.Vector3(1, 1, 1);
        this.scaleVelocity = new THREE.Vector3();
        this.color = new THREE.Color(1, 1, 1);
        this.opacity = 1.0;
        this.lifetime = 1.0;
        this.age = 0;
        this.userData = {};
    }

    reset() {
        this.active = false;
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.rotation.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.scale.set(1, 1, 1);
        this.scaleVelocity.set(0, 0, 0);
        this.color.setRGB(1, 1, 1);
        this.opacity = 1.0;
        this.lifetime = 1.0;
        this.age = 0;
    }
}

/**
 * MeshParticleSystem - Main system class
 */
export class MeshParticleSystem {
    constructor(options = {}) {
        // Settings
        this.maxParticles = options.maxParticles ?? 1000;
        this.mesh = options.mesh ?? null;
        this.material = options.material ?? null;

        // Animation curves
        this.colorOverLifetime = options.colorOverLifetime ?? null;
        this.scaleOverLifetime = options.scaleOverLifetime ?? null;
        this.opacityOverLifetime = options.opacityOverLifetime ?? null;

        // Physics
        this.gravity = options.gravity ?? new THREE.Vector3(0, -9.8, 0);
        this.drag = options.drag ?? 0.0;

        // Particle pool
        this.particles = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push(new MeshParticle());
        }

        // Instance mesh
        this.instancedMesh = null;
        this.activeCount = 0;

        // Temp objects for calculations
        this._matrix = new THREE.Matrix4();
        this._position = new THREE.Vector3();
        this._quaternion = new THREE.Quaternion();
        this._scale = new THREE.Vector3();
        this._color = new THREE.Color();
    }

    /**
     * Initialize the particle system with a mesh
     * @param {THREE.BufferGeometry|THREE.Mesh} geometry - Geometry or mesh to use
     * @param {THREE.Material} material - Optional material override
     */
    init(geometry, material = null) {
        // Get geometry from mesh if needed
        let geo = geometry;
        if (geometry.isMesh) {
            geo = geometry.geometry;
            if (!material) {
                material = geometry.material;
            }
        }

        // Use provided or default material
        const mat = material ?? this.material ?? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.0
        });

        // Create instanced mesh
        this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.frustumCulled = false;
        this.instancedMesh.name = 'MeshParticleSystem';

        // Initialize all instances to scale 0 (invisible)
        const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < this.maxParticles; i++) {
            this.instancedMesh.setMatrixAt(i, zeroMatrix);
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;

        // Setup instance colors if material supports it
        if (mat.vertexColors !== false) {
            this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(this.maxParticles * 3),
                3
            );
            this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        console.log(`MeshParticleSystem: Initialized with ${this.maxParticles} instances`);
    }

    /**
     * Emit particles
     * @param {number} count - Number of particles to emit
     * @param {Object} options - Emission options
     */
    emit(count, options = {}) {
        const position = options.position ?? new THREE.Vector3();
        const positionSpread = options.positionSpread ?? new THREE.Vector3();
        const velocity = options.velocity ?? new THREE.Vector3(0, 5, 0);
        const velocitySpread = options.velocitySpread ?? new THREE.Vector3(1, 1, 1);
        const rotation = options.rotation ?? new THREE.Euler();
        const rotationSpread = options.rotationSpread ?? new THREE.Vector3();
        const angularVelocity = options.angularVelocity ?? new THREE.Vector3();
        const angularVelocitySpread = options.angularVelocitySpread ?? new THREE.Vector3();
        const scale = options.scale ?? new THREE.Vector3(1, 1, 1);
        const scaleSpread = options.scaleSpread ?? 0;
        const color = options.color ?? new THREE.Color(1, 1, 1);
        const lifetime = options.lifetime ?? 2.0;
        const lifetimeSpread = options.lifetimeSpread ?? 0.5;

        for (let i = 0; i < count; i++) {
            const particle = this._getAvailableParticle();
            if (!particle) break;

            particle.active = true;
            particle.age = 0;

            // Position
            particle.position.set(
                position.x + (Math.random() - 0.5) * positionSpread.x * 2,
                position.y + (Math.random() - 0.5) * positionSpread.y * 2,
                position.z + (Math.random() - 0.5) * positionSpread.z * 2
            );

            // Velocity
            particle.velocity.set(
                velocity.x + (Math.random() - 0.5) * velocitySpread.x * 2,
                velocity.y + (Math.random() - 0.5) * velocitySpread.y * 2,
                velocity.z + (Math.random() - 0.5) * velocitySpread.z * 2
            );

            // Rotation
            particle.rotation.set(
                rotation.x + (Math.random() - 0.5) * rotationSpread.x * 2,
                rotation.y + (Math.random() - 0.5) * rotationSpread.y * 2,
                rotation.z + (Math.random() - 0.5) * rotationSpread.z * 2
            );

            // Angular velocity
            particle.angularVelocity.set(
                angularVelocity.x + (Math.random() - 0.5) * angularVelocitySpread.x * 2,
                angularVelocity.y + (Math.random() - 0.5) * angularVelocitySpread.y * 2,
                angularVelocity.z + (Math.random() - 0.5) * angularVelocitySpread.z * 2
            );

            // Scale
            const scaleVar = 1 + (Math.random() - 0.5) * scaleSpread * 2;
            particle.scale.copy(scale).multiplyScalar(scaleVar);

            // Color
            particle.color.copy(color);
            particle.opacity = 1.0;

            // Lifetime
            particle.lifetime = lifetime + (Math.random() - 0.5) * lifetimeSpread * 2;
        }
    }

    _getAvailableParticle() {
        for (const particle of this.particles) {
            if (!particle.active) {
                return particle;
            }
        }
        return null;
    }

    /**
     * Update particle system
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this.instancedMesh) return;

        this.activeCount = 0;

        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];

            if (!particle.active) {
                // Set scale to 0 for inactive particles
                this._matrix.makeScale(0, 0, 0);
                this.instancedMesh.setMatrixAt(i, this._matrix);
                continue;
            }

            // Update age
            particle.age += deltaTime;

            // Check lifetime
            if (particle.age >= particle.lifetime) {
                particle.active = false;
                this._matrix.makeScale(0, 0, 0);
                this.instancedMesh.setMatrixAt(i, this._matrix);
                continue;
            }

            // Calculate normalized lifetime (0 to 1)
            const t = particle.age / particle.lifetime;

            // Apply physics
            particle.velocity.addScaledVector(this.gravity, deltaTime);
            if (this.drag > 0) {
                particle.velocity.multiplyScalar(1 - this.drag * deltaTime);
            }
            particle.position.addScaledVector(particle.velocity, deltaTime);

            // Apply rotation
            particle.rotation.x += particle.angularVelocity.x * deltaTime;
            particle.rotation.y += particle.angularVelocity.y * deltaTime;
            particle.rotation.z += particle.angularVelocity.z * deltaTime;

            // Apply scale over lifetime
            this._scale.copy(particle.scale);
            if (this.scaleOverLifetime) {
                const scaleMultiplier = this._sampleCurve(this.scaleOverLifetime, t);
                this._scale.multiplyScalar(scaleMultiplier);
            }

            // Apply color over lifetime
            this._color.copy(particle.color);
            if (this.colorOverLifetime) {
                const colorData = this._sampleColorGradient(this.colorOverLifetime, t);
                this._color.copy(colorData);
            }

            // Apply opacity over lifetime
            let opacity = particle.opacity;
            if (this.opacityOverLifetime) {
                opacity *= this._sampleCurve(this.opacityOverLifetime, t);
            }

            // Build matrix
            this._quaternion.setFromEuler(particle.rotation);
            this._matrix.compose(particle.position, this._quaternion, this._scale);
            this.instancedMesh.setMatrixAt(i, this._matrix);

            // Set color
            if (this.instancedMesh.instanceColor) {
                this.instancedMesh.setColorAt(i, this._color);
            }

            this.activeCount++;
        }

        // Update buffers
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }

        // Update count for rendering
        this.instancedMesh.count = this.particles.length;
    }

    _sampleCurve(curve, t) {
        if (!curve || curve.length === 0) return 1;
        if (curve.length === 1) return curve[0][1];

        for (let i = 0; i < curve.length - 1; i++) {
            if (t >= curve[i][0] && t <= curve[i + 1][0]) {
                const localT = (t - curve[i][0]) / (curve[i + 1][0] - curve[i][0]);
                return THREE.MathUtils.lerp(curve[i][1], curve[i + 1][1], localT);
            }
        }

        return curve[curve.length - 1][1];
    }

    _sampleColorGradient(gradient, t) {
        if (!gradient || gradient.length === 0) return new THREE.Color(1, 1, 1);
        if (gradient.length === 1) return gradient[0].color;

        for (let i = 0; i < gradient.length - 1; i++) {
            if (t >= gradient[i].t && t <= gradient[i + 1].t) {
                const localT = (t - gradient[i].t) / (gradient[i + 1].t - gradient[i].t);
                return new THREE.Color().lerpColors(
                    gradient[i].color,
                    gradient[i + 1].color,
                    localT
                );
            }
        }

        return gradient[gradient.length - 1].color;
    }

    /**
     * Get the mesh for adding to scene
     * @returns {THREE.InstancedMesh}
     */
    getMesh() {
        return this.instancedMesh;
    }

    /**
     * Get active particle count
     * @returns {number}
     */
    getActiveCount() {
        return this.activeCount;
    }

    /**
     * Clear all particles
     */
    clear() {
        for (const particle of this.particles) {
            particle.reset();
        }
        this.activeCount = 0;
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
    }
}

export default MeshParticleSystem;
