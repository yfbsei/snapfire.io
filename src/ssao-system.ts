// Screen Space Ambient Occlusion (SSAO) System
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import { SSAOConfig } from './rendering-config';

export class SSAOSystem {
    private scene: Scene;
    private config: SSAOConfig;
    private ssaoPipeline: SSAO2RenderingPipeline | null = null;

    constructor(scene: Scene, config: SSAOConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup Screen Space Ambient Occlusion for photorealistic depth and contact shadows
     */
    setup(camera: Camera): SSAO2RenderingPipeline | null {
        if (!this.config.enabled) {
            console.log('⚫ SSAO disabled');
            return null;
        }

        console.log('🌑 Setting up Screen Space Ambient Occlusion...');

        // Create SSAO2 rendering pipeline (improved version with better quality)
        this.ssaoPipeline = new SSAO2RenderingPipeline(
            'ssao',
            this.scene,
            {
                ssaoRatio: this.config.ssaoRatio, // Resolution ratio (1.0 = full res)
                blurRatio: this.config.ssaoRatio, // Blur resolution ratio
            },
            [camera]
        );

        // Configure SSAO parameters for photorealistic look
        this.ssaoPipeline.samples = this.config.samples;
        this.ssaoPipeline.radius = this.config.radius;
        this.ssaoPipeline.base = this.config.base;

        // Total strength - how dark the occlusion is
        this.ssaoPipeline.totalStrength = 1.3;

        // Max Z distance for occlusion samples
        this.ssaoPipeline.maxZ = 250;

        // Min Z distance for occlusion samples
        this.ssaoPipeline.minZAspect = 0.2;

        // Bilateral blur for cleaner results
        if (this.config.bilateralBlur) {
            this.ssaoPipeline.bilateralSamples = 16;
            this.ssaoPipeline.bilateralSoften = 0.05;
            this.ssaoPipeline.bilateralTolerance = 0.0001;
        }

        // Adaptive sampling for better quality
        this.ssaoPipeline.expensiveBlur = true;

        console.log('✅ SSAO configured:');
        console.log(`   - Samples: ${this.config.samples}`);
        console.log(`   - Radius: ${this.config.radius}`);
        console.log(`   - Resolution Ratio: ${this.config.ssaoRatio}`);
        console.log(`   - Bilateral Blur: ${this.config.bilateralBlur}`);

        return this.ssaoPipeline;
    }

    /**
     * Toggle SSAO on/off at runtime
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;

        if (this.ssaoPipeline) {
            // Note: SSAO2RenderingPipeline doesn't have a simple enable/disable
            // Would need to dispose and recreate. For now, adjust strength.
            if (enabled) {
                this.ssaoPipeline.totalStrength = 1.3;
            } else {
                this.ssaoPipeline.totalStrength = 0.0;
            }
        }
    }

    /**
     * Update SSAO strength at runtime
     */
    setStrength(strength: number): void {
        if (this.ssaoPipeline) {
            this.ssaoPipeline.totalStrength = strength;
        }
    }

    /**
     * Update SSAO radius at runtime
     */
    setRadius(radius: number): void {
        if (this.ssaoPipeline) {
            this.ssaoPipeline.radius = radius;
            this.config.radius = radius;
        }
    }

    /**
     * Get the SSAO pipeline instance
     */
    getPipeline(): SSAO2RenderingPipeline | null {
        return this.ssaoPipeline;
    }

    dispose(): void {
        if (this.ssaoPipeline) {
            this.ssaoPipeline.dispose();
            this.ssaoPipeline = null;
        }
    }
}
