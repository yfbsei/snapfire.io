import * as THREE from 'three';

/**
 * SpatialIndex - Octree-based spatial partitioning for efficient queries
 * Essential for open-world games with thousands of objects
 */
export class SpatialIndex {
    constructor(bounds, maxDepth = 8, maxObjectsPerNode = 8) {
        this.root = new OctreeNode(bounds, 0, maxDepth, maxObjectsPerNode);
        this.objectToNode = new Map(); // Object UUID -> Node reference
        this.maxDepth = maxDepth;
        this.maxObjectsPerNode = maxObjectsPerNode;

        // Reusable objects for queries
        this._frustum = new THREE.Frustum();
        this._matrix = new THREE.Matrix4();
        this._sphere = new THREE.Sphere();
        this._box = new THREE.Box3();
    }

    /**
     * Insert an object into the spatial index
     * @param {THREE.Object3D} object 
     */
    insert(object) {
        const bounds = this._getObjectBounds(object);
        if (!bounds) return false;

        const node = this.root.insert(object, bounds);
        if (node) {
            this.objectToNode.set(object.uuid, node);
            return true;
        }
        return false;
    }

    /**
     * Remove an object from the spatial index
     * @param {THREE.Object3D} object 
     */
    remove(object) {
        const node = this.objectToNode.get(object.uuid);
        if (node) {
            node.remove(object);
            this.objectToNode.delete(object.uuid);
            return true;
        }
        return false;
    }

    /**
     * Update an object's position in the index
     * @param {THREE.Object3D} object 
     */
    update(object) {
        this.remove(object);
        this.insert(object);
    }

    /**
     * Query objects within camera frustum
     * @param {THREE.Camera} camera 
     * @returns {THREE.Object3D[]}
     */
    queryFrustum(camera) {
        this._matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._matrix);

        const results = [];
        this.root.queryFrustum(this._frustum, results);
        return results;
    }

    /**
     * Query objects within a sphere
     * @param {THREE.Vector3} center 
     * @param {number} radius 
     * @returns {THREE.Object3D[]}
     */
    querySphere(center, radius) {
        this._sphere.set(center, radius);
        const results = [];
        this.root.querySphere(this._sphere, results);
        return results;
    }

    /**
     * Query objects within a box
     * @param {THREE.Box3} box 
     * @returns {THREE.Object3D[]}
     */
    queryBox(box) {
        const results = [];
        this.root.queryBox(box, results);
        return results;
    }

    /**
     * Perform raycast against indexed objects
     * @param {THREE.Raycaster} raycaster 
     * @returns {THREE.Object3D[]}
     */
    queryRay(raycaster) {
        const results = [];
        this.root.queryRay(raycaster.ray, results);
        return results;
    }

    /**
     * Get bounds for an object
     * @private
     */
    _getObjectBounds(object) {
        this._box.setFromObject(object);
        if (this._box.isEmpty()) return null;
        return this._box.clone();
    }

    /**
     * Get statistics about the spatial index
     */
    getStats() {
        return this.root.getStats();
    }

    /**
     * Rebuild the entire index
     * @param {THREE.Object3D[]} objects 
     */
    rebuild(objects) {
        this.clear();
        objects.forEach(obj => this.insert(obj));
    }

    /**
     * Clear the spatial index
     */
    clear() {
        this.root = new OctreeNode(this.root.bounds.clone(), 0, this.maxDepth, this.maxObjectsPerNode);
        this.objectToNode.clear();
    }
}

/**
 * OctreeNode - Node in the octree structure
 */
class OctreeNode {
    constructor(bounds, depth, maxDepth, maxObjects) {
        this.bounds = bounds;
        this.depth = depth;
        this.maxDepth = maxDepth;
        this.maxObjects = maxObjects;

        this.objects = []; // Objects in this node
        this.objectBounds = []; // Bounds for each object
        this.children = null; // 8 child nodes when subdivided
    }

    /**
     * Insert an object into this node or its children
     */
    insert(object, bounds) {
        // If we have children, try to insert into appropriate child
        if (this.children) {
            const childIndex = this._getChildIndex(bounds);
            if (childIndex !== -1) {
                return this.children[childIndex].insert(object, bounds);
            }
            // Object spans multiple children, store in this node
            this.objects.push(object);
            this.objectBounds.push(bounds);
            return this;
        }

        // Store in this node
        this.objects.push(object);
        this.objectBounds.push(bounds);

        // Subdivide if needed
        if (this.objects.length > this.maxObjects && this.depth < this.maxDepth) {
            this._subdivide();
        }

        return this;
    }

    /**
     * Remove an object from this node
     */
    remove(object) {
        const index = this.objects.indexOf(object);
        if (index !== -1) {
            this.objects.splice(index, 1);
            this.objectBounds.splice(index, 1);
            return true;
        }

        // Check children
        if (this.children) {
            for (const child of this.children) {
                if (child.remove(object)) return true;
            }
        }

        return false;
    }

    /**
     * Query objects within frustum
     */
    queryFrustum(frustum, results) {
        if (!frustum.intersectsBox(this.bounds)) return;

        // Add objects in this node that intersect frustum
        for (let i = 0; i < this.objects.length; i++) {
            if (frustum.intersectsBox(this.objectBounds[i])) {
                results.push(this.objects[i]);
            }
        }

        // Query children
        if (this.children) {
            for (const child of this.children) {
                child.queryFrustum(frustum, results);
            }
        }
    }

    /**
     * Query objects within sphere
     */
    querySphere(sphere, results) {
        if (!sphere.intersectsBox(this.bounds)) return;

        for (let i = 0; i < this.objects.length; i++) {
            if (sphere.intersectsBox(this.objectBounds[i])) {
                results.push(this.objects[i]);
            }
        }

        if (this.children) {
            for (const child of this.children) {
                child.querySphere(sphere, results);
            }
        }
    }

    /**
     * Query objects within box
     */
    queryBox(box, results) {
        if (!this.bounds.intersectsBox(box)) return;

        for (let i = 0; i < this.objects.length; i++) {
            if (box.intersectsBox(this.objectBounds[i])) {
                results.push(this.objects[i]);
            }
        }

        if (this.children) {
            for (const child of this.children) {
                child.queryBox(box, results);
            }
        }
    }

    /**
     * Query objects along a ray
     */
    queryRay(ray, results) {
        if (!ray.intersectsBox(this.bounds)) return;

        for (let i = 0; i < this.objects.length; i++) {
            if (ray.intersectsBox(this.objectBounds[i])) {
                results.push(this.objects[i]);
            }
        }

        if (this.children) {
            for (const child of this.children) {
                child.queryRay(ray, results);
            }
        }
    }

    /**
     * Subdivide into 8 children
     */
    _subdivide() {
        const center = this.bounds.getCenter(new THREE.Vector3());
        const min = this.bounds.min;
        const max = this.bounds.max;

        this.children = [];

        // Create 8 octants
        const octants = [
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(center.x, center.y, center.z)),
            new THREE.Box3(new THREE.Vector3(center.x, min.y, min.z), new THREE.Vector3(max.x, center.y, center.z)),
            new THREE.Box3(new THREE.Vector3(min.x, center.y, min.z), new THREE.Vector3(center.x, max.y, center.z)),
            new THREE.Box3(new THREE.Vector3(center.x, center.y, min.z), new THREE.Vector3(max.x, max.y, center.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y, center.z), new THREE.Vector3(center.x, center.y, max.z)),
            new THREE.Box3(new THREE.Vector3(center.x, min.y, center.z), new THREE.Vector3(max.x, center.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x, center.y, center.z), new THREE.Vector3(center.x, max.y, max.z)),
            new THREE.Box3(new THREE.Vector3(center.x, center.y, center.z), new THREE.Vector3(max.x, max.y, max.z))
        ];

        for (const octant of octants) {
            this.children.push(new OctreeNode(octant, this.depth + 1, this.maxDepth, this.maxObjects));
        }

        // Redistribute objects to children
        const objectsCopy = [...this.objects];
        const boundsCopy = [...this.objectBounds];
        this.objects = [];
        this.objectBounds = [];

        for (let i = 0; i < objectsCopy.length; i++) {
            const childIndex = this._getChildIndex(boundsCopy[i]);
            if (childIndex !== -1) {
                this.children[childIndex].insert(objectsCopy[i], boundsCopy[i]);
            } else {
                // Object spans multiple children, keep in this node
                this.objects.push(objectsCopy[i]);
                this.objectBounds.push(boundsCopy[i]);
            }
        }
    }

    /**
     * Get which child octant contains the bounds entirely
     * Returns -1 if bounds spans multiple octants
     */
    _getChildIndex(bounds) {
        const center = this.bounds.getCenter(new THREE.Vector3());

        // Check each axis
        const minSide = new THREE.Vector3(
            bounds.max.x <= center.x ? 0 : (bounds.min.x >= center.x ? 1 : -1),
            bounds.max.y <= center.y ? 0 : (bounds.min.y >= center.y ? 1 : -1),
            bounds.max.z <= center.z ? 0 : (bounds.min.z >= center.z ? 1 : -1)
        );

        if (minSide.x === -1 || minSide.y === -1 || minSide.z === -1) {
            return -1; // Spans multiple children
        }

        return minSide.x + minSide.y * 2 + minSide.z * 4;
    }

    /**
     * Get statistics for this node and children
     */
    getStats() {
        let stats = {
            nodes: 1,
            objects: this.objects.length,
            maxDepth: this.depth
        };

        if (this.children) {
            for (const child of this.children) {
                const childStats = child.getStats();
                stats.nodes += childStats.nodes;
                stats.objects += childStats.objects;
                stats.maxDepth = Math.max(stats.maxDepth, childStats.maxDepth);
            }
        }

        return stats;
    }
}
