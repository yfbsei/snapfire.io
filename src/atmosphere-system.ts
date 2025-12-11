// Atmospheric Effects System (Fog, Aerial Perspective)
import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { AtmosphereConfig } from './rendering-config';

export class AtmosphereSystem {
    private scene: Scene;
    private config: AtmosphereConfig;

    constructor(scene: Scene, config: AtmosphereConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup atmospheric effects including fog and aerial perspective
     */
    setup(): void {
        if (!this.config.enabled) {
            console.log('⚫ Atmospheric effects disabled');
            this.scene.fogEnabled = false;
            return;
        }

        console.log('🌫️ Setting up atmospheric effects...');

        // Enable fog
        this.scene.fogEnabled = true;

        // Set fog color (should match HDRI horizon color for seamless blend)
        this.scene.fogColor = new Color3(
            this.config.fogColor.r,
            this.config.fogColor.g,
            this.config.fogColor.b
        );

        // Configure fog mode and parameters
        switch (this.config.fogMode) {
            case 'exp':
                // Exponential fog - density increases exponentially with distance
                this.scene.fogMode = Scene.FOGMODE_EXP;
                this.scene.fogDensity = this.config.fogDensity;
                break;

            case 'exp2':
                // Exponential squared fog - more realistic falloff
                this.scene.fogMode = Scene.FOGMODE_EXP2;
                this.scene.fogDensity = this.config.fogDensity;
                break;

            case 'linear':
                // Linear fog - linear interpolation between start and end
                this.scene.fogMode = Scene.FOGMODE_LINEAR;
                this.scene.fogStart = this.config.fogStart;
                this.scene.fogEnd = this.config.fogEnd;
                break;
        }

        console.log('✅ Atmospheric effects configured:');
        console.log(`   - Fog Mode: ${this.config.fogMode.toUpperCase()}`);
        console.log(`   - Fog Density: ${this.config.fogDensity}`);
        console.log(`   - Fog Color: RGB(${this.config.fogColor.r}, ${this.config.fogColor.g}, ${this.config.fogColor.b})`);
    }

    /**
     * Toggle fog on/off at runtime
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        this.scene.fogEnabled = enabled;
    }

    /**
     * Update fog density at runtime
     */
    setFogDensity(density: number): void {
        this.config.fogDensity = density;
        this.scene.fogDensity = density;
    }

    /**
     * Update fog color at runtime
     */
    setFogColor(color: Color3): void {
        this.config.fogColor = { r: color.r, g: color.g, b: color.b };
        this.scene.fogColor = color;
    }

    /**
     * Update fog mode at runtime
     */
    setFogMode(mode: 'exp' | 'exp2' | 'linear'): void {
        this.config.fogMode = mode;

        switch (mode) {
            case 'exp':
                this.scene.fogMode = Scene.FOGMODE_EXP;
                break;
            case 'exp2':
                this.scene.fogMode = Scene.FOGMODE_EXP2;
                break;
            case 'linear':
                this.scene.fogMode = Scene.FOGMODE_LINEAR;
                break;
        }
    }

    /**
     * Preset: Clear day (minimal fog)
     */
    setClearDayPreset(): void {
        this.setFogDensity(0.00005);
        this.setFogColor(new Color3(0.8, 0.85, 0.9));
    }

    /**
     * Preset: Misty morning (moderate fog)
     */
    setMistyMorningPreset(): void {
        this.setFogDensity(0.0002);
        this.setFogColor(new Color3(0.85, 0.87, 0.9));
    }

    /**
     * Preset: Dense fog
     */
    setDenseFogPreset(): void {
        this.setFogDensity(0.0005);
        this.setFogColor(new Color3(0.75, 0.77, 0.8));
    }

    dispose(): void {
        // Fog is part of scene, just disable it
        this.scene.fogEnabled = false;
    }
}
