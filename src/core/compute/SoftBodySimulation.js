/**
 * SoftBodySimulation - GPU-based Position-Based Dynamics for deformable objects
 * Supports volumetric soft bodies with distance and volume constraints
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
    Loop
} from 'three/tsl';

/**
 * SoftBodySimulation - Deformable body physics using PBD
 */
export class SoftBodySimulation {
    constructor(options = {}) {
        this.stiffness = options.stiffness || 0.8;        // Constraint stiffness
        this.pressure = options.pressure || 1.0;          // Volume preservation pressure
        this.iterations = options.iterations || 4;         // Solver iterations
        this.damping = options.damping || 0.99;           // Velocity damping
        this.gravityScale = options.gravityScale || 1.0;  // Gravity multiplier

        // Storage buffers
        this.positionBuffer = null;
        this.previousPositionBuffer = null;
        this.velocityBuffer = null;
        this.massBuffer = null;          // Inverse mass (0 = infinite mass / pinned)

        // Constraints
        this.distanceConstraints = [];   // {i1, i2, restLength}
        this.volumeConstraints = [];     // {indices[], restVolume}

        // Uniforms
        this.deltaTimeUniform = uniform(0.016);
        this.gravityUniform = uniform(new THREE.Vector3(0, -9.8, 0));

        // Compute nodes
        this.integrateNode = null;

        // Mesh
        this._mesh = null;
        this._geometry = null;
        this._material = null;
        this._originalGeometry = null;

        // State
        this.renderer = null;
        this.isWebGPU = false;
        this.initialized = false;
        this.vertexCount = 0;
        this.restVolume = 0;
    }

    /**
     * Initialize soft body from an existing mesh
     * @param {THREE.Renderer} renderer
     * @param {THREE.Mesh} mesh - Source mesh to make deformable
     * @returns {Promise<boolean>}
     */
    async init(renderer, mesh) {
        this.renderer = renderer;
        this.isWebGPU = renderer.isWebGPURenderer || false;

        if (!mesh || !mesh.geometry) {
            console.error('SoftBodySimulation: Valid mesh required');
            return false;
        }

        if (!this.isWebGPU) {
            console.warn('SoftBodySimulation: WebGPU not available, using CPU fallback');
            this._initFromMeshCPU(mesh);
            return false;
        }

        this._initFromMesh(mesh);
        this._createDistanceConstraints();
        this._calculateRestVolume();
        this._createComputeNodes();

        this.initialized = true;
        console.log(`SoftBodySimulation initialized: ${this.vertexCount} vertices, ${this.distanceConstraints.length} constraints`);
        return true;
    }

    /**
     * Initialize buffers from mesh
     * @private
     */
    _initFromMesh(mesh) {
        this._originalGeometry = mesh.geometry.clone();
        this._geometry = mesh.geometry.clone();

        const positionAttr = this._geometry.getAttribute('position');
        this.vertexCount = positionAttr.count;

        // Position buffer
        const positions = new Float32Array(positionAttr.array);
        this.positionBuffer = new THREE.StorageBufferAttribute(positions, 3);

        // Previous position buffer (for Verlet)
        this.previousPositionBuffer = new THREE.StorageBufferAttribute(
            new Float32Array(positions), 3
        );

        // Velocity buffer
        this.velocityBuffer = new THREE.StorageBufferAttribute(
            new Float32Array(this.vertexCount * 3), 3
        );

        // Mass buffer (inverse mass, 1.0 = normal, 0.0 = infinite/pinned)
        const masses = new Float32Array(this.vertexCount);
        masses.fill(1.0);
        this.massBuffer = new THREE.StorageBufferAttribute(masses, 1);

        // Create mesh with new geometry
        this._material = mesh.material.clone();
        this._mesh = new THREE.Mesh(this._geometry, this._material);
        this._mesh.position.copy(mesh.position);
        this._mesh.rotation.copy(mesh.rotation);
        this._mesh.scale.copy(mesh.scale);
    }

    /**
     * Create distance constraints from mesh edges
     * @private
     */
    _createDistanceConstraints() {
        const positions = this.positionBuffer.array;
        const index = this._geometry.getIndex();
        const edgeSet = new Set();

        // Helper to create unique edge key
        const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

        if (index) {
            // Indexed geometry
            const indices = index.array;
            for (let i = 0; i < indices.length; i += 3) {
                const i0 = indices[i];
                const i1 = indices[i + 1];
                const i2 = indices[i + 2];

                // Add edges (avoid duplicates)
                edgeSet.add(edgeKey(i0, i1));
                edgeSet.add(edgeKey(i1, i2));
                edgeSet.add(edgeKey(i2, i0));
            }
        } else {
            // Non-indexed (every 3 vertices = triangle)
            for (let i = 0; i < this.vertexCount; i += 3) {
                edgeSet.add(edgeKey(i, i + 1));
                edgeSet.add(edgeKey(i + 1, i + 2));
                edgeSet.add(edgeKey(i + 2, i));
            }
        }

        // Create constraints from edges
        for (const key of edgeSet) {
            const [i1, i2] = key.split('_').map(Number);

            const p1x = positions[i1 * 3];
            const p1y = positions[i1 * 3 + 1];
            const p1z = positions[i1 * 3 + 2];

            const p2x = positions[i2 * 3];
            const p2y = positions[i2 * 3 + 1];
            const p2z = positions[i2 * 3 + 2];

            const dx = p2x - p1x;
            const dy = p2y - p1y;
            const dz = p2z - p1z;

            const restLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

            this.distanceConstraints.push({ i1, i2, restLength });
        }
    }

    /**
     * Calculate initial volume for volume preservation
     * @private
     */
    _calculateRestVolume() {
        const positions = this.positionBuffer.array;
        const index = this._geometry.getIndex();

        if (!index) {
            this.restVolume = 1.0;
            return;
        }

        // Calculate volume using signed tetrahedron method
        // Sum of signed volumes of tetrahedra formed with origin
        let volume = 0;
        const indices = index.array;

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const v0 = new THREE.Vector3(
                positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]
            );
            const v1 = new THREE.Vector3(
                positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]
            );
            const v2 = new THREE.Vector3(
                positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]
            );

            // Signed volume of tetrahedron with origin
            volume += v0.dot(v1.clone().cross(v2)) / 6.0;
        }

        this.restVolume = Math.abs(volume);
    }

    /**
     * Create compute shader nodes
     * @private
     */
    _createComputeNodes() {
        const positionStorage = storage(this.positionBuffer, 'vec3', this.vertexCount);
        const prevPositionStorage = storage(this.previousPositionBuffer, 'vec3', this.vertexCount);
        const velocityStorage = storage(this.velocityBuffer, 'vec3', this.vertexCount);
        const massStorage = storage(this.massBuffer, 'float', this.vertexCount);

        const deltaTime = this.deltaTimeUniform;
        const gravity = this.gravityUniform;
        const damping = float(this.damping);
        const gravityScale = float(this.gravityScale);

        // Integration pass - PBD predict step
        const integrateFn = Fn(() => {
            const i = instanceIndex;

            const position = positionStorage.element(i);
            const prevPosition = prevPositionStorage.element(i);
            const velocity = velocityStorage.element(i);
            const invMass = massStorage.element(i);

            // Only move if has mass
            If(invMass.greaterThan(0.001), () => {
                // Apply gravity to velocity
                velocity.addAssign(gravity.mul(gravityScale).mul(deltaTime));

                // Damping
                velocity.mulAssign(damping);

                // Store current position
                prevPosition.assign(position);

                // Predict new position
                position.addAssign(velocity.mul(deltaTime));
            });
        });

        this.integrateNode = integrateFn().compute(this.vertexCount);
    }

    /**
     * CPU fallback initialization
     * @private
     */
    _initFromMeshCPU(mesh) {
        this._originalGeometry = mesh.geometry.clone();
        this._geometry = mesh.geometry.clone();

        const positionAttr = this._geometry.getAttribute('position');
        this.vertexCount = positionAttr.count;

        // CPU arrays
        this._cpuPositions = [];
        this._cpuPreviousPositions = [];
        this._cpuVelocities = [];
        this._cpuMasses = [];

        for (let i = 0; i < this.vertexCount; i++) {
            const pos = new THREE.Vector3(
                positionAttr.array[i * 3],
                positionAttr.array[i * 3 + 1],
                positionAttr.array[i * 3 + 2]
            );
            this._cpuPositions.push(pos.clone());
            this._cpuPreviousPositions.push(pos.clone());
            this._cpuVelocities.push(new THREE.Vector3());
            this._cpuMasses.push(1.0);
        }

        this._createDistanceConstraintsCPU();
        this._calculateRestVolumeCPU();

        this._material = mesh.material.clone();
        this._mesh = new THREE.Mesh(this._geometry, this._material);
        this._mesh.position.copy(mesh.position);
        this._mesh.rotation.copy(mesh.rotation);
        this._mesh.scale.copy(mesh.scale);

        this.initialized = true;
        console.log(`SoftBodySimulation (CPU): ${this.vertexCount} vertices`);
    }

    /**
     * Create distance constraints for CPU
     * @private
     */
    _createDistanceConstraintsCPU() {
        const index = this._geometry.getIndex();
        const edgeSet = new Set();
        const edgeKey = (a, b) => a < b ? `${a}_${b}` : `${b}_${a}`;

        if (index) {
            const indices = index.array;
            for (let i = 0; i < indices.length; i += 3) {
                edgeSet.add(edgeKey(indices[i], indices[i + 1]));
                edgeSet.add(edgeKey(indices[i + 1], indices[i + 2]));
                edgeSet.add(edgeKey(indices[i + 2], indices[i]));
            }
        }

        for (const key of edgeSet) {
            const [i1, i2] = key.split('_').map(Number);
            const restLength = this._cpuPositions[i1].distanceTo(this._cpuPositions[i2]);
            this.distanceConstraints.push({ i1, i2, restLength });
        }
    }

    /**
     * Calculate rest volume for CPU
     * @private
     */
    _calculateRestVolumeCPU() {
        const index = this._geometry.getIndex();
        if (!index) {
            this.restVolume = 1.0;
            return;
        }

        let volume = 0;
        const indices = index.array;

        for (let i = 0; i < indices.length; i += 3) {
            const v0 = this._cpuPositions[indices[i]];
            const v1 = this._cpuPositions[indices[i + 1]];
            const v2 = this._cpuPositions[indices[i + 2]];
            volume += v0.dot(v1.clone().cross(v2)) / 6.0;
        }

        this.restVolume = Math.abs(volume);
    }

    /**
     * Set vertex mass (0 = pinned/infinite)
     * @param {number} index - Vertex index
     * @param {number} inverseMass - Inverse mass (0 = pinned)
     */
    setVertexMass(index, inverseMass) {
        if (index < 0 || index >= this.vertexCount) return;

        if (this.isWebGPU && this.massBuffer) {
            this.massBuffer.array[index] = inverseMass;
            this.massBuffer.needsUpdate = true;
        } else if (this._cpuMasses) {
            this._cpuMasses[index] = inverseMass;
        }
    }

    /**
     * Pin a vertex (make immovable)
     * @param {number} index - Vertex index
     */
    pinVertex(index) {
        this.setVertexMass(index, 0);
    }

    /**
     * Unpin a vertex
     * @param {number} index - Vertex index
     */
    unpinVertex(index) {
        this.setVertexMass(index, 1.0);
    }

    /**
     * Apply an impulse at a point
     * @param {THREE.Vector3} worldPoint - Point in world space
     * @param {THREE.Vector3} direction - Impulse direction
     * @param {number} strength - Impulse strength
     * @param {number} radius - Effect radius
     */
    applyImpulse(worldPoint, direction, strength, radius = 1.0) {
        // Transform to local space
        const localPoint = worldPoint.clone();
        this._mesh.worldToLocal(localPoint);

        const positions = this.isWebGPU
            ? this.positionBuffer.array
            : null;

        for (let i = 0; i < this.vertexCount; i++) {
            let px, py, pz;

            if (this.isWebGPU) {
                px = positions[i * 3];
                py = positions[i * 3 + 1];
                pz = positions[i * 3 + 2];
            } else {
                px = this._cpuPositions[i].x;
                py = this._cpuPositions[i].y;
                pz = this._cpuPositions[i].z;
            }

            const dx = px - localPoint.x;
            const dy = py - localPoint.y;
            const dz = pz - localPoint.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < radius) {
                const falloff = 1.0 - dist / radius;
                const impulse = direction.clone().multiplyScalar(strength * falloff);

                if (this.isWebGPU) {
                    this.velocityBuffer.array[i * 3] += impulse.x;
                    this.velocityBuffer.array[i * 3 + 1] += impulse.y;
                    this.velocityBuffer.array[i * 3 + 2] += impulse.z;
                } else {
                    this._cpuVelocities[i].add(impulse);
                }
            }
        }

        if (this.isWebGPU) {
            this.velocityBuffer.needsUpdate = true;
        }
    }

    /**
     * Update simulation
     * @param {number} deltaTime
     */
    async update(deltaTime) {
        if (!this.initialized) return;

        this.deltaTimeUniform.value = Math.min(deltaTime, 0.033); // Cap at 30fps step

        if (this.isWebGPU) {
            await this._updateGPU(deltaTime);
        } else {
            this._updateCPU(deltaTime);
        }
    }

    /**
     * GPU update
     * @private
     */
    async _updateGPU(deltaTime) {
        // Integration step
        await this.renderer.computeAsync(this.integrateNode);

        // Constraint projection (hybrid CPU for now)
        this._solveConstraints();

        // Volume preservation
        if (this.pressure > 0) {
            this._preserveVolume();
        }

        // Update velocities from position changes
        this._updateVelocities(deltaTime);

        // Update mesh geometry
        this._updateMeshFromBuffer();
    }

    /**
     * Solve distance constraints
     * @private
     */
    _solveConstraints() {
        const positions = this.isWebGPU
            ? this.positionBuffer.array
            : null;
        const masses = this.isWebGPU
            ? this.massBuffer.array
            : this._cpuMasses;

        for (let iter = 0; iter < this.iterations; iter++) {
            for (const constraint of this.distanceConstraints) {
                const { i1, i2, restLength } = constraint;

                let p1x, p1y, p1z, p2x, p2y, p2z;

                if (this.isWebGPU) {
                    p1x = positions[i1 * 3];
                    p1y = positions[i1 * 3 + 1];
                    p1z = positions[i1 * 3 + 2];
                    p2x = positions[i2 * 3];
                    p2y = positions[i2 * 3 + 1];
                    p2z = positions[i2 * 3 + 2];
                } else {
                    p1x = this._cpuPositions[i1].x;
                    p1y = this._cpuPositions[i1].y;
                    p1z = this._cpuPositions[i1].z;
                    p2x = this._cpuPositions[i2].x;
                    p2y = this._cpuPositions[i2].y;
                    p2z = this._cpuPositions[i2].z;
                }

                const dx = p2x - p1x;
                const dy = p2y - p1y;
                const dz = p2z - p1z;

                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < 0.0001) continue;

                const w1 = masses[i1];
                const w2 = masses[i2];
                const totalWeight = w1 + w2;
                if (totalWeight < 0.0001) continue;

                const diff = (dist - restLength) / dist * this.stiffness;

                const correctionX = dx * diff / totalWeight;
                const correctionY = dy * diff / totalWeight;
                const correctionZ = dz * diff / totalWeight;

                if (this.isWebGPU) {
                    if (w1 > 0.0001) {
                        positions[i1 * 3] += correctionX * w1;
                        positions[i1 * 3 + 1] += correctionY * w1;
                        positions[i1 * 3 + 2] += correctionZ * w1;
                    }
                    if (w2 > 0.0001) {
                        positions[i2 * 3] -= correctionX * w2;
                        positions[i2 * 3 + 1] -= correctionY * w2;
                        positions[i2 * 3 + 2] -= correctionZ * w2;
                    }
                } else {
                    if (w1 > 0.0001) {
                        this._cpuPositions[i1].x += correctionX * w1;
                        this._cpuPositions[i1].y += correctionY * w1;
                        this._cpuPositions[i1].z += correctionZ * w1;
                    }
                    if (w2 > 0.0001) {
                        this._cpuPositions[i2].x -= correctionX * w2;
                        this._cpuPositions[i2].y -= correctionY * w2;
                        this._cpuPositions[i2].z -= correctionZ * w2;
                    }
                }
            }
        }

        if (this.isWebGPU) {
            this.positionBuffer.needsUpdate = true;
        }
    }

    /**
     * Preserve volume using pressure
     * @private
     */
    _preserveVolume() {
        // Calculate current volume
        const index = this._geometry.getIndex();
        if (!index) return;

        const positions = this.isWebGPU
            ? this.positionBuffer.array
            : null;
        const indices = index.array;

        let currentVolume = 0;
        const centroid = new THREE.Vector3();

        // Calculate centroid first
        for (let i = 0; i < this.vertexCount; i++) {
            if (this.isWebGPU) {
                centroid.x += positions[i * 3];
                centroid.y += positions[i * 3 + 1];
                centroid.z += positions[i * 3 + 2];
            } else {
                centroid.add(this._cpuPositions[i]);
            }
        }
        centroid.divideScalar(this.vertexCount);

        // Calculate volume
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            let v0, v1, v2;

            if (this.isWebGPU) {
                v0 = new THREE.Vector3(
                    positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]
                );
                v1 = new THREE.Vector3(
                    positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]
                );
                v2 = new THREE.Vector3(
                    positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]
                );
            } else {
                v0 = this._cpuPositions[i0];
                v1 = this._cpuPositions[i1];
                v2 = this._cpuPositions[i2];
            }

            currentVolume += v0.dot(v1.clone().cross(v2)) / 6.0;
        }
        currentVolume = Math.abs(currentVolume);

        // Apply pressure to restore volume
        const volumeRatio = this.restVolume / Math.max(currentVolume, 0.0001);
        const pressureScale = (volumeRatio - 1.0) * this.pressure;

        if (Math.abs(pressureScale) < 0.0001) return;

        // Push vertices outward from centroid
        const masses = this.isWebGPU ? this.massBuffer.array : this._cpuMasses;

        for (let i = 0; i < this.vertexCount; i++) {
            if (masses[i] < 0.0001) continue;

            let dir = new THREE.Vector3();

            if (this.isWebGPU) {
                dir.set(
                    positions[i * 3] - centroid.x,
                    positions[i * 3 + 1] - centroid.y,
                    positions[i * 3 + 2] - centroid.z
                );
            } else {
                dir.copy(this._cpuPositions[i]).sub(centroid);
            }

            dir.normalize().multiplyScalar(pressureScale * 0.01);

            if (this.isWebGPU) {
                positions[i * 3] += dir.x;
                positions[i * 3 + 1] += dir.y;
                positions[i * 3 + 2] += dir.z;
            } else {
                this._cpuPositions[i].add(dir);
            }
        }

        if (this.isWebGPU) {
            this.positionBuffer.needsUpdate = true;
        }
    }

    /**
     * Update velocities from position changes
     * @private
     */
    _updateVelocities(deltaTime) {
        const invDt = 1.0 / Math.max(deltaTime, 0.001);

        if (this.isWebGPU) {
            const positions = this.positionBuffer.array;
            const prevPositions = this.previousPositionBuffer.array;
            const velocities = this.velocityBuffer.array;

            for (let i = 0; i < this.vertexCount; i++) {
                velocities[i * 3] = (positions[i * 3] - prevPositions[i * 3]) * invDt;
                velocities[i * 3 + 1] = (positions[i * 3 + 1] - prevPositions[i * 3 + 1]) * invDt;
                velocities[i * 3 + 2] = (positions[i * 3 + 2] - prevPositions[i * 3 + 2]) * invDt;
            }

            this.velocityBuffer.needsUpdate = true;
        }
    }

    /**
     * Update mesh from buffer
     * @private
     */
    _updateMeshFromBuffer() {
        const meshPositions = this._geometry.attributes.position.array;
        const bufferPositions = this.positionBuffer.array;

        for (let i = 0; i < bufferPositions.length; i++) {
            meshPositions[i] = bufferPositions[i];
        }

        this._geometry.attributes.position.needsUpdate = true;
        this._geometry.computeVertexNormals();
    }

    /**
     * CPU update
     * @private
     */
    _updateCPU(deltaTime) {
        const gravity = this.gravityUniform.value.clone().multiplyScalar(this.gravityScale);

        // Integration
        for (let i = 0; i < this.vertexCount; i++) {
            if (this._cpuMasses[i] < 0.0001) continue;

            // Apply gravity
            this._cpuVelocities[i].add(gravity.clone().multiplyScalar(deltaTime));

            // Damping
            this._cpuVelocities[i].multiplyScalar(this.damping);

            // Store previous
            this._cpuPreviousPositions[i].copy(this._cpuPositions[i]);

            // Update position
            this._cpuPositions[i].add(this._cpuVelocities[i].clone().multiplyScalar(deltaTime));
        }

        // Constraints
        this._solveConstraints();

        // Volume
        if (this.pressure > 0) {
            this._preserveVolume();
        }

        // Update velocities
        const invDt = 1.0 / Math.max(deltaTime, 0.001);
        for (let i = 0; i < this.vertexCount; i++) {
            this._cpuVelocities[i].copy(this._cpuPositions[i])
                .sub(this._cpuPreviousPositions[i])
                .multiplyScalar(invDt);
        }

        // Update mesh
        const meshPositions = this._geometry.attributes.position.array;
        for (let i = 0; i < this.vertexCount; i++) {
            meshPositions[i * 3] = this._cpuPositions[i].x;
            meshPositions[i * 3 + 1] = this._cpuPositions[i].y;
            meshPositions[i * 3 + 2] = this._cpuPositions[i].z;
        }
        this._geometry.attributes.position.needsUpdate = true;
        this._geometry.computeVertexNormals();
    }

    /**
     * Get the soft body mesh
     * @returns {THREE.Mesh}
     */
    get mesh() {
        return this._mesh;
    }

    /**
     * Reset to original shape
     */
    reset() {
        const originalPositions = this._originalGeometry.attributes.position.array;

        if (this.isWebGPU) {
            this.positionBuffer.array.set(originalPositions);
            this.previousPositionBuffer.array.set(originalPositions);
            this.velocityBuffer.array.fill(0);

            this.positionBuffer.needsUpdate = true;
            this.previousPositionBuffer.needsUpdate = true;
            this.velocityBuffer.needsUpdate = true;
        } else {
            for (let i = 0; i < this.vertexCount; i++) {
                this._cpuPositions[i].set(
                    originalPositions[i * 3],
                    originalPositions[i * 3 + 1],
                    originalPositions[i * 3 + 2]
                );
                this._cpuPreviousPositions[i].copy(this._cpuPositions[i]);
                this._cpuVelocities[i].set(0, 0, 0);
            }
        }

        this._updateMeshFromBuffer();
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this._geometry) this._geometry.dispose();
        if (this._material) this._material.dispose();
        if (this._originalGeometry) this._originalGeometry.dispose();

        this.positionBuffer = null;
        this.previousPositionBuffer = null;
        this.velocityBuffer = null;
        this.massBuffer = null;

        this.distanceConstraints = [];
        this.initialized = false;
    }
}

export default SoftBodySimulation;
