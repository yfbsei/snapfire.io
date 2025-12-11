import { Scene, Texture, DynamicTexture, GroundMesh, Vector3 } from '@babylonjs/core';

/**
 * Configuration for splatmap generation based on terrain features
 */
interface SplatmapConfig {
    /** Slope angle threshold (degrees) for steep terrain (red channel) */
    steepSlopeMin: number;
    /** Slope angle threshold (degrees) for medium slopes (green channel) */
    mediumSlopeMin: number;
    /** Slope angle threshold (degrees) for flat (blue channel) */
    flatSlopeMax: number;
    /** Noise scale for variation */
    noiseScale: number;
    /** Splatmap texture resolution */
    resolution: number;
}

/**
 * Generates a procedural RGB splatmap texture for terrain blending
 * - Red channel: Flat areas (Forest Leaves)
 * - Green channel: Steep slopes (Mud Forest)
 * - Blue channel: Medium slopes (Forest Ground)
 */
export class TerrainSplatmapGenerator {
    private config: SplatmapConfig = {
        steepSlopeMin: 30.0,    // Lowered from 45° - more green (more area counts as steep)
        mediumSlopeMin: 5.0,    // Lowered - adjust blue range
        flatSlopeMax: 5.0,      // Lowered from 15° - less red (less area counts as flat)
        noiseScale: 0.1,        // Noise variation
        resolution: 1024        // Splatmap size
    };

    constructor(private scene: Scene) { }

    /**
     * Generate splatmap texture from terrain mesh
     */
    generateSplatmap(terrain: GroundMesh): Texture {
        const resolution = this.config.resolution;

        // Create dynamic texture for splatmap
        const splatmap = new DynamicTexture(
            'terrainSplatmap',
            { width: resolution, height: resolution },
            this.scene,
            false
        );

        const context = splatmap.getContext();
        const imageData = context.getImageData(0, 0, resolution, resolution);

        // Get terrain data
        const positions = terrain.getVerticesData('position');
        const normals = terrain.getVerticesData('normal');
        const subdivisions = terrain.subdivisions;

        if (!positions || !normals) {
            console.error('Terrain mesh missing position or normal data');
            return splatmap;
        }

        // Generate splatmap pixel by pixel
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                // Map pixel to terrain coordinates (0-1 range)
                const u = x / resolution;
                const v = y / resolution;

                // Get terrain slope at this UV coordinate
                const slope = this.getTerrainSlope(u, v, positions, normals, subdivisions);

                // Add some procedural noise for variation
                const noise = this.simpleNoise(u * this.config.noiseScale, v * this.config.noiseScale);

                // Calculate RGB blend weights based on slope
                const weights = this.calculateBlendWeights(slope, noise);

                // Set pixel color (RGB = blend weights, A = 1)
                const pixelIndex = (y * resolution + x) * 4;
                imageData.data[pixelIndex + 0] = Math.floor(weights.r * 255); // Red: Mud Forest
                imageData.data[pixelIndex + 1] = Math.floor(weights.g * 255); // Green: Forest Ground
                imageData.data[pixelIndex + 2] = Math.floor(weights.b * 255); // Blue: Forest Leaves
                imageData.data[pixelIndex + 3] = 255; // Alpha
            }
        }

        // Update texture with generated data
        context.putImageData(imageData, 0, 0);
        splatmap.update();

        console.log('✅ Generated terrain splatmap texture');
        console.log(`   - Resolution: ${resolution}x${resolution}`);
        console.log(`   - Green: Mud Forest (steep >${this.config.steepSlopeMin}°)`);
        console.log(`   - Blue: Forest Ground (medium ${this.config.mediumSlopeMin}-${this.config.steepSlopeMin}°)`);
        console.log(`   - Red: Forest Leaves (flat <${this.config.flatSlopeMax}°)`);

        return splatmap;
    }

    /**
     * Get terrain slope at UV coordinates by sampling normals
     */
    private getTerrainSlope(
        u: number,
        v: number,
        positions: Float32Array | number[],
        normals: Float32Array | number[],
        subdivisions: number
    ): number {
        // Map UV to vertex grid indices
        const gridX = Math.floor(u * subdivisions);
        const gridY = Math.floor(v * subdivisions);

        // Calculate vertex index (grid is subdivisions+1 x subdivisions+1)
        const vertexIndex = (gridY * (subdivisions + 1) + gridX) * 3;

        // Safely access normal data
        if (vertexIndex + 2 >= normals.length) {
            return 0; // Default to flat if out of bounds
        }

        // Get normal at this vertex
        const nx = normals[vertexIndex];
        const ny = normals[vertexIndex + 1];
        const nz = normals[vertexIndex + 2];

        // Calculate angle from up vector (0, 1, 0)
        // slope = acos(dot(normal, up)) in radians
        const slopeDot = ny; // dot product with (0,1,0) is just the Y component
        const slopeRadians = Math.acos(Math.max(-1, Math.min(1, slopeDot)));
        const slopeDegrees = (slopeRadians * 180) / Math.PI;

        return slopeDegrees;
    }

    /**
     * Calculate RGB blend weights based on slope angle
     */
    private calculateBlendWeights(
        slope: number,
        noise: number
    ): { r: number; g: number; b: number } {
        let red = 0;   // Forest Leaves (flat)
        let green = 0; // Mud Forest (steep slopes)
        let blue = 0;  // Forest Ground (medium slopes)

        // Add subtle noise variation
        const slopeWithNoise = slope + noise * 3;

        if (slopeWithNoise >= this.config.steepSlopeMin) {
            // Steep slopes = Mud Forest (green channel)
            green = 1.0;
        } else if (slopeWithNoise <= this.config.flatSlopeMax) {
            // Flat areas = Forest Leaves (red channel)
            red = 1.0;
        } else {
            // Medium slopes = Forest Ground (blue channel)
            // Blend between flat and steep
            const blendRange = this.config.steepSlopeMin - this.config.flatSlopeMax;
            const blendFactor = (slopeWithNoise - this.config.flatSlopeMax) / blendRange;

            blue = 1.0;

            // Smooth transitions at edges
            if (blendFactor < 0.2) {
                // Near flat - blend with red
                red = 1.0 - (blendFactor / 0.2);
                blue = blendFactor / 0.2;
            } else if (blendFactor > 0.8) {
                // Near steep - blend with green
                green = (blendFactor - 0.8) / 0.2;
                blue = 1.0 - green;
            }
        }

        // Normalize to ensure sum = 1
        const sum = red + green + blue;
        if (sum > 0) {
            red /= sum;
            green /= sum;
            blue /= sum;
        }

        return { r: red, g: green, b: blue };
    }

    /**
     * Simple 2D noise function for variation
     */
    private simpleNoise(x: number, y: number): number {
        // Simple hash-based noise (not perfect but fast)
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }
}