/**
 * TerrainWorker - Offloads terrain noise generation to a separate thread
 * Receives chunk generation requests and returns vertex position/normal buffers
 */

// Noise class embedded in worker (workers can't share class instances)
class Noise {
    constructor(seed = Math.random()) {
        this.p = new Uint8Array(512);
        this.permutation = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = i;
        }

        // Shuffle
        let m = seed;
        const nextRand = () => {
            m = (m * 1664525 + 1013904223) % 4294967296;
            return m / 4294967296;
        };

        for (let i = 255; i > 0; i--) {
            const j = Math.floor(nextRand() * (i + 1));
            [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.p[i] = this.permutation[i & 255];
        }
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    perlin2(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        x -= Math.floor(x);
        y -= Math.floor(y);

        const u = this.fade(x);
        const v = this.fade(y);

        const a = this.p[X] + Y;
        const aa = this.p[a];
        const ab = this.p[a + 1];
        const b = this.p[X + 1] + Y;
        const ba = this.p[b];
        const bb = this.p[b + 1];

        return this.lerp(v,
            this.lerp(u, this.grad(this.p[aa], x, y, 0), this.grad(this.p[ba], x - 1, y, 0)),
            this.lerp(u, this.grad(this.p[ab], x, y - 1, 0), this.grad(this.p[bb], x - 1, y - 1, 0))
        );
    }

    getNoise(x, y, octaves = 4, persistence = 0.5, scale = 0.01) {
        let total = 0;
        let frequency = scale;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.perlin2(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }
}

let noise = null;

/**
 * Generate terrain geometry data for a chunk
 * @param {number} x - Chunk center X position
 * @param {number} z - Chunk center Z position
 * @param {number} size - Chunk size
 * @param {number} segments - Number of segments (LOD)
 * @returns {Object} - positions, normals, and bounding heights
 */
function generateChunkData(x, z, size, segments) {
    const vertexCount = (segments + 1) * (segments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    const step = size / segments;
    const halfSize = size / 2;

    let minHeight = Infinity;
    let maxHeight = -Infinity;

    // Generate positions with height from noise
    let idx = 0;
    for (let iz = 0; iz <= segments; iz++) {
        for (let ix = 0; ix <= segments; ix++) {
            const localX = ix * step - halfSize;
            const localZ = iz * step - halfSize;

            const worldX = localX + x;
            const worldZ = localZ + z;

            const height = noise.getNoise(worldX, worldZ, 4, 0.5, 0.005) * 50;

            positions[idx] = localX;      // X (local space)
            positions[idx + 1] = height;   // Y (height)
            positions[idx + 2] = localZ;   // Z (local space)

            const uvIdx = (iz * (segments + 1) + ix) * 2;
            uvs[uvIdx] = ix / segments;
            uvs[uvIdx + 1] = iz / segments;

            minHeight = Math.min(minHeight, height);
            maxHeight = Math.max(maxHeight, height);

            idx += 3;
        }
    }

    // Compute normals (same algorithm as computeVertexNormals but manual)
    // For each vertex, average the normals of surrounding faces
    const width = segments + 1;

    for (let iz = 0; iz <= segments; iz++) {
        for (let ix = 0; ix <= segments; ix++) {
            const idx = (iz * width + ix) * 3;

            // Get heights of neighboring vertices
            const getHeight = (gx, gz) => {
                const cx = Math.max(0, Math.min(segments, gx));
                const cz = Math.max(0, Math.min(segments, gz));
                return positions[(cz * width + cx) * 3 + 1];
            };

            // Central differences for gradient
            const hL = getHeight(ix - 1, iz);
            const hR = getHeight(ix + 1, iz);
            const hD = getHeight(ix, iz - 1);
            const hU = getHeight(ix, iz + 1);

            // Normal from gradient
            const nx = (hL - hR) / (2 * step);
            const nz = (hD - hU) / (2 * step);
            const ny = 1.0;

            // Normalize
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            normals[idx] = nx / len;
            normals[idx + 1] = ny / len;
            normals[idx + 2] = nz / len;
        }
    }

    // Generate indices (for reference - matches PlaneGeometry indexing)
    const indexCount = segments * segments * 6;
    const indices = new Uint32Array(indexCount);
    let iIdx = 0;
    for (let iz = 0; iz < segments; iz++) {
        for (let ix = 0; ix < segments; ix++) {
            const a = iz * width + ix;
            const b = iz * width + ix + 1;
            const c = (iz + 1) * width + ix;
            const d = (iz + 1) * width + ix + 1;

            // Two triangles per quad
            indices[iIdx++] = a;
            indices[iIdx++] = c;
            indices[iIdx++] = b;

            indices[iIdx++] = c;
            indices[iIdx++] = d;
            indices[iIdx++] = b;
        }
    }

    return {
        positions,
        normals,
        uvs,
        indices,
        minHeight,
        maxHeight
    };
}

// Handle messages from main thread
self.onmessage = function (e) {
    const { type, id, x, z, size, segments, seed } = e.data;

    if (type === 'init') {
        // Initialize noise with the given seed
        noise = new Noise(seed);
        self.postMessage({ type: 'ready' });
        return;
    }

    if (type === 'generate') {
        const data = generateChunkData(x, z, size, segments);

        // Send back with transferable buffers (zero-copy)
        self.postMessage({
            type: 'result',
            id,
            x,
            z,
            segments,
            positions: data.positions,
            normals: data.normals,
            uvs: data.uvs,
            indices: data.indices,
            minHeight: data.minHeight,
            maxHeight: data.maxHeight
        }, [
            data.positions.buffer,
            data.normals.buffer,
            data.uvs.buffer,
            data.indices.buffer
        ]);
    }
};
