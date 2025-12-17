/**
 * ObjectPool - Generic object pool for reducing garbage collection
 * Critical for open-world games with many objects being created/destroyed
 */
export class ObjectPool {
    /**
     * Create an object pool
     * @param {Function} factory - Factory function to create new objects
     * @param {Function} reset - Reset function to prepare object for reuse
     * @param {number} initialSize - Initial pool size
     */
    constructor(factory, reset = null, initialSize = 10) {
        this.factory = factory;
        this.reset = reset || (() => { });
        this.pool = [];
        this.activeCount = 0;

        // Pre-warm the pool
        this.prewarm(initialSize);
    }

    /**
     * Pre-allocate objects to avoid runtime allocations
     * @param {number} count - Number of objects to pre-allocate
     */
    prewarm(count) {
        for (let i = 0; i < count; i++) {
            this.pool.push(this.factory());
        }
    }

    /**
     * Acquire an object from the pool
     * @returns {*} An object from the pool or a new one if pool is empty
     */
    acquire() {
        this.activeCount++;

        if (this.pool.length > 0) {
            return this.pool.pop();
        }

        // Pool exhausted, create new object
        return this.factory();
    }

    /**
     * Release an object back to the pool
     * @param {*} object - Object to release
     */
    release(object) {
        if (!object) return;

        this.activeCount = Math.max(0, this.activeCount - 1);

        // Reset the object state
        this.reset(object);

        // Return to pool
        this.pool.push(object);
    }

    /**
     * Release multiple objects
     * @param {Array} objects - Objects to release
     */
    releaseAll(objects) {
        objects.forEach(obj => this.release(obj));
    }

    /**
     * Get pool statistics
     * @returns {{available: number, active: number, total: number}}
     */
    getStats() {
        return {
            available: this.pool.length,
            active: this.activeCount,
            total: this.pool.length + this.activeCount
        };
    }

    /**
     * Clear the pool
     * @param {Function} dispose - Optional dispose function for cleanup
     */
    clear(dispose = null) {
        if (dispose) {
            this.pool.forEach(obj => dispose(obj));
        }
        this.pool = [];
        this.activeCount = 0;
    }

    /**
     * Shrink pool to a maximum size
     * @param {number} maxSize - Maximum pool size to maintain
     * @param {Function} dispose - Optional dispose function for cleanup
     */
    shrink(maxSize, dispose = null) {
        while (this.pool.length > maxSize) {
            const obj = this.pool.pop();
            if (dispose) dispose(obj);
        }
    }
}

/**
 * Vector3Pool - Specialized pool for THREE.Vector3 objects
 */
export class Vector3Pool extends ObjectPool {
    constructor(initialSize = 50) {
        super(
            () => ({ x: 0, y: 0, z: 0 }), // Lightweight vector
            (v) => { v.x = 0; v.y = 0; v.z = 0; },
            initialSize
        );
    }

    /**
     * Acquire a vector with initial values
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {{x: number, y: number, z: number}}
     */
    acquireWith(x = 0, y = 0, z = 0) {
        const v = this.acquire();
        v.x = x;
        v.y = y;
        v.z = z;
        return v;
    }
}

/**
 * PoolManager - Centralized pool management
 */
export class PoolManager {
    constructor() {
        this.pools = new Map();
    }

    /**
     * Register a pool
     * @param {string} name - Pool identifier
     * @param {ObjectPool} pool - Pool instance
     */
    register(name, pool) {
        this.pools.set(name, pool);
    }

    /**
     * Get a pool by name
     * @param {string} name - Pool identifier
     * @returns {ObjectPool|undefined}
     */
    get(name) {
        return this.pools.get(name);
    }

    /**
     * Get statistics for all pools
     * @returns {Object}
     */
    getAllStats() {
        const stats = {};
        this.pools.forEach((pool, name) => {
            stats[name] = pool.getStats();
        });
        return stats;
    }

    /**
     * Clear all pools
     */
    clearAll() {
        this.pools.forEach(pool => pool.clear());
    }
}

// Global pool manager instance
export const poolManager = new PoolManager();

// Pre-create common pools
export const vectorPool = new Vector3Pool(100);
poolManager.register('vector3', vectorPool);
