import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// AAA Advanced Passes
import { SSRPass } from './passes/SSRPass.js';
import { TAAPass } from './passes/TAAPass.js';
import { VolumetricPass } from './passes/VolumetricPass.js';
import { SSGIPass } from './passes/SSGIPass.js';
import { ContactShadowsPass } from './passes/ContactShadowsPass.js';
import { MotionBlurPass } from './passes/MotionBlurPass.js';

/**
 * PostProcessing - Advanced post-processing pipeline for open-world rendering
 * Manages EffectComposer with configurable passes
 */
export class PostProcessing {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.enabled = true;
        this.composer = null;

        // Pass references
        this.renderPass = null;
        this.bloomPass = null;
        this.ssaoPass = null;
        this.gtaoPass = null;
        this.bokehPass = null;
        this.fxaaPass = null;
        this.outlinePass = null;
        this.outputPass = null;

        // AAA Advanced passes
        this.ssrPass = null;
        this.taaPass = null;
        this.ssgiPass = null;
        this.contactShadowsPass = null;
        this.volumetricPass = null;
        this.motionBlurPass = null;

        // Quality presets
        this.qualityPresets = {
            low: {
                bloom: false,
                ssao: false,
                gtao: false,
                dof: false,
                fxaa: true,
                ssr: false,
                taa: false,
                volumetric: false,
                bloomStrength: 0.3,
                ssaoRadius: 4,
                dofFocus: 10,
                dofAperture: 0.00001
            },
            medium: {
                bloom: true,
                ssao: false,
                gtao: false,
                dof: false,
                fxaa: true,
                ssr: false,
                taa: true,
                volumetric: false,
                bloomStrength: 0.5,
                ssaoRadius: 8,
                dofFocus: 10,
                dofAperture: 0.00005
            },
            high: {
                bloom: true,
                ssao: false,
                gtao: true,
                dof: true,
                fxaa: false,
                ssr: true,
                taa: true,
                volumetric: true,
                bloomStrength: 0.7,
                ssaoRadius: 16,
                dofFocus: 10,
                dofAperture: 0.0001
            },
            ultra: {
                bloom: true,
                ssao: false,
                gtao: true,
                dof: true,
                fxaa: false,
                ssr: true,
                taa: true,
                volumetric: true,
                ssgi: true,
                contactShadows: true,
                motionBlur: true,
                bloomStrength: 1.0,
                ssaoRadius: 32,
                dofFocus: 10,
                dofAperture: 0.00015
            }
        };

        this.currentQuality = 'low'; // Default to low to avoid texture unit limits

        this.init();
    }

    /**
     * Initialize the post-processing pipeline
     */
    init() {
        const size = this.renderer.getSize(new THREE.Vector2());
        const pixelRatio = this.renderer.getPixelRatio();

        // Create composer
        this.composer = new EffectComposer(this.renderer);

        // Render pass (base scene render)
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // SSAO Pass (Screen Space Ambient Occlusion) - Legacy, use GTAO instead
        this.ssaoPass = new SSAOPass(this.scene, this.camera, size.x, size.y);
        this.ssaoPass.kernelRadius = 16;
        this.ssaoPass.minDistance = 0.005;
        this.ssaoPass.maxDistance = 0.1;
        this.ssaoPass.enabled = false;
        this.composer.addPass(this.ssaoPass);

        // GTAO Pass (Ground Truth Ambient Occlusion) - Better quality than SSAO
        try {
            this.gtaoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
            this.gtaoPass.output = GTAOPass.OUTPUT.Default;
            this.gtaoPass.enabled = false;
            this.composer.addPass(this.gtaoPass);
        } catch (e) {
            console.warn('GTAOPass not available, skipping');
            this.gtaoPass = null;
        }

        // SSR Pass (Screen Space Reflections) - AAA Quality
        try {
            this.ssrPass = new SSRPass(this.scene, this.camera, {
                renderer: this.renderer,
                intensity: 1.0,
                maxDistance: 50.0,
                thickness: 0.1,
                maxSteps: 64
            });
            this.ssrPass.enabled = false;
            this.composer.addPass(this.ssrPass);
        } catch (e) {
            console.warn('SSRPass initialization failed:', e);
            this.ssrPass = null;
        }

        // SSGI Pass (Screen Space Global Illumination) - AAA Quality
        try {
            this.ssgiPass = new SSGIPass(this.scene, this.camera, {
                renderer: this.renderer,
                intensity: 1.0,
                radius: 3.0,
                samples: 16
            });
            this.ssgiPass.enabled = false;
            this.composer.addPass(this.ssgiPass);
        } catch (e) {
            console.warn('SSGIPass initialization failed:', e);
            this.ssgiPass = null;
        }

        // Contact Shadows Pass - AAA Quality
        try {
            this.contactShadowsPass = new ContactShadowsPass(this.scene, this.camera, {
                renderer: this.renderer,
                intensity: 0.5,
                samples: 16
            });
            this.contactShadowsPass.enabled = false;
            this.composer.addPass(this.contactShadowsPass);
        } catch (e) {
            console.warn('ContactShadowsPass initialization failed:', e);
            this.contactShadowsPass = null;
        }

        // Volumetric Pass (God rays, fog) - AAA Quality
        // Disabled by default - enable when fully tested
        // Volumetric Pass (God rays, fog) - AAA Quality
        try {
            this.volumetricPass = new VolumetricPass(this.scene, this.camera, {
                renderer: this.renderer,
                density: 0.01,
                samples: 64,
                fogEnabled: true
            });
            this.volumetricPass.enabled = false;
            this.composer.addPass(this.volumetricPass);
        } catch (e) {
            console.warn('VolumetricPass initialization failed:', e);
            this.volumetricPass = null;
        }

        // Motion Blur Pass - AAA Quality
        try {
            this.motionBlurPass = new MotionBlurPass(this.scene, this.camera, {
                renderer: this.renderer,
                intensity: 1.0,
                samples: 16,
                maxVelocity: 32.0
            });
            this.motionBlurPass.enabled = false;
            this.composer.addPass(this.motionBlurPass);
        } catch (e) {
            console.warn('MotionBlurPass initialization failed:', e);
            this.motionBlurPass = null;
        }

        // Bloom Pass
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(size.x, size.y),
            0.5,   // strength
            0.4,   // radius
            0.85   // threshold
        );
        this.bloomPass.enabled = true;
        this.composer.addPass(this.bloomPass);

        // Bokeh Pass (Depth of Field)
        try {
            this.bokehPass = new BokehPass(this.scene, this.camera, {
                focus: 10.0,
                aperture: 0.00005,
                maxblur: 0.01
            });
            this.bokehPass.enabled = false;
            this.composer.addPass(this.bokehPass);
        } catch (e) {
            console.warn('BokehPass not available, skipping');
            this.bokehPass = null;
        }

        // Outline Pass (for selection highlighting)
        this.outlinePass = new OutlinePass(
            new THREE.Vector2(size.x, size.y),
            this.scene,
            this.camera
        );
        this.outlinePass.edgeStrength = 3;
        this.outlinePass.edgeGlow = 0.5;
        this.outlinePass.edgeThickness = 1;
        this.outlinePass.visibleEdgeColor.set('#6366f1');
        this.outlinePass.hiddenEdgeColor.set('#4338ca');
        this.outlinePass.enabled = true;
        this.composer.addPass(this.outlinePass);

        // TAA Pass (Temporal Anti-Aliasing) - AAA Quality
        try {
            this.taaPass = new TAAPass(this.scene, this.camera, {
                renderer: this.renderer,
                blendFactor: 0.9,
                sharpness: 0.25
            });
            this.taaPass.enabled = false;
            this.composer.addPass(this.taaPass);
        } catch (e) {
            console.warn('TAAPass initialization failed:', e);
            this.taaPass = null;
        }

        // FXAA Pass (Fast Approximate Anti-Aliasing)
        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.uniforms['resolution'].value.set(
            1 / (size.x * pixelRatio),
            1 / (size.y * pixelRatio)
        );
        this.fxaaPass.enabled = true;
        this.composer.addPass(this.fxaaPass);

        // Output pass (gamma correction, tone mapping)
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        // Apply default quality
        this.setQuality(this.currentQuality);
    }

    /**
     * Render the post-processing pipeline
     */
    render() {
        if (this.enabled && this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /**
     * Update camera reference
     */
    setCamera(camera) {
        this.camera = camera;
        this.renderPass.camera = camera;
        this.ssaoPass.camera = camera;
        this.outlinePass.renderCamera = camera;
    }

    /**
     * Resize the post-processing pipeline
     */
    setSize(width, height) {
        const pixelRatio = this.renderer.getPixelRatio();

        this.composer.setSize(width, height);

        this.ssaoPass.setSize(width, height);
        this.bloomPass.setSize(width, height);
        this.outlinePass.setSize(width, height);

        if (this.gtaoPass) {
            this.gtaoPass.setSize(width, height);
        }

        // AAA passes
        if (this.ssrPass) {
            this.ssrPass.setSize(width, height);
        }
        if (this.taaPass) {
            this.taaPass.setSize(width, height);
        }
        if (this.volumetricPass) {
            this.volumetricPass.setSize(width, height);
        }
        if (this.ssgiPass) {
            this.ssgiPass.setSize(width, height);
        }
        if (this.contactShadowsPass) {
            this.contactShadowsPass.setSize(width, height);
        }
        if (this.motionBlurPass) {
            this.motionBlurPass.setSize(width, height);
        }

        this.fxaaPass.uniforms['resolution'].value.set(
            1 / (width * pixelRatio),
            1 / (height * pixelRatio)
        );
    }

    /**
     * Set objects to highlight with outline
     * @param {THREE.Object3D[]} objects 
     */
    setSelectedObjects(objects) {
        this.outlinePass.selectedObjects = objects;
    }

    /**
     * Clear selection highlight
     */
    clearSelection() {
        this.outlinePass.selectedObjects = [];
    }

    /**
     * Set quality preset
     * @param {'low'|'medium'|'high'|'ultra'} preset 
     */
    setQuality(preset) {
        const settings = this.qualityPresets[preset];
        if (!settings) return;

        this.currentQuality = preset;

        // Apply settings
        this.bloomPass.enabled = settings.bloom;
        this.bloomPass.strength = settings.bloomStrength;

        this.ssaoPass.enabled = settings.ssao;
        this.ssaoPass.kernelRadius = settings.ssaoRadius;

        // GTAO (better AO alternative)
        if (this.gtaoPass) {
            this.gtaoPass.enabled = settings.gtao || false;
        }

        // Depth of Field
        if (this.bokehPass) {
            this.bokehPass.enabled = settings.dof || false;
            if (settings.dofFocus) {
                this.bokehPass.uniforms['focus'].value = settings.dofFocus;
            }
            if (settings.dofAperture) {
                this.bokehPass.uniforms['aperture'].value = settings.dofAperture;
            }
        }

        // AAA Passes
        // SSR (Screen Space Reflections)
        if (this.ssrPass) {
            this.ssrPass.enabled = settings.ssr || false;
        }

        // TAA (Temporal Anti-Aliasing) - replaces FXAA at higher quality
        if (this.taaPass) {
            this.taaPass.enabled = settings.taa || false;
        }

        // Volumetric (God rays, fog)
        if (this.volumetricPass) {
            this.volumetricPass.enabled = settings.volumetric || false;
        }

        // SSGI (Screen Space Global Illumination)
        if (this.ssgiPass) {
            this.ssgiPass.enabled = settings.ssgi || false;
        }

        // Contact Shadows
        if (this.contactShadowsPass) {
            this.contactShadowsPass.enabled = settings.contactShadows || false;
        }

        // Motion Blur
        if (this.motionBlurPass) {
            this.motionBlurPass.enabled = settings.motionBlur || false;
        }

        // FXAA is disabled when TAA is enabled (TAA provides better AA)
        this.fxaaPass.enabled = settings.fxaa && !settings.taa;
    }

    /**
     * Configure bloom effect
     */
    setBloomSettings(strength = 0.5, radius = 0.4, threshold = 0.85) {
        this.bloomPass.strength = strength;
        this.bloomPass.radius = radius;
        this.bloomPass.threshold = threshold;
    }

    /**
     * Configure SSAO effect
     */
    setSSAOSettings(radius = 16, minDistance = 0.005, maxDistance = 0.1) {
        this.ssaoPass.kernelRadius = radius;
        this.ssaoPass.minDistance = minDistance;
        this.ssaoPass.maxDistance = maxDistance;
    }

    /**
     * Configure outline effect
     */
    setOutlineSettings(edgeStrength = 3, edgeGlow = 0.5, edgeThickness = 1) {
        this.outlinePass.edgeStrength = edgeStrength;
        this.outlinePass.edgeGlow = edgeGlow;
        this.outlinePass.edgeThickness = edgeThickness;
    }

    /**
     * Set outline colors
     */
    setOutlineColors(visibleColor, hiddenColor) {
        this.outlinePass.visibleEdgeColor.set(visibleColor);
        this.outlinePass.hiddenEdgeColor.set(hiddenColor);
    }

    /**
     * Enable/disable individual passes
     */
    setPassEnabled(passName, enabled) {
        switch (passName) {
            case 'bloom':
                this.bloomPass.enabled = enabled;
                break;
            case 'ssao':
                this.ssaoPass.enabled = enabled;
                break;
            case 'fxaa':
                this.fxaaPass.enabled = enabled;
                break;
            case 'outline':
                this.outlinePass.enabled = enabled;
                break;
            case 'ssr':
                if (this.ssrPass) this.ssrPass.enabled = enabled;
                break;
            case 'taa':
                if (this.taaPass) this.taaPass.enabled = enabled;
                break;
            case 'volumetric':
                if (this.volumetricPass) this.volumetricPass.enabled = enabled;
                break;
            case 'gtao':
                if (this.gtaoPass) this.gtaoPass.enabled = enabled;
                break;
            case 'dof':
            case 'bokeh':
                if (this.bokehPass) this.bokehPass.enabled = enabled;
                break;
            case 'ssgi':
                if (this.ssgiPass) this.ssgiPass.enabled = enabled;
                break;
            case 'contactShadows':
                if (this.contactShadowsPass) this.contactShadowsPass.enabled = enabled;
                break;
            case 'motionBlur':
                if (this.motionBlurPass) this.motionBlurPass.enabled = enabled;
                break;
        }
    }

    /**
     * Configure SSR (Screen Space Reflections)
     */
    setSSRSettings(options = {}) {
        if (!this.ssrPass) return;

        if (options.intensity !== undefined) this.ssrPass.intensity = options.intensity;
        if (options.maxDistance !== undefined) this.ssrPass.maxDistance = options.maxDistance;
        if (options.thickness !== undefined) this.ssrPass.thickness = options.thickness;
        if (options.maxSteps !== undefined) this.ssrPass.maxSteps = options.maxSteps;
    }

    /**
     * Configure TAA (Temporal Anti-Aliasing)
     */
    setTAASettings(options = {}) {
        if (!this.taaPass) return;

        if (options.blendFactor !== undefined) this.taaPass.blendFactor = options.blendFactor;
        if (options.sharpness !== undefined) this.taaPass.sharpness = options.sharpness;
        if (options.jitterEnabled !== undefined) this.taaPass.jitterEnabled = options.jitterEnabled;
    }

    /**
     * Configure Volumetric effects (god rays, fog)
     */
    setVolumetricSettings(options = {}) {
        if (!this.volumetricPass) return;

        if (options.density !== undefined) this.volumetricPass.density = options.density;
        if (options.samples !== undefined) this.volumetricPass.samples = options.samples;
        if (options.exposure !== undefined) this.volumetricPass.exposure = options.exposure;
        if (options.maxDistance !== undefined) this.volumetricPass.maxDistance = options.maxDistance;

        // Fog settings
        if (options.fog) {
            this.volumetricPass.setFog(options.fog);
        }
    }

    /**
     * Set the sun light for volumetric effects
     */
    setVolumetricSunLight(light) {
        if (this.volumetricPass) {
            this.volumetricPass.setSunLight(light);
        }
    }

    /**
     * Configure Motion Blur effect
     */
    setMotionBlurSettings(options = {}) {
        if (!this.motionBlurPass) return;

        if (options.intensity !== undefined) this.motionBlurPass.intensity = options.intensity;
        if (options.samples !== undefined) this.motionBlurPass.samples = Math.min(32, Math.max(4, options.samples));
        if (options.maxVelocity !== undefined) this.motionBlurPass.maxVelocity = options.maxVelocity;
    }

    /**
     * Get current post-processing stats
     */
    getStats() {
        return {
            enabled: this.enabled,
            quality: this.currentQuality,
            passes: {
                bloom: this.bloomPass?.enabled || false,
                ssao: this.ssaoPass?.enabled || false,
                gtao: this.gtaoPass?.enabled || false,
                fxaa: this.fxaaPass?.enabled || false,
                outline: this.outlinePass?.enabled || false,
                dof: this.bokehPass?.enabled || false,
                // AAA passes
                ssr: this.ssrPass?.enabled || false,
                taa: this.taaPass?.enabled || false,
                volumetric: this.volumetricPass?.enabled || false
            }
        };
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.ssrPass) this.ssrPass.dispose();
        if (this.taaPass) this.taaPass.dispose();
        if (this.volumetricPass) this.volumetricPass.dispose();
        this.composer.dispose();
    }
}
