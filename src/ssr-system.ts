// Screen Space Reflections (SSR) System
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { ScreenSpaceReflectionPostProcess } from '@babylonjs/core/PostProcesses/screenSpaceReflectionPostProcess';
import { SSRConfig } from './rendering-config';

export class SSRSystem {
    private scene: Scene;
    private config: SSRConfig;
    private ssrPostProcess: ScreenSpaceReflectionPostProcess | null = null;

    constructor(scene: Scene, config: SSRConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup Screen Space Reflections for realistic reflections on glossy surfaces
     */
    setup(camera: Camera): ScreenSpaceReflectionPostProcess | null {
        if (!this.config.enabled) {
            console.log('⚫ SSR disabled');
            return null;
        }

        console.log('💎 Setting up Screen Space Reflections...');

        // Create SSR post process
        this.ssrPostProcess = new ScreenSpaceReflectionPostProcess(
            'ssr',
            this.scene,
            1.0, // Ratio (1.0 = full resolution)
            camera
        );

        // Configure SSR parameters for high-quality reflections
        this.ssrPostProcess.samples = this.config.samples;
        this.ssrPostProcess.step = this.config.step;
        this.ssrPostProcess.strength = this.config.strength;
        this.ssrPostProcess.reflectionSpecularFalloffExponent = this.config.reflectionSpecularFalloffExponent;
        this.ssrPostProcess.threshold = this.config.threshold;
        this.ssrPostProcess.roughnessFactor = this.config.roughnessFactor;

        // Additional quality settings
        this.ssrPostProcess.enableSmoothReflections = true;
        this.ssrPostProcess.reflectionSamples = 64;
        this.ssrPostProcess.smoothSteps = 5;

        console.log('✅ SSR configured:');
        console.log(`   - Samples: ${this.config.samples}`);
        console.log(`   - Strength: ${this.config.strength}`);
        console.log(`   - Step Size: ${this.config.step}`);

        return this.ssrPostProcess;
    }

    /**
     * Toggle SSR on/off at runtime
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;

        if (this.ssrPostProcess) {
            if (enabled) {
                this.ssrPostProcess.strength = this.config.strength;
            } else {
                this.ssrPostProcess.strength = 0.0;
            }
        }
    }

    /**
     * Update SSR strength at runtime
     */
    setStrength(strength: number): void {
        if (this.ssrPostProcess) {
            this.ssrPostProcess.strength = strength;
            this.config.strength = strength;
        }
    }

    /**
     * Get the SSR post process instance
     */
    getPostProcess(): ScreenSpaceReflectionPostProcess | null {
        return this.ssrPostProcess;
    }

    dispose(): void {
        if (this.ssrPostProcess) {
            this.ssrPostProcess.dispose();
            this.ssrPostProcess = null;
        }
    }
}
