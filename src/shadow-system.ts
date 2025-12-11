// High-Quality Shadow System with Cascaded Shadow Maps (CSM)
import { Scene } from '@babylonjs/core/scene';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { ShadowConfig } from './rendering-config';

export class ShadowSystem {
    private scene: Scene;
    private config: ShadowConfig;
    private shadowGenerator: CascadedShadowGenerator | null = null;

    constructor(scene: Scene, config: ShadowConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup high-quality cascaded shadow maps for directional light
     */
    setupShadows(light: DirectionalLight, shadowCasters: Mesh[]): CascadedShadowGenerator {
        if (!this.config.enabled) {
            console.log('⚫ Shadows disabled');
            return null as any;
        }

        console.log('🌓 Setting up Cascaded Shadow Maps...');

        // Create Cascaded Shadow Generator for optimal quality across distances
        this.shadowGenerator = new CascadedShadowGenerator(
            this.config.resolution,
            light
        );

        // Configure cascade settings
        this.shadowGenerator.numCascades = this.config.numCascades;
        this.shadowGenerator.lambda = this.config.cascadeLambda;

        // Enable stabilization to prevent shadow shimmering
        this.shadowGenerator.stabilizeCascades = true;

        // Shadow filtering for soft, realistic shadows
        switch (this.config.filteringQuality) {
            case 'High':
                // Percentage Closer Filtering with Contact Hardening
                if (this.config.contactHardeningShadows) {
                    this.shadowGenerator.useContactHardeningShadow = true;
                    this.shadowGenerator.contactHardeningLightSizeUVRatio = 0.05;
                } else {
                    this.shadowGenerator.usePercentageCloserFiltering = true;
                    this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
                }
                break;
            case 'Medium':
                this.shadowGenerator.usePercentageCloserFiltering = true;
                this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
                break;
            case 'Low':
                this.shadowGenerator.usePoissonSampling = true;
                break;
        }

        // PCF configuration
        if (this.shadowGenerator.usePercentageCloserFiltering) {
            this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        }

        // Bias settings to prevent shadow acne while avoiding peter-panning
        this.shadowGenerator.bias = this.config.bias;
        this.shadowGenerator.normalBias = this.config.normalBias;

        // Enable depth clamping for better shadow quality
        this.shadowGenerator.depthClamp = true;

        // Add all shadow casters
        shadowCasters.forEach(mesh => {
            this.shadowGenerator!.addShadowCaster(mesh, true);
        });

        console.log(`✅ Cascaded Shadow Maps configured:`);
        console.log(`   - Resolution: ${this.config.resolution}x${this.config.resolution}`);
        console.log(`   - Cascades: ${this.config.numCascades}`);
        console.log(`   - Filtering: ${this.config.filteringQuality}`);
        console.log(`   - Contact Hardening: ${this.config.contactHardeningShadows}`);

        return this.shadowGenerator;
    }

    /**
     * Add a mesh to cast shadows
     */
    addShadowCaster(mesh: Mesh): void {
        if (this.shadowGenerator) {
            this.shadowGenerator.addShadowCaster(mesh, true);
        }
    }

    /**
     * Remove a mesh from casting shadows
     */
    removeShadowCaster(mesh: Mesh): void {
        if (this.shadowGenerator) {
            this.shadowGenerator.removeShadowCaster(mesh);
        }
    }

    /**
     * Get the shadow generator instance
     */
    getGenerator(): CascadedShadowGenerator | null {
        return this.shadowGenerator;
    }

    /**
     * Enable shadow debugging visualization
     */
    enableDebugMode(): void {
        if (this.shadowGenerator) {
            this.shadowGenerator.autoCalcDepthBounds = true;
            console.log('🐛 Shadow debug mode enabled');
        }
    }

    /**
     * Update shadow configuration at runtime
     */
    updateConfig(newConfig: Partial<ShadowConfig>): void {
        this.config = { ...this.config, ...newConfig };

        if (this.shadowGenerator) {
            // Update settings that can be changed at runtime
            if (newConfig.bias !== undefined) {
                this.shadowGenerator.bias = newConfig.bias;
            }
            if (newConfig.normalBias !== undefined) {
                this.shadowGenerator.normalBias = newConfig.normalBias;
            }
            if (newConfig.cascadeLambda !== undefined) {
                this.shadowGenerator.lambda = newConfig.cascadeLambda;
            }
        }
    }

    dispose(): void {
        if (this.shadowGenerator) {
            this.shadowGenerator.dispose();
            this.shadowGenerator = null;
        }
    }
}
