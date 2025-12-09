/**
 * Terrain GLSL Shaders
 * 
 * Custom vertex and fragment shaders for multi-layer PBR terrain rendering
 * with slope-based, height-based, and noise-based texture blending.
 */

/**
 * Vertex Shader
 * 
 * Passes world position, normal, and UV coordinates to fragment shader.
 * Also calculates tangent-space basis for normal mapping.
 */
export const terrainVertexShader = `
precision highp float;

// Attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

// Uniforms
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform mat4 worldView;
uniform float textureScale;
uniform float terrainWidth;
uniform float terrainHeight;

// Varyings
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUV;
varying vec3 vPosition;

void main() {
    // Transform to world space
    vec4 worldPos = world * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    
    // Transform normal to world space
    vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
    
    // Calculate tiled UV based on world position
    vUV = vec2(worldPos.x / terrainWidth, worldPos.z / terrainHeight) * textureScale;
    
    // Pass local position for height calculation
    vPosition = position;
    
    // Final position
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

/**
 * Fragment Shader
 * 
 * Implements multi-layer PBR terrain with:
 * - Slope-based blending (rocks on steep surfaces)
 * - Height-based blending (burned ground at high altitude)
 * - Noise-based blending for natural variation on flat surfaces
 * - Triplanar mapping for rock textures to avoid stretching
 * - Normal mapping for all layers
 * - PBR lighting with roughness
 */
export const terrainFragmentShader = `
precision highp float;

// Varyings from vertex shader
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec2 vUV;
varying vec3 vPosition;

// Texture samplers - Layer 1: Grass/Mud
uniform sampler2D grassDiffuse;
uniform sampler2D grassNormal;
uniform sampler2D grassRoughness;

// Texture samplers - Layer 2: Rock
uniform sampler2D rockDiffuse;
uniform sampler2D rockNormal;
uniform sampler2D rockRoughness;

// Texture samplers - Layer 3: Burned
uniform sampler2D burnedDiffuse;
uniform sampler2D burnedNormal;
uniform sampler2D burnedRoughness;

// Terrain uniforms
uniform float minHeight;
uniform float maxHeight;
uniform float textureScale;
uniform float terrainWidth;
uniform float terrainHeight;

// Blending uniforms
uniform float slopeStart;
uniform float slopeEnd;
uniform float heightStart;
uniform float heightEnd;

// Lighting uniforms
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform vec3 ambientColor;
uniform vec3 cameraPosition;

// Debug mode: 0=off, 1=show blend factors as colors
uniform float debugMode;

// ========================================
// Noise functions for natural variation
// ========================================

// Simple hash function for pseudo-random values
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2D value noise
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    // Four corners
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    // Bilinear interpolation
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian Motion for more natural-looking noise
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    
    return value;
}

// ========================================
// Triplanar mapping helpers
// ========================================

// Helper function for triplanar mapping
vec4 triplanarSample(sampler2D tex, vec3 worldPos, vec3 blendWeights, float scale) {
    // Sample texture from 3 directions
    vec4 xProjection = texture2D(tex, worldPos.yz * scale);
    vec4 yProjection = texture2D(tex, worldPos.xz * scale);
    vec4 zProjection = texture2D(tex, worldPos.xy * scale);
    
    // Blend based on normal direction
    return xProjection * blendWeights.x + yProjection * blendWeights.y + zProjection * blendWeights.z;
}

// Calculate triplanar blend weights from normal
vec3 getTriplanarWeights(vec3 normal) {
    vec3 weights = abs(normal);
    // Sharpen the blend
    weights = pow(weights, vec3(4.0));
    // Normalize
    weights = weights / (weights.x + weights.y + weights.z);
    return weights;
}

// ========================================
// Normal mapping helper
// ========================================

// Perturb normal using normal map
vec3 perturbNormal(vec3 worldNormal, vec3 normalMapValue) {
    // Convert from [0,1] to [-1,1]
    vec3 tangentNormal = normalMapValue * 2.0 - 1.0;
    
    // Create tangent space basis
    vec3 up = abs(worldNormal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, worldNormal));
    vec3 bitangent = cross(worldNormal, tangent);
    
    // Transform normal map to world space
    mat3 TBN = mat3(tangent, bitangent, worldNormal);
    return normalize(TBN * tangentNormal);
}

// ========================================
// Main shader
// ========================================

void main() {
    // Normalize world normal
    vec3 worldNormal = normalize(vWorldNormal);
    
    // Calculate slope factor (0 = flat facing up, 1 = vertical)
    float slope = 1.0 - abs(worldNormal.y);
    
    // Calculate height factor (0 = min height, 1 = max height)
    float heightFactor = clamp((vWorldPosition.y - minHeight) / (maxHeight - minHeight), 0.0, 1.0);
    
    // ========================================
    // Add noise-based variation for meadow terrain
    // ========================================
    
    // Low-frequency noise for large-scale variation
    float largeNoise = fbm(vWorldPosition.xz * 0.005);
    
    // Medium-frequency noise for texture breakup
    float mediumNoise = fbm(vWorldPosition.xz * 0.02);
    
    // Use noise to modulate the slope threshold (creates rocky patches on flat ground)
    float noiseModulatedSlope = slope + (mediumNoise - 0.5) * 0.15;
    
    // Use noise to modulate height threshold (creates burned patches at varying heights)
    float noiseModulatedHeight = heightFactor + (largeNoise - 0.5) * 0.2;
    
    // Calculate blend factors with smooth transitions
    float slopeBlend = smoothstep(slopeStart, slopeEnd, noiseModulatedSlope);
    float heightBlend = smoothstep(heightStart, heightEnd, noiseModulatedHeight);
    
    // Calculate triplanar weights for rock texture (prevents stretching on cliffs)
    vec3 triWeights = getTriplanarWeights(worldNormal);
    float triplanarScale = textureScale / terrainWidth;
    
    // ========================================
    // Sample all texture layers
    // ========================================
    
    // Sample grass layer (regular UV mapping for flat surfaces)
    vec3 grassAlbedo = texture2D(grassDiffuse, vUV).rgb;
    vec3 grassNormalMap = texture2D(grassNormal, vUV).rgb;
    float grassRough = texture2D(grassRoughness, vUV).r;
    
    // Sample rock layer with triplanar mapping
    vec3 rockAlbedo = triplanarSample(rockDiffuse, vWorldPosition, triWeights, triplanarScale).rgb;
    vec3 rockNormalMap = triplanarSample(rockNormal, vWorldPosition, triWeights, triplanarScale).rgb;
    float rockRough = triplanarSample(rockRoughness, vWorldPosition, triWeights, triplanarScale).r;
    
    // Sample burned layer (regular UV mapping)
    vec3 burnedAlbedo = texture2D(burnedDiffuse, vUV).rgb;
    vec3 burnedNormalMap = texture2D(burnedNormal, vUV).rgb;
    float burnedRough = texture2D(burnedRoughness, vUV).r;
    
    // ========================================
    // Blend textures
    // ========================================
    
    // Blend based on slope (grass vs rock)
    vec3 slopeAlbedo = mix(grassAlbedo, rockAlbedo, slopeBlend);
    vec3 slopeNormalMap = mix(grassNormalMap, rockNormalMap, slopeBlend);
    float slopeRoughness = mix(grassRough, rockRough, slopeBlend);
    
    // Blend based on height (add burned at higher areas)
    // Reduce burned blend on rock cliffs
    float adjustedHeightBlend = heightBlend * (1.0 - slopeBlend * 0.5);
    
    vec3 finalAlbedo = mix(slopeAlbedo, burnedAlbedo, adjustedHeightBlend);
    vec3 finalNormalMap = mix(slopeNormalMap, burnedNormalMap, adjustedHeightBlend);
    float finalRoughness = mix(slopeRoughness, burnedRough, adjustedHeightBlend);
    
    // ========================================
    // Apply normal mapping
    // ========================================
    vec3 perturbedNormal = perturbNormal(worldNormal, finalNormalMap);
    
    // ========================================
    // PBR Lighting calculation
    // ========================================
    vec3 lightDir = normalize(lightDirection);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    
    // Diffuse (Lambertian)
    float NdotL = max(dot(perturbedNormal, lightDir), 0.0);
    vec3 diffuse = finalAlbedo * lightColor * NdotL;
    
    // Specular (simplified PBR)
    float NdotH = max(dot(perturbedNormal, halfDir), 0.0);
    float specPower = mix(256.0, 8.0, finalRoughness);
    float spec = pow(NdotH, specPower) * (1.0 - finalRoughness);
    vec3 specular = lightColor * spec * 0.3;
    
    // Ambient
    vec3 ambient = finalAlbedo * ambientColor;
    
    // Final color
    vec3 finalColor = ambient + diffuse + specular;
    
    // Tone mapping (simple Reinhard)
    finalColor = finalColor / (finalColor + vec3(1.0));
    
    // Gamma correction
    finalColor = pow(finalColor, vec3(1.0 / 2.2));
    
    // Debug visualization: R=slope blend, G=height blend, B=noise
    if (debugMode > 0.5) {
        finalColor = vec3(slopeBlend, heightBlend, mediumNoise);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;
