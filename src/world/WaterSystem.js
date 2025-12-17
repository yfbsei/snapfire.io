import * as THREE from 'three';

/**
 * WaterSystem - AAA-Quality Water Simulation
 * Implements Gerstner waves, reflections, refractions, and buoyancy
 */
export class WaterSystem {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = {
            size: options.size || 1000,
            segments: options.segments || 512,
            waterLevel: options.waterLevel || 0,
            waveHeight: options.waveHeight || 1.5,
            waveSpeed: options.waveSpeed || 1.0,
            waveFrequency: options.waveFrequency || 0.25,
            ...options
        };

        this.waterMesh = null;
        this.waterMaterial = null;
        this.time = 0;

        // Wave parameters (Gerstner waves)
        this.waves = [
            { amplitude: 0.5, wavelength: 60, speed: 1.0, direction: new THREE.Vector2(1, 0.3).normalize() },
            { amplitude: 0.3, wavelength: 31, speed: 1.3, direction: new THREE.Vector2(0.8, -0.6).normalize() },
            { amplitude: 0.15, wavelength: 18, speed: 0.8, direction: new THREE.Vector2(-0.6, 0.4).normalize() },
        ];

        this.buoyancyObjects = new Set();

        this._init();
    }

    _init() {
        // Create water plane geometry
        const geometry = new THREE.PlaneGeometry(
            this.options.size,
            this.options.size,
            this.options.segments,
            this.options.segments
        );
        geometry.rotateX(-Math.PI / 2);

        // Create advanced water material
        this.waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                waterLevel: { value: this.options.waterLevel },
                waveHeight: { value: this.options.waveHeight },
                waveAmp: { value: this.waves.map(w => w.amplitude) },
                waveLength: { value: this.waves.map(w => w.wavelength) },
                waveSpeed: { value: this.waves.map(w => w.speed) },
                waveDir: { value: this.waves.map(w => w.direction.toArray()) },

                // Appearance
                waterColor: { value: new THREE.Color(0x0077be) },
                reflectionStrength: { value: 0.5 },
                refractionStrength: { value: 0.8 },
                fresnelStrength: { value: 3.0 },

                // Foam
                foamColor: { value: new THREE.Color(0xffffff) },
                foamThreshold: { value: 0.7 },

                // Environment
                skyColor: { value: new THREE.Color(0x87CEEB) },
                sunDirection: { value: new THREE.Vector3(1, 1, 0).normalize() },

                // Depth
                shallowColor: { value: new THREE.Color(0x00ffff) },
                deepColor: { value: new THREE.Color(0x000033) },
                depthFactor: { value: 50.0 }
            },
            vertexShader: this._getVertexShader(),
            fragmentShader: this._getFragmentShader(),
            transparent: true,
            side: THREE.DoubleSide
        });

        this.waterMesh = new THREE.Mesh(geometry, this.waterMaterial);
        this.waterMesh.position.y = this.options.waterLevel;
        this.scene.add(this.waterMesh);
    }

    /**
     * Get water height at world position using Gerstner waves
     * @param {number} x - World X position
     * @param {number} z - World Z position
     * @param {number} time - Current time
     * @returns {number} Water surface height
     */
    getHeightAt(x, z, time = this.time) {
        let height = this.options.waterLevel;

        for (const wave of this.waves) {
            const k = (2.0 * Math.PI) / wave.wavelength;
            const c = wave.speed;
            const d = wave.direction;
            const f = k * (d.x * x + d.y * z - c * time);

            height += wave.amplitude * Math.sin(f);
        }

        return height;
    }

    /**
     * Get water normal at position (for accurate buoyancy)
     * @param {number} x 
     * @param {number} z 
     * @returns {THREE.Vector3}
     */
    getNormalAt(x, z) {
        const delta = 0.1;
        const hL = this.getHeightAt(x - delta, z);
        const hR = this.getHeightAt(x + delta, z);
        const hD = this.getHeightAt(x, z - delta);
        const hU = this.getHeightAt(x, z + delta);

        const normal = new THREE.Vector3(
            hL - hR,
            2.0 * delta,
            hD - hU
        ).normalize();

        return normal;
    }

    /**
     * Register an object for buoyancy simulation
     * @param {RigidBody} rigidBody 
     * @param {Object} options 
     */
    addBuoyancyObject(rigidBody, options = {}) {
        const buoyancy = {
            body: rigidBody,
            density: options.density || 0.5, // 0-1, 0.5 = half submerged
            volume: options.volume || 1.0,
            drag: options.drag || 0.99,
            samplePoints: options.samplePoints || 4,
            sampleRadius: options.sampleRadius || 1.0
        };

        this.buoyancyObjects.add(buoyancy);
        return buoyancy;
    }

    removeBuoyancyObject(buoyancy) {
        this.buoyancyObjects.delete(buoyancy);
    }

    /**
     * Update water simulation
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        this.time += deltaTime * this.options.waveSpeed;
        this.waterMaterial.uniforms.time.value = this.time;

        // Update buoyancy
        for (const buoyancy of this.buoyancyObjects) {
            this._updateBuoyancy(buoyancy, deltaTime);
        }
    }

    _updateBuoyancy(buoyancy, dt) {
        const body = buoyancy.body;
        const pos = body.object.position;

        let totalForce = new THREE.Vector3();
        let submergedCount = 0;

        // Sample multiple points for accurate buoyancy
        const sampleOffsets = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(buoyancy.sampleRadius, 0),
            new THREE.Vector2(-buoyancy.sampleRadius, 0),
            new THREE.Vector2(0, buoyancy.sampleRadius),
            new THREE.Vector2(0, -buoyancy.sampleRadius),
        ];

        for (const offset of sampleOffsets) {
            const sampleX = pos.x + offset.x;
            const sampleZ = pos.z + offset.y;
            const waterHeight = this.getHeightAt(sampleX, sampleZ);

            const sampleY = pos.y; // Simplified: use center Y
            const depth = waterHeight - sampleY;

            if (depth > 0) {
                // Underwater
                submergedCount++;

                // Buoyancy force (Archimedes' principle)
                const buoyancyForce = depth * buoyancy.volume * 9.81 * buoyancy.density;
                totalForce.y += buoyancyForce;

                // Wave force (push in wave direction)
                const normal = this.getNormalAt(sampleX, sampleZ);
                const waveForce = normal.clone().multiplyScalar(depth * 2.0);
                totalForce.add(waveForce);
            }
        }

        if (submergedCount > 0) {
            // Apply averaged force
            totalForce.divideScalar(sampleOffsets.length);
            body.applyForce(totalForce);

            // Apply drag
            const vel = body.velocity.clone();
            vel.y = 0; //  only horizontal drag
            const dragForce = vel.multiplyScalar(-buoyancy.drag);
            body.applyForce(dragForce);
        }
    }

    _getVertexShader() {
        return /* glsl */`
            uniform float time;
            uniform float waveHeight;
            uniform float waveAmp[3];
            uniform float waveLength[3];
            uniform float waveSpeed[3];
            uniform vec2 waveDir[3];

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;

            // Gerstner wave function
            vec3 gerstnerWave(vec2 pos, float amplitude, float wavelength, float speed, vec2 direction) {
                float k = 2.0 * 3.14159 / wavelength;
                float c = speed;
                float f = k * (dot(direction, pos) - c * time);
                
                float x = direction.x * amplitude * cos(f);
                float z = direction.y * amplitude * cos(f);
                float y = amplitude * sin(f);
                
                return vec3(x, y, z);
            }

            void main() {
                vec3 pos = position;
                vec3 offset = vec3(0.0);
                
                // Sum multiple Gerstner waves
                for(int i = 0; i < 3; i++) {
                    offset += gerstnerWave(pos.xz, waveAmp[i], waveLength[i], waveSpeed[i], waveDir[i]);
                }
                
                pos += offset;
                vWaveHeight = offset.y;
                
                // Calculate normal (simplified)
                vec3 tangent = normalize(vec3(1.0, offset.x, 0.0));
                vec3 bitangent = normalize(vec3(0.0, offset.z, 1.0));
                vNormal = normalize(cross(tangent, bitangent));
                
                vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
    }

    _getFragmentShader() {
        return /* glsl */`
            uniform vec3 waterColor;
            uniform vec3 shallowColor;
            uniform vec3 deepColor;
            uniform vec3 skyColor;
            uniform vec3 foamColor;
            uniform vec3 sunDirection;
            
            uniform float reflectionStrength;
            uniform float refractionStrength;
            uniform float fresnelStrength;
            uniform float foamThreshold;
            uniform float depthFactor;

            varying vec3 vWorldPos;
            varying vec3 vNormal;
            varying float vWaveHeight;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                
                // Fresnel effect
                float fresnel = pow(1.0 - dot(viewDir, normal), fresnelStrength);
                
                // Reflection (simplified - use skyColor)
                vec3 reflection = skyColor;
                
                // Refraction/water color (depth-based)
                float depth = max(0.0, -vWorldPos.y / depthFactor);
                vec3 waterTint = mix(shallowColor, deepColor, min(1.0, depth));
                
                // Combine reflection and refraction
                vec3 finalColor = mix(waterTint, reflection, fresnel * reflectionStrength);
                
                // Foam at wave peaks
                float foam = smoothstep(foamThreshold, 1.0, abs(vWaveHeight));
                finalColor = mix(finalColor, foamColor, foam);
                
                // Specular highlight
                vec3 reflectDir = reflect(-sunDirection, normal);
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 128.0);
                finalColor += vec3(spec) * 0.5;
                
                // Alpha (more transparent in shallow water)
                float alpha = mix(0.8, 1.0, min(1.0, depth * 0.5));
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;
    }

    /**
     * Update sun direction for lighting
     * @param {THREE.Vector3} direction 
     */
    setSunDirection(direction) {
        this.waterMaterial.uniforms.sunDirection.value.copy(direction).normalize();
    }

    /**
     * Dispose of water resources
     */
    dispose() {
        if (this.waterMesh) {
            this.waterMesh.geometry.dispose();
            this.waterMaterial.dispose();
            this.scene.remove(this.waterMesh);
        }
        this.buoyancyObjects.clear();
    }
}
