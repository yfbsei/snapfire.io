/**
 * ClothSimulation - GPU-based cloth physics using Verlet integration
 * Supports structural, shear, and bend constraints with collision detection
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
    length,
    normalize,
    clamp,
    select,
    attribute,
    max as tslMax,
    min as tslMin
} from 'three/tsl';

/**
 * ClothSimulation - GPU-accelerated cloth physics
 */
export class ClothSimulation {
    constructor(options = {}) {
        this.width = options.width || 20;          // Grid cells in X
        this.height = options.height || 20;        // Grid cells in Y
        this.restDistance = options.restDistance || 0.5; // Distance between points
        this.stiffness = options.stiffness || 0.9;       // Constraint stiffness (0-1)
        this.damping = options.damping || 0.99;          // Velocity damping
        this.iterations = options.iterations || 5;        // Constraint iterations per frame

        // Storage buffers
        this.positionBuffer = null;
        this.previousPositionBuffer = null;  // For Verlet
        this.normalBuffer = null;
        this.constraintBuffer = null;        // Stores constraint indices and rest lengths

        // Uniforms
        this.deltaTimeUniform = uniform(0.016);
        this.gravityUniform = uniform(new THREE.Vector3(0, -9.8, 0));
        this.windUniform = uniform(new THREE.Vector3(0, 0, 0));
        this.windStrengthUniform = uniform(0);

        // Pinned vertices (immovable)
        this.pinnedIndices = new Set();
        this.pinnedMask = null;  // Storage buffer for pinned state

        // Colliders
        this.sphereColliders = [];
        this.capsuleColliders = [];

        // Compute nodes
        this.integrateNode = null;
        this.constraintNode = null;
        this.normalNode = null;

        // Mesh
        this._mesh = null;
        this._geometry = null;
        this._material = null;

        // State
        this.renderer = null;
        this.isWebGPU = false;
        this.initialized = false;
        this.vertexCount = 0;
        this.constraintCount = 0;
    }

    /**
     * Initialize the cloth simulation
     * @param {THREE.Renderer} renderer
     * @returns {Promise<boolean>}
     */
    async init(renderer) {
        this.renderer = renderer;
        this.isWebGPU = renderer.isWebGPURenderer || false;

        if (!this.isWebGPU) {
            console.warn('ClothSimulation: WebGPU not available, using CPU fallback');
            this._initCPU();
            return false;
        }

        this._initBuffers();
        this._createConstraints();
        this._createComputeNodes();
        this._createMesh();

        this.initialized = true;
        console.log(`ClothSimulation initialized: ${this.width}x${this.height} grid, ${this.constraintCount} constraints`);
        return true;
    }

    /**
     * Initialize storage buffers
     * @private
     */
    _initBuffers() {
        this.vertexCount = this.width * this.height;

        // Position buffer (current positions)
        const positions = new Float32Array(this.vertexCount * 3);

        // Initialize grid positions
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                positions[idx * 3] = (x - this.width / 2) * this.restDistance;
                positions[idx * 3 + 1] = (this.height / 2 - y) * this.restDistance;
                positions[idx * 3 + 2] = 0;
            }
        }

        this.positionBuffer = new THREE.StorageBufferAttribute(
            new Float32Array(positions), 3
        );

        // Previous position buffer (for Verlet integration)
        this.previousPositionBuffer = new THREE.StorageBufferAttribute(
            new Float32Array(positions), 3
        );

        // Normal buffer
        this.normalBuffer = new THREE.StorageBufferAttribute(
            new Float32Array(this.vertexCount * 3), 3
        );

        // Pinned mask (1.0 = can move, 0.0 = pinned)
        const pinned = new Float32Array(this.vertexCount);
        pinned.fill(1.0);
        this.pinnedMask = new THREE.StorageBufferAttribute(pinned, 1);
    }

    /**
     * Create constraint data
     * @private  
     */
    _createConstraints() {
        const constraints = [];

        // Helper to add constraint
        const addConstraint = (i1, i2, restLength) => {
            constraints.push({ i1, i2, restLength });
        };

        const diagonal = Math.sqrt(2) * this.restDistance;
        const skipOne = this.restDistance * 2;
        const skipDiagonal = Math.sqrt(2) * skipOne;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;

                // Structural constraints (horizontal and vertical)
                if (x < this.width - 1) {
                    addConstraint(idx, idx + 1, this.restDistance);
                }
                if (y < this.height - 1) {
                    addConstraint(idx, idx + this.width, this.restDistance);
                }

                // Shear constraints (diagonals)
                if (x < this.width - 1 && y < this.height - 1) {
                    addConstraint(idx, idx + this.width + 1, diagonal);
                }
                if (x > 0 && y < this.height - 1) {
                    addConstraint(idx, idx + this.width - 1, diagonal);
                }

                // Bend constraints (skip one)
                if (x < this.width - 2) {
                    addConstraint(idx, idx + 2, skipOne);
                }
                if (y < this.height - 2) {
                    addConstraint(idx, idx + this.width * 2, skipOne);
                }
            }
        }

        this.constraintCount = constraints.length;

        // Pack constraints into buffer: [i1, i2, restLength, padding]
        const constraintData = new Float32Array(this.constraintCount * 4);
        for (let i = 0; i < constraints.length; i++) {
            const c = constraints[i];
            constraintData[i * 4] = c.i1;
            constraintData[i * 4 + 1] = c.i2;
            constraintData[i * 4 + 2] = c.restLength;
            constraintData[i * 4 + 3] = 0; // padding
        }

        this.constraintBuffer = new THREE.StorageBufferAttribute(constraintData, 4);
        this._constraints = constraints; // Keep for CPU fallback
    }

    /**
     * Create compute shader nodes
     * @private
     */
    _createComputeNodes() {
        const positionStorage = storage(this.positionBuffer, 'vec3', this.vertexCount);
        const prevPositionStorage = storage(this.previousPositionBuffer, 'vec3', this.vertexCount);
        const pinnedStorage = storage(this.pinnedMask, 'float', this.vertexCount);

        const deltaTime = this.deltaTimeUniform;
        const gravity = this.gravityUniform;
        const wind = this.windUniform;
        const windStrength = this.windStrengthUniform;
        const damping = float(this.damping);

        // Integration pass - Verlet integration with forces
        const integrateFn = Fn(() => {
            const i = instanceIndex;

            const position = positionStorage.element(i);
            const prevPosition = prevPositionStorage.element(i);
            const pinned = pinnedStorage.element(i);

            // Only move if not pinned
            If(pinned.greaterThan(0.5), () => {
                // Verlet integration: x_new = x + (x - x_prev) * damping + acceleration * dt^2
                const velocity = position.sub(prevPosition).mul(damping);

                // Apply gravity
                const acceleration = gravity.clone();

                // Apply wind (simple noise-based variation)
                const windForce = wind.mul(windStrength);
                acceleration.addAssign(windForce);

                // Store previous position
                prevPosition.assign(position);

                // Update position
                position.addAssign(velocity);
                position.addAssign(acceleration.mul(deltaTime).mul(deltaTime));
            });
        });

        this.integrateNode = integrateFn().compute(this.vertexCount);

        // Constraint satisfaction is done on CPU for now
        // GPU constraint solving requires careful synchronization
    }

    /**
     * Create cloth mesh for rendering
     * @private
     */
    _createMesh() {
        // Create indexed geometry
        this._geometry = new THREE.BufferGeometry();

        // Use storage buffer for positions
        const positionArray = this.positionBuffer.array;
        this._geometry.setAttribute('position', new THREE.BufferAttribute(
            new Float32Array(positionArray), 3
        ));

        // Create indices for triangles
        const indices = [];
        for (let y = 0; y < this.height - 1; y++) {
            for (let x = 0; x < this.width - 1; x++) {
                const i = y * this.width + x;

                // Two triangles per quad
                indices.push(i, i + this.width, i + 1);
                indices.push(i + 1, i + this.width, i + this.width + 1);
            }
        }
        this._geometry.setIndex(indices);

        // UVs
        const uvs = new Float32Array(this.vertexCount * 2);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                uvs[idx * 2] = x / (this.width - 1);
                uvs[idx * 2 + 1] = 1 - y / (this.height - 1);
            }
        }
        this._geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        // Normals (will be updated each frame)
        this._geometry.computeVertexNormals();

        // Material
        this._material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            wireframe: false
        });

        this._mesh = new THREE.Mesh(this._geometry, this._material);
    }

    /**
     * CPU fallback initialization
     * @private
     */
    _initCPU() {
        this.vertexCount = this.width * this.height;

        // CPU particle data
        this._cpuPositions = [];
        this._cpuPreviousPositions = [];
        this._cpuPinned = [];

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const pos = new THREE.Vector3(
                    (x - this.width / 2) * this.restDistance,
                    (this.height / 2 - y) * this.restDistance,
                    0
                );
                this._cpuPositions.push(pos.clone());
                this._cpuPreviousPositions.push(pos.clone());
                this._cpuPinned.push(true); // All can move by default
            }
        }

        this._createConstraints();

        // Create mesh
        this._geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.vertexCount * 3);
        for (let i = 0; i < this.vertexCount; i++) {
            positions[i * 3] = this._cpuPositions[i].x;
            positions[i * 3 + 1] = this._cpuPositions[i].y;
            positions[i * 3 + 2] = this._cpuPositions[i].z;
        }
        this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Create indices
        const indices = [];
        for (let y = 0; y < this.height - 1; y++) {
            for (let x = 0; x < this.width - 1; x++) {
                const i = y * this.width + x;
                indices.push(i, i + this.width, i + 1);
                indices.push(i + 1, i + this.width, i + this.width + 1);
            }
        }
        this._geometry.setIndex(indices);

        // UVs
        const uvs = new Float32Array(this.vertexCount * 2);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                uvs[idx * 2] = x / (this.width - 1);
                uvs[idx * 2 + 1] = 1 - y / (this.height - 1);
            }
        }
        this._geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        this._geometry.computeVertexNormals();

        this._material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        this._mesh = new THREE.Mesh(this._geometry, this._material);
        this.initialized = true;

        console.log(`ClothSimulation (CPU fallback): ${this.width}x${this.height} grid`);
    }

    /**
     * Pin a vertex (make it immovable)
     * @param {number} index - Vertex index
     */
    pinVertex(index) {
        if (index < 0 || index >= this.vertexCount) return;

        this.pinnedIndices.add(index);

        if (this.isWebGPU && this.pinnedMask) {
            this.pinnedMask.array[index] = 0.0;
            this.pinnedMask.needsUpdate = true;
        } else if (this._cpuPinned) {
            this._cpuPinned[index] = false;
        }
    }

    /**
     * Pin a vertex by grid coordinates
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    pinVertexAt(x, y) {
        const index = y * this.width + x;
        this.pinVertex(index);
    }

    /**
     * Unpin a vertex
     * @param {number} index - Vertex index
     */
    unpinVertex(index) {
        this.pinnedIndices.delete(index);

        if (this.isWebGPU && this.pinnedMask) {
            this.pinnedMask.array[index] = 1.0;
            this.pinnedMask.needsUpdate = true;
        } else if (this._cpuPinned) {
            this._cpuPinned[index] = true;
        }
    }

    /**
     * Add a sphere collider
     * @param {THREE.Vector3} position
     * @param {number} radius
     * @returns {Object} Collider handle
     */
    addSphereCollider(position, radius) {
        const collider = { position: position.clone(), radius };
        this.sphereColliders.push(collider);
        return collider;
    }

    /**
     * Set wind force
     * @param {THREE.Vector3} direction
     * @param {number} strength
     */
    setWind(direction, strength) {
        this.windUniform.value.copy(direction).normalize();
        this.windStrengthUniform.value = strength;
    }

    /**
     * Update simulation
     * @param {number} deltaTime
     */
    async update(deltaTime) {
        if (!this.initialized) return;

        this.deltaTimeUniform.value = deltaTime;

        if (this.isWebGPU) {
            await this._updateGPU(deltaTime);
        } else {
            this._updateCPU(deltaTime);
        }
    }

    /**
     * GPU update pass
     * @private
     */
    async _updateGPU(deltaTime) {
        // Run integration compute shader
        await this.renderer.computeAsync(this.integrateNode);

        // Constraint satisfaction on CPU (read back, solve, write)
        // This is a hybrid approach - full GPU would require atomic operations
        await this._solveConstraintsHybrid();

        // Handle collisions
        this._handleCollisions();

        // Update mesh geometry
        this._updateMeshFromBuffer();
    }

    /**
     * Solve constraints using hybrid GPU/CPU approach
     * @private
     */
    async _solveConstraintsHybrid() {
        // For simplicity, we solve constraints on CPU
        // A full GPU implementation would use Jacobi or Gauss-Seidel on GPU

        const positions = this.positionBuffer.array;
        const pinned = this.pinnedMask.array;

        for (let iter = 0; iter < this.iterations; iter++) {
            for (const constraint of this._constraints) {
                const { i1, i2, restLength } = constraint;

                const p1x = positions[i1 * 3];
                const p1y = positions[i1 * 3 + 1];
                const p1z = positions[i1 * 3 + 2];

                const p2x = positions[i2 * 3];
                const p2y = positions[i2 * 3 + 1];
                const p2z = positions[i2 * 3 + 2];

                const dx = p2x - p1x;
                const dy = p2y - p1y;
                const dz = p2z - p1z;

                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (dist < 0.0001) continue;

                const diff = (restLength - dist) / dist * this.stiffness;

                const offsetX = dx * diff * 0.5;
                const offsetY = dy * diff * 0.5;
                const offsetZ = dz * diff * 0.5;

                // Move both points if not pinned
                if (pinned[i1] > 0.5) {
                    positions[i1 * 3] -= offsetX;
                    positions[i1 * 3 + 1] -= offsetY;
                    positions[i1 * 3 + 2] -= offsetZ;
                }

                if (pinned[i2] > 0.5) {
                    positions[i2 * 3] += offsetX;
                    positions[i2 * 3 + 1] += offsetY;
                    positions[i2 * 3 + 2] += offsetZ;
                }
            }
        }

        this.positionBuffer.needsUpdate = true;
    }

    /**
     * Handle collisions with colliders
     * @private
     */
    _handleCollisions() {
        const positions = this.isWebGPU
            ? this.positionBuffer.array
            : this._geometry.attributes.position.array;
        const pinned = this.isWebGPU
            ? this.pinnedMask.array
            : this._cpuPinned;

        for (let i = 0; i < this.vertexCount; i++) {
            if ((this.isWebGPU && pinned[i] < 0.5) || (!this.isWebGPU && !pinned[i])) continue;

            const px = positions[i * 3];
            const py = positions[i * 3 + 1];
            const pz = positions[i * 3 + 2];

            // Check sphere colliders
            for (const sphere of this.sphereColliders) {
                const dx = px - sphere.position.x;
                const dy = py - sphere.position.y;
                const dz = pz - sphere.position.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (dist < sphere.radius) {
                    // Push out of sphere
                    const factor = sphere.radius / dist;
                    positions[i * 3] = sphere.position.x + dx * factor;
                    positions[i * 3 + 1] = sphere.position.y + dy * factor;
                    positions[i * 3 + 2] = sphere.position.z + dz * factor;
                }
            }
        }

        if (this.isWebGPU) {
            this.positionBuffer.needsUpdate = true;
        }
    }

    /**
     * Update mesh from position buffer
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
        const gravity = this.gravityUniform.value;
        const wind = this.windUniform.value.clone().multiplyScalar(this.windStrengthUniform.value);
        const dt2 = deltaTime * deltaTime;

        // Verlet integration
        for (let i = 0; i < this.vertexCount; i++) {
            if (!this._cpuPinned[i]) continue;

            const pos = this._cpuPositions[i];
            const prev = this._cpuPreviousPositions[i];

            const velocity = pos.clone().sub(prev).multiplyScalar(this.damping);
            const acceleration = gravity.clone().add(wind);

            prev.copy(pos);
            pos.add(velocity);
            pos.add(acceleration.multiplyScalar(dt2));
        }

        // Constraint satisfaction
        for (let iter = 0; iter < this.iterations; iter++) {
            for (const constraint of this._constraints) {
                const { i1, i2, restLength } = constraint;

                const p1 = this._cpuPositions[i1];
                const p2 = this._cpuPositions[i2];

                const delta = p2.clone().sub(p1);
                const dist = delta.length();
                if (dist < 0.0001) continue;

                const diff = (restLength - dist) / dist * this.stiffness;
                const offset = delta.multiplyScalar(diff * 0.5);

                if (this._cpuPinned[i1]) p1.sub(offset);
                if (this._cpuPinned[i2]) p2.add(offset);
            }
        }

        // Handle collisions
        this._handleCollisions();

        // Update mesh
        const positions = this._geometry.attributes.position.array;
        for (let i = 0; i < this.vertexCount; i++) {
            positions[i * 3] = this._cpuPositions[i].x;
            positions[i * 3 + 1] = this._cpuPositions[i].y;
            positions[i * 3 + 2] = this._cpuPositions[i].z;
        }
        this._geometry.attributes.position.needsUpdate = true;
        this._geometry.computeVertexNormals();
    }

    /**
     * Get the cloth mesh
     * @returns {THREE.Mesh}
     */
    get mesh() {
        return this._mesh;
    }

    /**
     * Get the geometry
     * @returns {THREE.BufferGeometry}
     */
    get geometry() {
        return this._geometry;
    }

    /**
     * Set material
     * @param {THREE.Material} material
     */
    set material(material) {
        this._material = material;
        if (this._mesh) this._mesh.material = material;
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this._geometry) this._geometry.dispose();
        if (this._material) this._material.dispose();

        this.positionBuffer = null;
        this.previousPositionBuffer = null;
        this.normalBuffer = null;
        this.constraintBuffer = null;
        this.pinnedMask = null;

        this.sphereColliders = [];
        this.capsuleColliders = [];
        this.initialized = false;
    }
}

export default ClothSimulation;
