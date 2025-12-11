// Main Rendering Pipeline - Orchestrates all post-processing effects
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { PostProcessConfig } from './rendering-config';

export class RenderingPipeline {
    private scene: Scene;
    private config: PostProcessConfig;
    private pipeline: DefaultRenderingPipeline | null = null;

    constructor(scene: Scene, config: PostProcessConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup the main rendering pipeline with all post-processing effects
     */
    setup(camera: Camera): DefaultRenderingPipeline {
        console.log('🎨 Setting up Default Rendering Pipeline...');

        // Create default rendering pipeline (includes many built-in effects)
        this.pipeline = new DefaultRenderingPipeline(
            'defaultPipeline',
            this.config.toneMappingEnabled, // HDR
            this.scene,
            [camera]
        );

        // ===== TONE MAPPING & EXPOSURE =====
        this.setupToneMapping();

        // ===== VIGNETTE =====
        this.setupVignette();

        // ===== IMAGE PROCESSING =====
        this.setupImageProcessing();

        // ===== ANTI-ALIASING =====
        this.setupAntiAliasing();

        console.log('✅ Rendering pipeline configured with all effects');

        return this.pipeline;
    }

    private setupToneMapping(): void {
        if (!this.pipeline) return;

        console.log('  📷 Configuring tone mapping...');

        // Enable image processing
        this.pipeline.imageProcessingEnabled = true;

        if (this.pipeline.imageProcessing) {
            // Tone mapping type
            switch (this.config.toneMappingType) {
                case 'ACES':
                    this.pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
                    break;
                case 'Reinhard':
                    this.pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
                    break;
                case 'Photographic':
                    // Use standard tone mapping as Photographic isn't available
                    this.pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
                    break;
                case 'None':
                default:
                    this.pipeline.imageProcessing.toneMappingEnabled = false;
                    break;
            }

            // Exposure
            this.pipeline.imageProcessing.exposure = this.config.exposure;

            // Contrast
            this.pipeline.imageProcessing.contrast = this.config.contrast;

            console.log(`    - Tone Mapping: ${this.config.toneMappingType}`);
            console.log(`    - Exposure: ${this.config.exposure}`);
        }
    }

    private setupVignette(): void {
        if (!this.pipeline) return;

        console.log('  🎭 Configuring vignette...');

        if (this.pipeline.imageProcessing) {
            this.pipeline.imageProcessing.vignetteEnabled = this.config.vignetteEnabled;

            if (this.config.vignetteEnabled) {
                this.pipeline.imageProcessing.vignetteWeight = this.config.vignetteWeight;
                this.pipeline.imageProcessing.vignetteColor.r = this.config.vignetteColor.r;
                this.pipeline.imageProcessing.vignetteColor.g = this.config.vignetteColor.g;
                this.pipeline.imageProcessing.vignetteColor.b = this.config.vignetteColor.b;
                this.pipeline.imageProcessing.vignetteCameraFov = 0.5;

                console.log(`    - Weight: ${this.config.vignetteWeight}`);
            }
        }
    }

    private setupImageProcessing(): void {
        if (!this.pipeline || !this.pipeline.imageProcessing) return;

        console.log('  🖼️ Configuring image processing...');

        // Apply contrast
        this.pipeline.imageProcessing.contrast = this.config.contrast;

        console.log(`    - Contrast: ${this.config.contrast}`);
    }

    private setupAntiAliasing(): void {
        if (!this.pipeline) return;

        console.log('  🔲 Configuring anti-aliasing...');

        // FXAA is fast and works well
        this.pipeline.fxaaEnabled = true;

        // Can also enable MSAA if supported (WebGPU supports it well)
        this.pipeline.samples = 4; // 4x MSAA

        console.log(`    - FXAA: Enabled`);
        console.log(`    - MSAA: 4x`);
    }

    /**
     * Get the pipeline instance
     */
    getPipeline(): DefaultRenderingPipeline | null {
        return this.pipeline;
    }

    /**
     * Update exposure at runtime
     */
    setExposure(exposure: number): void {
        if (this.pipeline && this.pipeline.imageProcessing) {
            this.pipeline.imageProcessing.exposure = exposure;
        }
    }

    /**
     * Update contrast at runtime
     */
    setContrast(contrast: number): void {
        if (this.pipeline && this.pipeline.imageProcessing) {
            this.pipeline.imageProcessing.contrast = contrast;
        }
    }

    dispose(): void {
        if (this.pipeline) {
            this.pipeline.dispose();
            this.pipeline = null;
        }
    }
}
