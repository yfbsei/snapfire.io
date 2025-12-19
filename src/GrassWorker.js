/**
 * GrassWorker - Offloads grass point generation to a separate thread
 * Receives chunk generation requests and returns point position buffers
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
 * Generate grass point positions for a chunk
 * @param {number} x - Chunk center X position
 * @param {number} z - Chunk center Z position
 * @param {number} size - Chunk size
 * @param {number} density - Number of points to generate
 * @returns {Float32Array} - Point positions (x, y, z interleaved)
 */
function generateGrassPoints(x, z, size, density) {
    const positions = new Float32Array(density * 3);

    // Simple LCG for seeded random (deterministic per chunk)
    let seed = Math.abs(x * 73856093 ^ z * 19349663) % 2147483647;
    const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < density; i++) {
        const rx = (random() - 0.5) * size;
        const rz = (random() - 0.5) * size;
        const wx = rx + x;
        const wz = rz + z;
        const wy = noise.getNoise(wx, wz, 4, 0.5, 0.005) * 50;

        positions[i * 3] = wx;
        positions[i * 3 + 1] = wy + 0.3;
        positions[i * 3 + 2] = wz;
    }

    return positions;
}

// Handle messages from main thread
self.onmessage = function (e) {
    const { type, id, x, z, size, density, seed } = e.data;

    if (type === 'init') {
        // Initialize noise with the given seed
        noise = new Noise(seed);
        self.postMessage({ type: 'ready' });
        return;
    }

    if (type === 'generate') {
        const positions = generateGrassPoints(x, z, size, density);

        // Send back with transferable buffers (zero-copy)
        self.postMessage({
            type: 'result',
            id,
            x,
            z,
            positions
        }, [positions.buffer]);
    }
};
