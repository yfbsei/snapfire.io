/**
 * Water Configuration Types and Defaults
 * 
 * Configuration interface for water rendering including
 * dimensions, positioning, and visual properties.
 */

import { Vector3 } from '@babylonjs/core/Maths/math';

export interface WaterConfig {
    /** Width of water plane in world units */
    width: number;
    /** Depth of water plane in world units */
    depth: number;
    /** Number of subdivisions for wave mesh detail */
    subdivisions: number;
    /** Y position of water surface (Global fallback) */
    waterLevel: number;
    /** Minimum scale for procedural ponds */
    pondMinScale: number;
    /** Maximum scale for procedural lakes */
    pondMaxScale: number;
    /** Ratio of hole depth to fill (0.0 - 1.0) */
    waterFillRatio: number;
    /** Path to GLTF water model */
    gltfPath: string;
    /** Animation playback speed multiplier */
    animationSpeed: number;
    /** Use GLTF animated water instead of WaterMaterial-only approach */
    useGLTFWater: boolean;
    /** Rotation to apply to the GLTF model (Euler angles) */
    gltfRotation: Vector3;
    /** Base size of the water mesh in the GLTF file (used for scaling) */
    gltfBaseSize: number;
}

/**
 * Default water configuration for a realistic lake/ocean look
 */
export const defaultWaterConfig: WaterConfig = {
    width: 2000,
    depth: 2000,
    subdivisions: 32,
    waterLevel: 20,
    pondMinScale: 0.8, // Slightly larger minimum
    pondMaxScale: 4.0, // Larger max scale for big lakes
    waterFillRatio: 0.9, // Fill 90%
    useGLTFWater: true,
    gltfRotation: new Vector3(0, 0, 0),
    gltfBaseSize: 1.0, // Pivot is likely center, assume 1 unit base or adjust dynamically
    gltfPath: '/assets/water/water.glb',
    animationSpeed: 0.5, // Slower for realism
};
