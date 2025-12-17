/**
 * TrailRenderer - Ribbon/trail particle system
 * Creates smooth trails following objects with configurable width and color
 */
import * as THREE from 'three';

/**
 * TrailRenderer - Renders smooth trails behind moving objects
 */
export class TrailRenderer {
    constructor(options = {}) {
        // Trail settings
        this.maxPoints = options.maxPoints ?? 100;
        this.width = options.width ?? 0.5;
        this.widthCurve = options.widthCurve ?? null; // Array of [t, width] pairs
        this.colorStart = options.colorStart ?? new THREE.Color(1, 1, 1);
        this.colorEnd = options.colorEnd ?? new THREE.Color(1, 1, 1);
        this.opacity = options.opacity ?? 1.0;
        this.fadeOut = options.fadeOut ?? true;
        this.textured = options.textured ?? false;
        this.texture = options.texture ?? null;

        // Minimum distance between points
        this.minVertexDistance = options.minVertexDistance ?? 0.1;

        // Time-based or distance-based lifetime
        this.lifetime = options.lifetime ?? 1.0; // Seconds

        // Internal state
        this.points = [];
        this.times = [];
        this.isEmitting = true;

        // Create geometry and material
        this._createGeometry();
        this._createMaterial();

        // Create mesh
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false; // Trails can extend far
        this.mesh.name = 'TrailRenderer';
    }

    _createGeometry() {
        // Create buffer geometry for ribbon
        this.geometry = new THREE.BufferGeometry();

        // Pre-allocate buffers
        const maxVertices = this.maxPoints * 2;

        this.positions = new Float32Array(maxVertices * 3);
        this.uvs = new Float32Array(maxVertices * 2);
        this.colors = new Float32Array(maxVertices * 4);
        this.indices = new Uint16Array((this.maxPoints - 1) * 6);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
        this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));

        // Generate indices (once, they don't change)
        let idx = 0;
        for (let i = 0; i < this.maxPoints - 1; i++) {
            const i0 = i * 2;
            const i1 = i * 2 + 1;
            const i2 = (i + 1) * 2;
            const i3 = (i + 1) * 2 + 1;

            // Triangle 1
            this.indices[idx++] = i0;
            this.indices[idx++] = i1;
            this.indices[idx++] = i2;

            // Triangle 2
            this.indices[idx++] = i1;
            this.indices[idx++] = i3;
            this.indices[idx++] = i2;
        }

        this.geometry.index.needsUpdate = true;
    }

    _createMaterial() {
        const materialOptions = {
            vertexColors: true,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        };

        if (this.textured && this.texture) {
            this.material = new THREE.MeshBasicMaterial({
                ...materialOptions,
                map: this.texture
            });
        } else {
            this.material = new THREE.MeshBasicMaterial(materialOptions);
        }
    }

    /**
     * Add a new point to the trail
     * @param {THREE.Vector3} position
     * @param {THREE.Vector3} up - Up direction for ribbon orientation
     */
    addPoint(position, up = null) {
        if (!this.isEmitting) return;

        // Check minimum distance
        if (this.points.length > 0) {
            const lastPoint = this.points[this.points.length - 1];
            if (position.distanceTo(lastPoint) < this.minVertexDistance) {
                return;
            }
        }

        // Add point
        this.points.push(position.clone());
        this.times.push(performance.now() / 1000);

        // Store up direction (or calculate from movement)
        if (!this._ups) this._ups = [];
        this._ups.push(up ? up.clone() : new THREE.Vector3(0, 1, 0));

        // Remove old points if over limit
        while (this.points.length > this.maxPoints) {
            this.points.shift();
            this.times.shift();
            this._ups.shift();
        }
    }

    /**
     * Update the trail mesh
     * @param {number} deltaTime
     * @param {THREE.Vector3} cameraPosition - For billboard orientation
     */
    update(deltaTime, cameraPosition = null) {
        const currentTime = performance.now() / 1000;

        // Remove expired points
        if (this.fadeOut) {
            while (this.points.length > 0 && currentTime - this.times[0] > this.lifetime) {
                this.points.shift();
                this.times.shift();
                this._ups.shift();
            }
        }

        // Update geometry
        this._updateGeometry(currentTime, cameraPosition);
    }

    _updateGeometry(currentTime, cameraPosition) {
        if (this.points.length < 2) {
            this.geometry.setDrawRange(0, 0);
            return;
        }

        const positions = this.positions;
        const uvs = this.uvs;
        const colors = this.colors;

        // Calculate direction and perpendicular for each point
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];
            const time = this.times[i];
            const up = this._ups[i];

            // Calculate t (0 = oldest, 1 = newest)
            const t = i / (this.points.length - 1);

            // Calculate age-based fade
            const age = currentTime - time;
            const ageFactor = this.fadeOut ? 1 - (age / this.lifetime) : 1;

            // Calculate width at this point
            let width = this.width;
            if (this.widthCurve) {
                width = this._sampleCurve(this.widthCurve, t) * this.width;
            } else {
                // Default: fade width with t
                width = this.width * (1 - t * 0.8);
            }

            // Calculate perpendicular direction
            let perpendicular;
            if (cameraPosition) {
                // Billboard to camera
                const toCamera = new THREE.Vector3().subVectors(cameraPosition, point).normalize();
                const forward = this._getForwardDirection(i);
                perpendicular = new THREE.Vector3().crossVectors(forward, toCamera).normalize();
            } else {
                // Use stored up direction
                const forward = this._getForwardDirection(i);
                perpendicular = new THREE.Vector3().crossVectors(forward, up).normalize();
            }

            // Calculate vertex positions (left and right of center)
            const halfWidth = width * 0.5;
            const leftPos = point.clone().add(perpendicular.clone().multiplyScalar(-halfWidth));
            const rightPos = point.clone().add(perpendicular.clone().multiplyScalar(halfWidth));

            // Write positions
            const vi = i * 2;
            positions[vi * 3 + 0] = leftPos.x;
            positions[vi * 3 + 1] = leftPos.y;
            positions[vi * 3 + 2] = leftPos.z;
            positions[(vi + 1) * 3 + 0] = rightPos.x;
            positions[(vi + 1) * 3 + 1] = rightPos.y;
            positions[(vi + 1) * 3 + 2] = rightPos.z;

            // Write UVs
            uvs[vi * 2 + 0] = 0;
            uvs[vi * 2 + 1] = t;
            uvs[(vi + 1) * 2 + 0] = 1;
            uvs[(vi + 1) * 2 + 1] = t;

            // Calculate color
            const color = new THREE.Color().lerpColors(this.colorStart, this.colorEnd, t);
            const alpha = this.opacity * ageFactor;

            // Write colors
            colors[vi * 4 + 0] = color.r;
            colors[vi * 4 + 1] = color.g;
            colors[vi * 4 + 2] = color.b;
            colors[vi * 4 + 3] = alpha;
            colors[(vi + 1) * 4 + 0] = color.r;
            colors[(vi + 1) * 4 + 1] = color.g;
            colors[(vi + 1) * 4 + 2] = color.b;
            colors[(vi + 1) * 4 + 3] = alpha;
        }

        // Update buffers
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.uv.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;

        // Set draw range
        const vertexCount = this.points.length * 2;
        const indexCount = (this.points.length - 1) * 6;
        this.geometry.setDrawRange(0, indexCount);

        // Update bounding sphere
        this.geometry.computeBoundingSphere();
    }

    _getForwardDirection(index) {
        if (this.points.length < 2) {
            return new THREE.Vector3(0, 0, 1);
        }

        if (index === 0) {
            return new THREE.Vector3().subVectors(this.points[1], this.points[0]).normalize();
        } else if (index >= this.points.length - 1) {
            return new THREE.Vector3().subVectors(
                this.points[this.points.length - 1],
                this.points[this.points.length - 2]
            ).normalize();
        } else {
            // Average of directions
            const dir1 = new THREE.Vector3().subVectors(this.points[index], this.points[index - 1]);
            const dir2 = new THREE.Vector3().subVectors(this.points[index + 1], this.points[index]);
            return dir1.add(dir2).normalize();
        }
    }

    _sampleCurve(curve, t) {
        // curve is array of [t, value] pairs
        if (!curve || curve.length === 0) return 1;
        if (curve.length === 1) return curve[0][1];

        // Find surrounding points
        for (let i = 0; i < curve.length - 1; i++) {
            if (t >= curve[i][0] && t <= curve[i + 1][0]) {
                const localT = (t - curve[i][0]) / (curve[i + 1][0] - curve[i][0]);
                return THREE.MathUtils.lerp(curve[i][1], curve[i + 1][1], localT);
            }
        }

        return curve[curve.length - 1][1];
    }

    /**
     * Start emitting trail points
     */
    startEmitting() {
        this.isEmitting = true;
    }

    /**
     * Stop emitting trail points
     */
    stopEmitting() {
        this.isEmitting = false;
    }

    /**
     * Clear all points
     */
    clear() {
        this.points = [];
        this.times = [];
        this._ups = [];
        this.geometry.setDrawRange(0, 0);
    }

    /**
     * Get the mesh for adding to scene
     * @returns {THREE.Mesh}
     */
    getMesh() {
        return this.mesh;
    }

    /**
     * Set trail color
     * @param {THREE.Color} start
     * @param {THREE.Color} end
     */
    setColor(start, end = null) {
        this.colorStart = start;
        this.colorEnd = end ?? start;
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        if (this.texture) {
            this.texture.dispose();
        }
    }
}

export default TrailRenderer;
