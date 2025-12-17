/**
 * Advanced Rendering Passes - Barrel Export
 * AAA-quality post-processing effects
 */

// Screen Space Reflections
export { SSRPass, SSRShader } from './SSRPass.js';

// Temporal Anti-Aliasing
export { TAAPass, TAAShader, VelocityShader, halton } from './TAAPass.js';

// Volumetric Lighting & Fog
export { VolumetricPass, VolumetricLightShader } from './VolumetricPass.js';

// Motion Blur
export { MotionBlurPass, MotionBlurShader } from './MotionBlurPass.js';

// Temporal Upscaling (FSR-like)
export { TemporalUpscalePass, QualityPresets as UpscaleQualityPresets } from './TemporalUpscalePass.js';

