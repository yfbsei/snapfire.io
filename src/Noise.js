export class Noise {
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
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0; // Fixed z component for 2D
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
