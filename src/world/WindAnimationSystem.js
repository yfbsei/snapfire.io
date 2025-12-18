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
                
                // LINEAR SWAY (Unified phase to prevent swirling/rotation)
                float mainPhase = uWindTime * uWindSpeed + windWorldPos.x * 0.2 + windWorldPos.z * 0.2;
                float sway = sin(mainPhase);
                
                // Directional displacement
                float windX = sway * uWindDirection.x;
                float windZ = sway * uWindDirection.y;
                
                // Minimal turbulence
                float turb = sin(uWindTime * uWindSpeed * 2.5 + windWorldPos.x) * uTurbulence * 0.2;
                
                // Apply wind displacement - only affects upper portion
                float windAmount = uWindStrength * uWindMultiplier * stiffness;
                transformed.x += (windX + turb) * windAmount;
                transformed.z += (windZ + turb * 0.7) * windAmount;
                
                // Subtle vertical dip
                transformed.y -= abs(sway) * windAmount * 0.02;
            ` : `
                // Wind animation for foliage (position-based with radial distance from center)
                #ifdef USE_INSTANCING
                    vec4 windWorldPos = instanceMatrix * vec4(transformed, 1.0);
                #else
                    vec4 windWorldPos = modelMatrix * vec4(transformed, 1.0);
                #endif
                
                // Simple height-based calculation (Removing radius as requested)
                float meshHeight = max(uMeshMaxY - uMeshMinY, 0.1);
                float normalizedHeight = clamp((position.y - uMeshMinY) / meshHeight, 0.0, 1.0);
                
                // Invert height if mesh is rotated 180°
                if (uInvertHeight > 0.5) {
                    normalizedHeight = 1.0 - normalizedHeight;
                }

                // Simple stiffness based on height (anchored at base)
                float stiffness = normalizedHeight * normalizedHeight;
                
                // Simple directional sway
                float mainPhase = uWindTime * uWindSpeed + windWorldPos.x * 0.2 + windWorldPos.z * 0.2;
                float sway = sin(mainPhase);
                
                float windX = sway * uWindDirection.x;
                float windZ = sway * uWindDirection.y;
                
                // Very subtle turbulence
                float turb = sin(uWindTime * uWindSpeed * 2.5 + windWorldPos.x) * uTurbulence * 0.5;
                
                // Apply wind
                float windAmount = uWindStrength * uWindMultiplier * stiffness;
                transformed.x += (windX + turb * 0.2) * windAmount;
                transformed.z += (windZ + turb * 0.2) * windAmount;
                transformed.y -= abs(sway) * windAmount * 0.05;
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
     * Dispose all tracked materials
     */
    dispose() {
        this._materials.clear();
    }
}
