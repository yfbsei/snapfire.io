/**
 * VolumetricPass - Volumetric Lighting and Fog
 * Creates god rays, volumetric fog, and atmospheric scattering effects
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Volumetric Light Shader - Ray marching through volume
 */
const VolumetricLightShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tDepth': { value: null },
        'lightPosition': { value: new THREE.Vector3(0, 100, 0) },
        'lightColor': { value: new THREE.Color(1, 1, 1) },
        'lightIntensity': { value: 1.0 },
        'cameraNear': { value: 0.1 },
        'cameraFar': { value: 1000.0 },
        'cameraPosition': { value: new THREE.Vector3() },
        'viewMatrix': { value: new THREE.Matrix4() },
        'projectionMatrixInverse': { value: new THREE.Matrix4() },
        'resolution': { value: new THREE.Vector2() },

        // Volumetric settings
        'density': { value: 0.01 },
        'weight': { value: 1.0 },
        'decay': { value: 0.96 },
        'exposure': { value: 0.3 },
        'samples': { value: 64 },
        'maxDistance': { value: 100.0 },

        // Fog settings
        'fogEnabled': { value: true },
        'fogColor': { value: new THREE.Color(0.7, 0.8, 0.9) },
        'fogDensity': { value: 0.0025 },
        'fogHeight': { value: 50.0 },
        'fogFalloff': { value: 0.1 },

        // Noise for variation
        'time': { value: 0.0 },
        'noiseScale': { value: 0.1 },
        'noiseSpeed': { value: 0.05 }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        
        uniform vec3 lightPosition;
        uniform vec3 lightColor;
        uniform float lightIntensity;
        
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec3 cameraPosition;
        uniform mat4 viewMatrix;
        uniform mat4 projectionMatrixInverse;
        uniform vec2 resolution;
        
        uniform float density;
        uniform float weight;
        uniform float decay;
        uniform float exposure;
        uniform int samples;
        uniform float maxDistance;
        
        uniform bool fogEnabled;
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float fogHeight;
        uniform float fogFalloff;
        
        uniform float time;
        uniform float noiseScale;
        uniform float noiseSpeed;
        
        varying vec2 vUv;
        
        // Simplex noise functions
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
        
        float snoise(vec3 v) {
            const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0) * 2.0 + 1.0;
            vec4 s1 = floor(b1) * 2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
            
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }
        
        // Get linear depth
        float getLinearDepth(vec2 uv) {
            float depth = texture2D(tDepth, uv).x;
            return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        // Reconstruct world position from UV and depth
        vec3 getWorldPosition(vec2 uv, float depth) {
            vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 viewPos = projectionMatrixInverse * clipPos;
            viewPos /= viewPos.w;
            vec4 worldPos = inverse(viewMatrix) * viewPos;
            return worldPos.xyz;
        }
        
        // Phase function for scattering (Henyey-Greenstein)
        float henyeyGreenstein(float cosTheta, float g) {
            float g2 = g * g;
            return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
        }
        
        // Height-based fog density
        float getHeightFogDensity(vec3 pos) {
            if (!fogEnabled) return 0.0;
            float h = max(0.0, pos.y);
            return fogDensity * exp(-h * fogFalloff);
        }
        
        // Sample volumetric fog with noise
        float sampleVolume(vec3 pos) {
            float baseDensity = density;
            
            // Add noise for variation
            vec3 noisePos = pos * noiseScale + vec3(time * noiseSpeed);
            float noise = snoise(noisePos) * 0.5 + 0.5;
            
            // Height-based density falloff
            float heightFactor = exp(-max(0.0, pos.y - fogHeight) * fogFalloff);
            
            return baseDensity * noise * heightFactor;
        }
        
        void main() {
            vec4 sceneColor = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).x;
            float linearDepth = getLinearDepth(vUv);
            
            // Get world position
            vec3 worldPos = getWorldPosition(vUv, depth);
            
            // Direction from camera to world position
            vec3 rayDir = normalize(worldPos - cameraPosition);
            
            // Direction to light
            vec3 lightDir = normalize(lightPosition - cameraPosition);
            
            // Phase function value
            float phase = henyeyGreenstein(dot(rayDir, lightDir), 0.5);
            
            // Ray march through volume
            float stepSize = min(linearDepth, maxDistance) / float(samples);
            vec3 currentPos = cameraPosition;
            float accumLight = 0.0;
            float transmittance = 1.0;
            float fogAccum = 0.0;
            
            for (int i = 0; i < 64; i++) {
                if (i >= samples) break;
                
                currentPos += rayDir * stepSize;
                
                // Check if we've gone past the scene geometry
                float dist = length(currentPos - cameraPosition);
                if (dist > linearDepth) break;
                
                // Sample volume density
                float sampleDensity = sampleVolume(currentPos);
                
                // Light attenuation from sample position to light
                float lightDist = length(lightPosition - currentPos);
                float lightAtten = 1.0 / (1.0 + lightDist * lightDist * 0.001);
                
                // Accumulate in-scattered light
                float inScatter = sampleDensity * lightAtten * phase * lightIntensity;
                accumLight += inScatter * transmittance * stepSize;
                
                // Update transmittance (Beer's law)
                transmittance *= exp(-sampleDensity * stepSize);
                
                // Height fog accumulation
                fogAccum += getHeightFogDensity(currentPos) * stepSize;
                
                // Early exit if transmittance is too low
                if (transmittance < 0.01) break;
            }
            
            // Apply volumetric lighting
            vec3 volumetricLight = lightColor * accumLight * exposure;
            
            // Apply height fog
            vec3 fogResult = sceneColor.rgb;
            if (fogEnabled) {
                float fogFactor = 1.0 - exp(-fogAccum);
                fogResult = mix(sceneColor.rgb, fogColor, fogFactor);
            }
            
            // Combine scene with volumetric effects
            vec3 finalColor = fogResult + volumetricLight;
            
            gl_FragColor = vec4(finalColor, sceneColor.a);
        }
    `
};

/**
 * VolumetricPass - Adds volumetric lighting and fog to the scene
 */
export class VolumetricPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;

        // Light settings
        this.lightPosition = options.lightPosition || new THREE.Vector3(50, 100, 50);
        this.lightColor = options.lightColor || new THREE.Color(1.0, 0.95, 0.8);
        this.lightIntensity = options.lightIntensity ?? 1.0;

        // Volumetric settings
        this.density = options.density ?? 0.01;
        this.samples = options.samples ?? 64;
        this.maxDistance = options.maxDistance ?? 100.0;
        this.exposure = options.exposure ?? 0.3;

        // Fog settings
        this.fogEnabled = options.fogEnabled ?? true;
        this.fogColor = options.fogColor || new THREE.Color(0.7, 0.8, 0.9);
        this.fogDensity = options.fogDensity ?? 0.0025;
        this.fogHeight = options.fogHeight ?? 50.0;
        this.fogFalloff = options.fogFalloff ?? 0.1;

        // Time for animation
        this.time = 0;

        // Create render targets
        const size = new THREE.Vector2();
        if (options.renderer) {
            options.renderer.getSize(size);
        } else {
            size.set(window.innerWidth, window.innerHeight);
        }

        // Depth render target
        this.depthRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat
        });
        this.depthRenderTarget.depthTexture = new THREE.DepthTexture();
        this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

        // Volumetric material
        this.volumetricMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(VolumetricLightShader.uniforms),
            vertexShader: VolumetricLightShader.vertexShader,
            fragmentShader: VolumetricLightShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.volumetricMaterial);
    }

    /**
     * Set the sun/directional light for volumetric lighting
     * @param {THREE.DirectionalLight} light 
     */
    setSunLight(light) {
        if (light && light.isDirectionalLight) {
            this.lightPosition.copy(light.position);
            this.lightColor.copy(light.color);
            this.lightIntensity = light.intensity;
        }
    }

    /**
     * Set fog parameters
     */
    setFog(options = {}) {
        if (options.enabled !== undefined) this.fogEnabled = options.enabled;
        if (options.color) this.fogColor.copy(options.color);
        if (options.density !== undefined) this.fogDensity = options.density;
        if (options.height !== undefined) this.fogHeight = options.height;
        if (options.falloff !== undefined) this.fogFalloff = options.falloff;
    }

    setSize(width, height) {
        this.depthRenderTarget.setSize(width, height);
        this.volumetricMaterial.uniforms.resolution.value.set(width, height);
    }

    render(renderer, writeBuffer, readBuffer, deltaTime /*, maskActive */) {
        // Update time
        this.time += deltaTime;

        // Render depth pass
        const originalRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.depthRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(originalRenderTarget);

        // Update uniforms
        this.volumetricMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this.volumetricMaterial.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        this.volumetricMaterial.uniforms.lightPosition.value.copy(this.lightPosition);
        this.volumetricMaterial.uniforms.lightColor.value.copy(this.lightColor);
        this.volumetricMaterial.uniforms.lightIntensity.value = this.lightIntensity;
        this.volumetricMaterial.uniforms.cameraNear.value = this.camera.near;
        this.volumetricMaterial.uniforms.cameraFar.value = this.camera.far;
        this.volumetricMaterial.uniforms.cameraPosition.value.copy(this.camera.position);
        this.volumetricMaterial.uniforms.viewMatrix.value.copy(this.camera.matrixWorldInverse);
        this.volumetricMaterial.uniforms.projectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
        this.volumetricMaterial.uniforms.density.value = this.density;
        this.volumetricMaterial.uniforms.samples.value = this.samples;
        this.volumetricMaterial.uniforms.maxDistance.value = this.maxDistance;
        this.volumetricMaterial.uniforms.exposure.value = this.exposure;
        this.volumetricMaterial.uniforms.fogEnabled.value = this.fogEnabled;
        this.volumetricMaterial.uniforms.fogColor.value.copy(this.fogColor);
        this.volumetricMaterial.uniforms.fogDensity.value = this.fogDensity;
        this.volumetricMaterial.uniforms.fogHeight.value = this.fogHeight;
        this.volumetricMaterial.uniforms.fogFalloff.value = this.fogFalloff;
        this.volumetricMaterial.uniforms.time.value = this.time;

        // Render volumetric pass
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    dispose() {
        this.depthRenderTarget.dispose();
        this.volumetricMaterial.dispose();
        this.fsQuad.dispose();
    }
}

export { VolumetricLightShader };
export default VolumetricPass;
