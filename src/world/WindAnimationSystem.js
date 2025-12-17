import * as THREE from 'three';

/**
 * WindAnimationSystem - Adds realistic wind animation to foliage
 * Uses onBeforeCompile to inject wind shader code into materials
 */
export class WindAnimationSystem {
    constructor(options = {}) {
        // Wind parameters
        this.windStrength = options.windStrength ?? 0.3;
        this.windSpeed = options.windSpeed ?? 1.5;
        this.windDirection = options.windDirection ?? new THREE.Vector2(1, 0.5).normalize();
        this.turbulence = options.turbulence ?? 0.15;

        // Time tracking
        this._time = 0;

        // Registered materials that receive wind animation
        this._materials = new Set();

        // Shared uniforms (updated each frame)
        this._uniforms = {
            uWindTime: { value: 0 },
            uWindStrength: { value: this.windStrength },
            uWindSpeed: { value: this.windSpeed },
            uWindDirection: { value: this.windDirection },
            uTurbulence: { value: this.turbulence }
        };
    }

    /**
     * Set wind parameters
     */
    setWindStrength(strength) {
        this.windStrength = strength;
        this._uniforms.uWindStrength.value = strength;
    }

    setWindSpeed(speed) {
        this.windSpeed = speed;
        this._uniforms.uWindSpeed.value = speed;
    }

    setWindDirection(x, z) {
        this.windDirection.set(x, z).normalize();
        this._uniforms.uWindDirection.value = this.windDirection;
    }

    /**
     * Create a wind-enabled material from an existing material
     * Uses onBeforeCompile to inject wind shader code
     * @param {THREE.Material} baseMaterial - The base material to enhance
     * @param {Object} options - Wind options for this material
     * @returns {THREE.Material} - The wind-enabled material
     */
    createWindMaterial(baseMaterial, options = {}) {
        const material = baseMaterial.clone();
        const windStrengthMultiplier = options.strengthMultiplier ?? 1.0;
        const useUVForHeight = options.useUVForHeight ?? true;
        // Mesh bounds for proper height calculation
        const meshMinY = options.minY ?? 0.0;
        const meshMaxY = options.maxY ?? 5.0;
        const invertHeight = options.invertHeight ?? false; // For 180° rotated meshes

        // Store reference to our uniforms
        const uniforms = this._uniforms;

        material.onBeforeCompile = (shader) => {
            // Add our uniforms to the shader
            shader.uniforms.uWindTime = uniforms.uWindTime;
            shader.uniforms.uWindStrength = uniforms.uWindStrength;
            shader.uniforms.uWindSpeed = uniforms.uWindSpeed;
            shader.uniforms.uWindDirection = uniforms.uWindDirection;
            shader.uniforms.uTurbulence = uniforms.uTurbulence;
            shader.uniforms.uWindMultiplier = { value: windStrengthMultiplier };
            shader.uniforms.uMeshMinY = { value: meshMinY };
            shader.uniforms.uMeshMaxY = { value: meshMaxY };
            shader.uniforms.uInvertHeight = { value: invertHeight ? 1.0 : 0.0 };

            // Inject uniform declarations at the start of vertex shader
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
                uniform float uWindTime;
                uniform float uWindStrength;
                uniform float uWindSpeed;
                uniform vec2 uWindDirection;
                uniform float uTurbulence;
                uniform float uWindMultiplier;
                uniform float uMeshMinY;
                uniform float uMeshMaxY;
                uniform float uInvertHeight;
                `
            );

            // Inject wind displacement code before the project_vertex include
            // This modifies the 'transformed' variable which contains the final vertex position
            const windCode = useUVForHeight ? `
                // Wind animation for foliage (UV-based height)
                #ifdef USE_INSTANCING
                    vec4 windWorldPos = instanceMatrix * vec4(transformed, 1.0);
                #else
                    vec4 windWorldPos = modelMatrix * vec4(transformed, 1.0);
                #endif
                
                // Height-based stiffness using UV.y
                // After 180° rotation: UV.y=1 at visual tips (moves), UV.y=0 at visual roots (anchored)
                float rawHeight = clamp(uv.y, 0.0, 1.0);
                float stiffness = rawHeight * rawHeight; // Quadratic = base stays anchored
                
                // Multi-layer wind oscillation for natural look
                float windPhase1 = uWindTime * uWindSpeed + windWorldPos.x * 0.5 + windWorldPos.z * 0.3;
                float windPhase2 = uWindTime * uWindSpeed * 0.7 + windWorldPos.z * 0.4 + windWorldPos.x * 0.2;
                
                float windX = sin(windPhase1) * uWindDirection.x;
                float windZ = cos(windPhase2) * uWindDirection.y;
                
                // Turbulence for organic randomness
                float turb = sin(windWorldPos.x * 2.0 + windWorldPos.z * 2.5 + uWindTime * 3.0) * uTurbulence;
                
                // Apply wind displacement - only affects upper portion
                float windAmount = uWindStrength * uWindMultiplier * stiffness;
                transformed.x += (windX + turb) * windAmount;
                transformed.z += (windZ + turb * 0.7) * windAmount;
                
                // Slight vertical compression when bending
                transformed.y -= abs(windX + windZ) * windAmount * 0.05;
            ` : `
                // Wind animation for foliage (position-based with radial distance from center)
                #ifdef USE_INSTANCING
                    vec4 windWorldPos = instanceMatrix * vec4(transformed, 1.0);
                #else
                    vec4 windWorldPos = modelMatrix * vec4(transformed, 1.0);
                #endif
                
                // For trees: use RADIAL distance from center (XZ plane) instead of just height
                // This makes trunk (center) static and branch tips (edges) sway
                float radialDist = length(position.xz); // Distance from tree center
                float maxRadius = max(abs(uMeshMaxY - uMeshMinY) * 0.5, 1.0); // Approximate radius
                float normalizedRadius = clamp(radialDist / maxRadius, 0.0, 1.0);
                
                // Also factor in height for grass/foliage
                float meshHeight = uMeshMaxY - uMeshMinY;
                float normalizedHeight = (position.y - uMeshMinY) / max(meshHeight, 0.001);
                normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);
                
                // Invert height if mesh is rotated 180°
                if (uInvertHeight > 0.5) {
                    normalizedHeight = 1.0 - normalizedHeight;
                }
                
                // Combine radial and height: use whichever is larger
                // For trees: radial distance dominates (branch tips far from center)
                // For grass: height dominates (tips at top)
                float combined = max(normalizedRadius, normalizedHeight);
                
                // QUADRATIC falloff: center/base stays anchored, edges/tips move
                float stiffness = combined * combined;
                
                // Multi-layer wind oscillation
                float windPhase1 = uWindTime * uWindSpeed + windWorldPos.x * 0.5 + windWorldPos.z * 0.3;
                float windPhase2 = uWindTime * uWindSpeed * 0.7 + windWorldPos.z * 0.4;
                
                float windX = sin(windPhase1) * uWindDirection.x;
                float windZ = cos(windPhase2) * uWindDirection.y;
                
                // Turbulence
                float turb = sin(windWorldPos.x * 2.0 + windWorldPos.z * 2.5 + uWindTime * 3.0) * uTurbulence;
                
                // Apply wind - ONLY to outer edges, center/trunk is anchored
                float windAmount = uWindStrength * uWindMultiplier * stiffness;
                transformed.x += (windX + turb) * windAmount;
                transformed.z += (windZ + turb * 0.7) * windAmount;
                transformed.y -= abs(windX + windZ) * windAmount * 0.05;
            `;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                windCode + '\n#include <project_vertex>'
            );
        };

        // Mark material as needing recompilation
        material.needsUpdate = true;

        // Track this material
        this._materials.add(material);

        return material;
    }

    /**
     * Apply wind animation to an existing InstancedMesh
     * Replaces its material with a wind-enabled version
     * @param {THREE.InstancedMesh} mesh - The instanced mesh
     * @param {Object} options - Wind options
     */
    applyToMesh(mesh, options = {}) {
        if (!mesh.material) {
            console.warn('WindAnimationSystem: Mesh has no material');
            return;
        }

        mesh.material = this.createWindMaterial(mesh.material, options);
        return mesh;
    }

    /**
     * Update wind animation (call every frame)
     * @param {number} deltaTime - Time since last frame in seconds
     */
    update(deltaTime) {
        this._time += deltaTime;
        this._uniforms.uWindTime.value = this._time;
    }

    /**
     * Sync wind with WeatherSystem
     * @param {WeatherSystem} weatherSystem 
     */
    syncWithWeather(weatherSystem) {
        if (!weatherSystem) return;

        // Increase wind during rain/storm
        switch (weatherSystem.currentWeather) {
            case 'storm':
                this.setWindStrength(0.8);
                this.setWindSpeed(3.0);
                break;
            case 'rain':
                this.setWindStrength(0.5);
                this.setWindSpeed(2.0);
                break;
            case 'cloudy':
                this.setWindStrength(0.35);
                this.setWindSpeed(1.5);
                break;
            default: // clear
                this.setWindStrength(0.3);
                this.setWindSpeed(1.5);
        }
    }

    /**
     * Dispose all tracked materials
     */
    dispose() {
        this._materials.clear();
    }
}
