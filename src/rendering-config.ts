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

    // Vignette
    vignetteEnabled: boolean;
    vignetteWeight: number;
    vignetteColor: { r: number; g: number; b: number };

    // Image Processing
    contrast: number;                // 1.0 = default
    saturation: number;              // 1.0 = default
}

export interface AntiAliasingConfig {
    enabled: boolean;
    type: 'MSAA' | 'FXAA' | 'TAA';
    samples: number;                 // For MSAA/TAA
}

export interface RenderingConfig {
    shadows: ShadowConfig;
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
    atmosphere: {
        enabled: true,
        fogMode: 'exp2',             // Exponential squared for realistic falloff
        fogDensity: 0.00008,         // Subtle atmospheric depth
        fogStart: 100,
        fogEnd: 5000,
        fogColor: { r: 0.05, g: 0.06, b: 0.1 },  // Dark night-time color
    },
    postProcess: {
        toneMappingEnabled: true,
        toneMappingType: 'ACES',     // Cinematic ACES tone mapping
        exposure: 1.3,               // Increased for overcast day visibility

        vignetteEnabled: true,
        vignetteWeight: 0.5,
        vignetteColor: { r: 0, g: 0, b: 0 },

        contrast: 1.15,              // Slightly reduced for softer overcast look
        saturation: 1.1,
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
};

// Currently active preset
export const CURRENT_PRESET = ULTRA_QUALITY_PRESET;
