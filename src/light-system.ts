// Photorealistic Lighting System
import { Scene } from '@babylonjs/core/scene';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';

export interface LightConfig {
    // Sun (Directional Light)
    sunDirection: Vector3;
    sunIntensity: number;
    sunColor: Color3;

    // Enhanced shadow properties
    shadowIntensity?: number;       // How dark shadows are (0-1)
    shadowDarkness?: number;        // Shadow darkness multiplier
}

export class LightSystem {
    private scene: Scene;
    private sunLight: DirectionalLight | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * Setup photorealistic lighting with enhanced sun light
     */
    setupLights(config: LightConfig): DirectionalLight {
        console.log('☀️ Setting up photorealistic sunlight...');

        // Create directional sun light
        this.sunLight = new DirectionalLight(
            'sunLight',
            config.sunDirection,
            this.scene
        );

        // Enhanced sun light properties for realism
        this.sunLight.intensity = config.sunIntensity;
        this.sunLight.diffuse = config.sunColor;

        // Enhanced specular for realistic highlights (30% of diffuse color)
        this.sunLight.specular = config.sunColor.scale(0.3);

        // Position the light for optimal shadow coverage
        // The position doesn't affect directional light direction, but is used for shadow camera
        this.sunLight.position = config.sunDirection.scale(-1000);

        // Enhanced shadow-specific configuration for realism
        this.sunLight.shadowMinZ = 0.5;
        this.sunLight.shadowMaxZ = 4000;
        this.sunLight.autoUpdateExtends = true;
        this.sunLight.autoCalcShadowZBounds = true;

        // Shadow intensity and darkness for more dramatic shadows
        if (config.shadowIntensity !== undefined) {
            this.sunLight.shadowEnabled = true;
        }

        console.log('✅ Enhanced sunlight configured:');
        console.log(`   - Sun Direction: ${config.sunDirection.toString()}`);
        console.log(`   - Sun Intensity: ${config.sunIntensity}`);
        console.log(`   - Specular: 30% (enhanced for realism)`);
        console.log(`   - Shadow Range: ${this.sunLight.shadowMinZ} to ${this.sunLight.shadowMaxZ}`);

        return this.sunLight;
    }

    /**
     * Get the main sun light
     */
    getSunLight(): DirectionalLight | null {
        return this.sunLight;
    }

    /**
     * Update sun direction (e.g., for time of day changes)
     */
    setSunDirection(direction: Vector3): void {
        if (this.sunLight) {
            this.sunLight.direction = direction;
            this.sunLight.position = direction.scale(-1000);
        }
    }

    /**
     * Update sun intensity
     */
    setSunIntensity(intensity: number): void {
        if (this.sunLight) {
            this.sunLight.intensity = intensity;
        }
    }

    /**
     * Update sun color (e.g., for different times of day)
     */
    setSunColor(color: Color3): void {
        if (this.sunLight) {
            this.sunLight.diffuse = color;
            this.sunLight.specular = color.scale(0.3); // 30% specular for realism
        }
    }

    /**
     * Preset: Noon sun (overhead, intense, sharp shadows)
     * Color Temperature: ~5500K (daylight white)
     */
    setNoonPreset(): void {
        this.setSunDirection(new Vector3(0.2, -1, 0.3));
        this.setSunIntensity(3.5); // Increased for dramatic shadows
        this.setSunColor(new Color3(1.0, 0.98, 0.95)); // Pure daylight white
    }

    /**
     * Preset: Morning sun (low angle, warm, long shadows)
     * Color Temperature: ~4000K (warm sunrise)
     */
    setMorningPreset(): void {
        this.setSunDirection(new Vector3(1, -0.4, 0.2));
        this.setSunIntensity(2.8); // Strong for long dramatic shadows
        this.setSunColor(new Color3(1.0, 0.85, 0.65)); // Warm peachy-orange
    }

    /**
     * Preset: Evening sun (low angle, golden hour, dramatic)
     * Color Temperature: ~3500K (golden hour)
     */
    setEveningPreset(): void {
        this.setSunDirection(new Vector3(1, -0.25, 0.4));
        this.setSunIntensity(2.2); // Lower but still strong for golden light
        this.setSunColor(new Color3(1.0, 0.65, 0.4)); // Deep golden orange
    }

    /**
     * Preset: Overcast day (diffused sun, soft shadows)
     * Color Temperature: ~6500K (cool overcast)
     */
    setOvercastPreset(): void {
        this.setSunDirection(new Vector3(0.3, -1, 0.2));
        this.setSunIntensity(1.2); // Increased from 0.9 for better visibility
        this.setSunColor(new Color3(0.88, 0.90, 0.95)); // Cool blue-grey overcast
    }

    dispose(): void {
        if (this.sunLight) {
            this.sunLight.dispose();
            this.sunLight = null;
        }
    }
}

// Default photorealistic light configuration - Overcast day
// HDRI provides all ambient lighting, sun provides direct light and shadows
export const DEFAULT_LIGHT_CONFIG: LightConfig = {
    // Overcast sun - diffused through clouds
    sunDirection: new Vector3(0.3, -1, 0.2),
    sunIntensity: 1.2,  // Increased for better contrast without ambient light
    sunColor: new Color3(0.88, 0.90, 0.95), // Cool blue-grey for overcast (6500K)
};
