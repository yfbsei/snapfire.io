// Volumetric Light Scattering System (God Rays)
import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VolumetricLightConfig } from './rendering-config';

export class VolumetricLightSystem {
    private scene: Scene;
    private config: VolumetricLightConfig;
    private volumetricLight: VolumetricLightScatteringPostProcess | null = null;
    private sunMesh: Mesh | null = null;
    private observer: any = null;

    constructor(scene: Scene, config: VolumetricLightConfig) {
        this.scene = scene;
        this.config = config;
    }

    /**
     * Setup volumetric light scattering (god rays) for atmospheric lighting
     */
    setup(camera: Camera, sunLight: DirectionalLight): VolumetricLightScatteringPostProcess | null {
        if (!this.config.enabled) {
            console.log('⚫ Volumetric lighting disabled');
            return null;
        }

        console.log('☀️ Setting up volumetric light scattering (god rays)...');

        // Create a mesh to represent the sun position for volumetric scattering
        // This is used to determine the screen-space position of the light source
        this.sunMesh = Mesh.CreateSphere('sunMesh', 16, 20, this.scene);
        this.sunMesh.isVisible = false; // Don't render the actual mesh

        // Position the sun mesh in the direction of the sun light
        const sunDistance = 2000; // Far enough to appear as distant light source
        this.sunMesh.position = sunLight.direction.scale(-sunDistance);

        // Create volumetric light scattering post process
        this.volumetricLight = new VolumetricLightScatteringPostProcess(
            'volumetricLight',
            1.0, // Ratio (1.0 = full resolution)
            camera,
            this.sunMesh,
            this.config.samples,
            undefined, // Texture format
            this.scene.getEngine()
        );

        // Configure volumetric light parameters
        this.volumetricLight.exposure = this.config.exposure;
        this.volumetricLight.decay = this.config.decay;
        this.volumetricLight.weight = this.config.weight;
        this.volumetricLight.density = this.config.density;

        // Use custom position for god rays origin
        this.volumetricLight.useCustomMeshPosition = true;
        this.volumetricLight.setCustomMeshPosition(this.sunMesh.position);

        // Update sun mesh position when light direction changes
        this.observer = this.scene.onBeforeRenderObservable.add(() => {
            if (this.sunMesh && sunLight) {
                const newPosition = sunLight.direction.scale(-sunDistance);
                this.sunMesh.position = newPosition;
                if (this.volumetricLight) {
                    this.volumetricLight.setCustomMeshPosition(newPosition);
                }
            }
        });

        console.log('✅ Volumetric lighting configured:');
        console.log(`   - Samples: ${this.config.samples}`);
        console.log(`   - Density: ${this.config.density}`);
        console.log(`   - Exposure: ${this.config.exposure}`);

        return this.volumetricLight;
    }

    /**
     * Toggle volumetric lighting on/off at runtime
     */
    setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;

        if (this.volumetricLight) {
            if (enabled) {
                this.volumetricLight.exposure = this.config.exposure;
            } else {
                this.volumetricLight.exposure = 0.0;
            }
        }
    }

    /**
     * Update volumetric light exposure at runtime
     */
    setExposure(exposure: number): void {
        if (this.volumetricLight) {
            this.volumetricLight.exposure = exposure;
            this.config.exposure = exposure;
        }
    }

    /**
     * Update volumetric light density at runtime
     */
    setDensity(density: number): void {
        if (this.volumetricLight) {
            this.volumetricLight.density = density;
            this.config.density = density;
        }
    }

    /**
     * Get the volumetric light post process instance
     */
    getPostProcess(): VolumetricLightScatteringPostProcess | null {
        return this.volumetricLight;
    }

    dispose(): void {
        if (this.observer) {
            this.scene.onBeforeRenderObservable.remove(this.observer);
            this.observer = null;
        }
        if (this.volumetricLight) {
            this.volumetricLight.dispose();
            this.volumetricLight = null;
        }
        if (this.sunMesh) {
            this.sunMesh.dispose();
            this.sunMesh = null;
        }
    }
}
