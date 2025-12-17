/**
 * GPUComputeManager - Core infrastructure for WebGPU compute operations
 * Manages compute pipelines, storage buffers, and shader execution
 */

// Node.js compatibility: 'self' global is required by three.webgpu.js
if (typeof self === 'undefined') {
    globalThis.self = globalThis;
}

import * as THREE from 'three';
import {
    storage,
    storageObject,
    instanceIndex,
    float,
    vec3,
    vec4,
    uniform,
    Fn,
    If
} from 'three/tsl';

/**
 * GPUComputeManager - Central manager for GPU compute operations
 */
export class GPUComputeManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.isWebGPU = renderer.isWebGPURenderer || false;
        this.buffers = new Map();
        this.computeNodes = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the compute manager
     * @returns {Promise<boolean>}
     */
    async init() {
        if (!this.isWebGPU) {
            console.warn('GPUComputeManager: WebGPU not available, compute disabled');
            this.initialized = false;
            return false;
        }

        this.initialized = true;
        console.log('GPUComputeManager initialized with WebGPU');
        return true;
    }

    /**
     * Check if GPU compute is available
     * @returns {boolean}
     */
    get available() {
        return this.initialized && this.isWebGPU;
    }

    /**
     * Create a storage buffer for compute data
     * @param {string} name - Buffer identifier
     * @param {Float32Array|Uint32Array} data - Initial data
     * @param {number} itemSize - Elements per item (e.g., 3 for vec3)
     * @returns {THREE.StorageBufferAttribute|null}
     */
    createStorageBuffer(name, data, itemSize = 1) {
        if (!this.available) return null;

        const buffer = new THREE.StorageBufferAttribute(data, itemSize);
        this.buffers.set(name, buffer);
        return buffer;
    }

    /**
     * Create an instanced storage buffer for instanced rendering
     * @param {string} name - Buffer identifier
     * @param {Float32Array|Uint32Array} data - Initial data
     * @param {number} itemSize - Elements per item
     * @returns {THREE.StorageInstancedBufferAttribute|null}
     */
    createInstancedStorageBuffer(name, data, itemSize = 1) {
        if (!this.available) return null;

        const buffer = new THREE.StorageInstancedBufferAttribute(data, itemSize);
        this.buffers.set(name, buffer);
        return buffer;
    }

    /**
     * Get a previously created buffer
     * @param {string} name - Buffer identifier
     * @returns {THREE.StorageBufferAttribute|null}
     */
    getBuffer(name) {
        return this.buffers.get(name) || null;
    }

    /**
     * Update buffer data
     * @param {string} name - Buffer identifier
     * @param {Float32Array|Uint32Array} data - New data
     */
    updateBuffer(name, data) {
        const buffer = this.buffers.get(name);
        if (buffer) {
            buffer.array.set(data);
            buffer.needsUpdate = true;
        }
    }

    /**
     * Create a compute node from a TSL function
     * @param {string} name - Compute node identifier
     * @param {Function} computeFn - TSL compute function
     * @param {number} count - Number of invocations
     * @param {number} workgroupSize - Workgroup size (default 64)
     * @returns {Object|null}
     */
    createComputeNode(name, computeFn, count, workgroupSize = 64) {
        if (!this.available) return null;

        const computeNode = computeFn.compute(count);
        this.computeNodes.set(name, computeNode);
        return computeNode;
    }

    /**
     * Execute a compute node
     * @param {string|Object} nodeOrName - Compute node or name
     * @returns {Promise<void>}
     */
    async compute(nodeOrName) {
        if (!this.available) return;

        const node = typeof nodeOrName === 'string'
            ? this.computeNodes.get(nodeOrName)
            : nodeOrName;

        if (node) {
            await this.renderer.computeAsync(node);
        }
    }

    /**
     * Read buffer data back to CPU (expensive operation!)
     * @param {string|THREE.StorageBufferAttribute} bufferOrName - Buffer or name
     * @returns {Promise<ArrayBuffer|null>}
     */
    async readback(bufferOrName) {
        if (!this.available) return null;

        const buffer = typeof bufferOrName === 'string'
            ? this.buffers.get(bufferOrName)
            : bufferOrName;

        if (!buffer) return null;

        // Use renderer's readback capability
        return await this.renderer.readBufferAsync(buffer);
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.buffers.clear();
        this.computeNodes.clear();
        this.initialized = false;
    }
}

/**
 * Helper to create common compute shader patterns
 */
export const ComputeHelpers = {
    /**
     * Create a simple position update compute function
     * @param {Object} options - { positions, velocities, deltaTime }
     * @returns {Function} TSL compute function
     */
    positionUpdate: (positionBuffer, velocityBuffer, deltaTimeUniform) => {
        return Fn(() => {
            const index = instanceIndex;
            const position = storage(positionBuffer, 'vec3', index);
            const velocity = storage(velocityBuffer, 'vec3', index);

            position.addAssign(velocity.mul(deltaTimeUniform));
        });
    },

    /**
     * Create gravity application function
     * @param {Object} options
     * @returns {Function}
     */
    applyGravity: (velocityBuffer, gravityUniform, deltaTimeUniform) => {
        return Fn(() => {
            const index = instanceIndex;
            const velocity = storage(velocityBuffer, 'vec3', index);

            velocity.addAssign(gravityUniform.mul(deltaTimeUniform));
        });
    }
};

export default GPUComputeManager;
