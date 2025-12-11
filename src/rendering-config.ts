// Rendering Configuration for Photorealistic Rendering System
// Central configuration for all rendering features

export interface ShadowConfig {
    enabled: boolean;
    resolution: number;              // Shadow map resolution (e.g., 8192 for ultra quality)
    numCascades: number;             // Number of CSM cascades (4 recommended)
    cascadeLambda: number;           // CSM distribution (0.0-1.0, higher = more detail near camera)
    filteringQuality: 'Low' | 'Medium' | 'High';
    contactHardeningShadows: boolean;  // Realistic penumbra
    pcfSamples: number;              // Samples for soft shadows
    bias: number;                    // Shadow bias to prevent acne
    normalBias: number;              // Normal-based bias
}

export interface SSAOConfig {
    enabled: boolean;
    samples: number;                 // Number of samples (higher = better quality)
    radius: number;                  // Effect radius
    base: number;                    // Base intensity
    ssaoRatio: number;               // Resolution ratio (0.5 = half res for performance)
    bilateralBlur: boolean;          // Clean up noise
}

export interface SSRConfig {
    enabled: boolean;
    samples: number;                 // Ray marching samples
    step: number;                    // Ray marching step size
    strength: number;                // Reflection intensity
    reflectionSpecularFalloffExponent: number;
    threshold: number;               // Edge detection threshold
    roughnessFactor: number;         // Roughness multiplier
}

export interface VolumetricLightConfig {
    enabled: boolean;
    samples: number;                 // Number of samples along ray
    density: number;                 // Light density
    decay: number;                   // Light decay along ray
    weight: number;                  // Light weight/intensity
    exposure: number;                // Overall exposure
}

export interface AtmosphereConfig {
    enabled: boolean;
    fogMode: 'exp' | 'exp2' | 'linear';
    fogDensity: number;              // Base fog density
    fogStart: number;                // For linear fog
    fogEnd: number;                  // For linear fog
    fogColor: { r: number; g: number; b: number };
}

export interface PostProcessConfig {
    // Tone Mapping
    toneMappingEnabled: boolean;
    toneMappingType: 'ACES' | 'Reinhard' | 'Photographic' | 'None';
    exposure: number;                // Camera exposure

    // Auto Exposure
    autoExposure: boolean;
    minLuminance: number;
    maxLuminance: number;

    // Bloom
    bloomEnabled: boolean;
    bloomThreshold: number;          // Brightness threshold
    bloomWeight: number;             // Bloom intensity
    bloomKernel: number;             // Blur kernel size
    bloomScale: number;              // Bloom scale

    // Depth of Field
    dofEnabled: boolean;
    dofFocalLength: number;          // Focus distance
    dofFStop: number;                // Aperture f-stop
    dofFocusDistance: number;

    // Chromatic Aberration
    chromaticAberrationEnabled: boolean;
    chromaticAberrationAmount: number;

    // Vignette
    vignetteEnabled: boolean;
    vignetteWeight: number;
    vignetteColor: { r: number; g: number; b: number };

    // Image Processing
    contrast: number;                // 1.0 = default
    saturation: number;              // 1.0 = default

    // Grain
    grainEnabled: boolean;
    grainIntensity: number;
}

export interface AntiAliasingConfig {
    enabled: boolean;
    type: 'MSAA' | 'FXAA' | 'TAA';
    samples: number;                 // For MSAA/TAA
}

export interface RenderingConfig {
    shadows: ShadowConfig;
    ssao: SSAOConfig;
    ssr: SSRConfig;
    volumetricLight: VolumetricLightConfig;
    atmosphere: AtmosphereConfig;
    postProcess: PostProcessConfig;
    antiAliasing: AntiAliasingConfig;

    // General
    hdr: boolean;
    physicalLightFalloff: boolean;
}

// Ultra Quality Preset - Maximum photorealism, no hardware constraints
export const ULTRA_QUALITY_PRESET: RenderingConfig = {
    shadows: {
        enabled: true,
        resolution: 8192,            // Ultra high resolution for sharp, detailed shadows
        numCascades: 4,              // 4 cascades for optimal quality/performance
        cascadeLambda: 0.98,         // Maximum detail near camera
        filteringQuality: 'High',
        contactHardeningShadows: true,  // Enabled for realistic soft penumbra
        pcfSamples: 128,             // Ultra high samples for realistic soft shadow edges
        bias: 0.00005,               // Reduced bias for sharper shadow edges
        normalBias: 0.0005,          // Reduced for better shadow contact
    },
    ssao: {
        enabled: true,
        samples: 64,                 // High sample count
        radius: 2.0,                 // Increased for terrain-scale features
        base: 0.08,                  // Increased for more visible depth cues
        ssaoRatio: 1.0,              // Full resolution
        bilateralBlur: true,
    },
    ssr: {
        enabled: false,              // Disabled due to WebGPU shader validation issues
        samples: 128,                // High quality reflections
        step: 0.04,
        strength: 1.0,
        reflectionSpecularFalloffExponent: 3,
        threshold: 0.4,
        roughnessFactor: 0.2,
    },
    volumetricLight: {
        enabled: false,              // Disabled - may cause terrain artifacts
        samples: 100,                // High quality god rays
        density: 0.96,
        decay: 0.98,
        weight: 0.4,
        exposure: 0.3,
    },
    atmosphere: {
        enabled: true,
        fogMode: 'exp2',             // Exponential squared for realistic falloff
        fogDensity: 0.00008,         // Reduced for clearer night skies
        fogStart: 100,
        fogEnd: 5000,
        fogColor: { r: 0.05, g: 0.06, b: 0.1 },  // Dark night-time color
    },
    postProcess: {
        toneMappingEnabled: true,
        toneMappingType: 'ACES',     // Cinematic ACES tone mapping
        exposure: 1.3,               // Increased for overcast day visibility

        autoExposure: true,
        minLuminance: 0.25,
        maxLuminance: 4.0,

        bloomEnabled: true,
        bloomThreshold: 0.8,
        bloomWeight: 0.15,           // Reduced for subtler highlights
        bloomKernel: 64,
        bloomScale: 0.5,

        dofEnabled: false,           // Optional - can enable for specific shots
        dofFocalLength: 150,
        dofFStop: 1.4,
        dofFocusDistance: 2000,

        chromaticAberrationEnabled: true,
        chromaticAberrationAmount: 1.5,

        vignetteEnabled: true,
        vignetteWeight: 0.5,
        vignetteColor: { r: 0, g: 0, b: 0 },

        contrast: 1.15,              // Slightly reduced for softer overcast look
        saturation: 1.1,

        grainEnabled: true,
        grainIntensity: 5.0,
    },
    antiAliasing: {
        enabled: true,
        type: 'FXAA',                // FXAA for now, can switch to TAA later
        samples: 4,
    },
    hdr: true,
    physicalLightFalloff: true,
};

// High Quality Preset - Balanced quality/performance
export const HIGH_QUALITY_PRESET: RenderingConfig = {
    ...ULTRA_QUALITY_PRESET,
    shadows: {
        ...ULTRA_QUALITY_PRESET.shadows,
        resolution: 4096,
        pcfSamples: 32,
    },
    ssao: {
        ...ULTRA_QUALITY_PRESET.ssao,
        samples: 32,
        ssaoRatio: 0.75,
    },
    ssr: {
        ...ULTRA_QUALITY_PRESET.ssr,
        samples: 64,
    },
    volumetricLight: {
        ...ULTRA_QUALITY_PRESET.volumetricLight,
        samples: 50,
    },
};

// Currently active preset
export const CURRENT_PRESET = ULTRA_QUALITY_PRESET;
