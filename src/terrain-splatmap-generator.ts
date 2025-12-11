import { Scene, Texture, DynamicTexture, GroundMesh, Vector3 } from '@babylonjs/core';

/**
 * Configuration for splatmap generation based on terrain features
 */
interface SplatmapConfig {
    /** Slope angle threshold (degrees) for rocky terrain (red channel) */
    rockySlopeMin: number;
    /** Slope angle threshold (degrees) for grass/dirt (green channel) */
    grassSlopeMax: number;
    /** Noise scale for variation */
    noiseScale: number;
    /** Splatmap texture resolution */
    resolution: number;
}

/**
 * Generates a procedural RGB splatmap texture for terrain blending
 * - Red channel: Steep slopes (rocky terrain)
 * - Green channel: Medium slopes (grass/dirt)
 * - Blue channel: Flat areas (forest floor)
 */
export class TerrainSplatmapGenerator {
    private config: SplatmapConfig = {
        rockySlopeMin: 30,      // Lowered from 35 - Slopes steeper than 30° = rocky
        grassSlopeMax: 15,      // Lowered from 25 - Slopes flatter than 15° = grass
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
        const width = terrain._width;
        const height = terrain._height;

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
                imageData.data[pixelIndex + 0] = Math.floor(weights.r * 255); // Red: Rocky
                imageData.data[pixelIndex + 1] = Math.floor(weights.g * 255); // Green: Grass
                imageData.data[pixelIndex + 2] = Math.floor(weights.b * 255); // Blue: Forest
                imageData.data[pixelIndex + 3] = 255; // Alpha
            }
        }

        // Update texture with generated data
        context.putImageData(imageData, 0, 0);
        splatmap.update();

        console.log('✅ Generated terrain splatmap texture');
        console.log(`   - Resolution: ${resolution}x${resolution}`);
        console.log(`   - Red: Rocky slopes (>${this.config.rockySlopeMin}°)`);
        console.log(`   - Green: Grass slopes (<${this.config.grassSlopeMax}°)`);
        console.log(`   - Blue: Flat forest floor`);

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
        let red = 0;   // Rocky (steep slopes)
        let green = 0; // Grass (medium slopes)
        let blue = 0;  // Forest floor (flat)

        // Add subtle noise variation
        const slopeWithNoise = slope + noise * 5;

        if (slopeWithNoise >= this.config.rockySlopeMin) {
            // Steep slopes = rocky terrain (red channel)
            red = 1.0;
        } else if (slopeWithNoise <= this.config.grassSlopeMax) {
            // Flat areas = forest floor (blue channel)
            blue = 1.0;
        } else {
            // Medium slopes = grass/dirt (green channel)
            // Blend between grass and other textures
            const blendRange = this.config.rockySlopeMin - this.config.grassSlopeMax;
            const blendFactor = (slopeWithNoise - this.config.grassSlopeMax) / blendRange;

            green = 1.0 - blendFactor;
            red = blendFactor;
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
