/**
 * SSGIPass - Screen Space Global Illumination
 * Provides indirect lighting through screen-space ray tracing
 * Uses horizon-based ambient occlusion with color bleeding
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * SSGI Shader - Screen Space Global Illumination
 */
const SSGIShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tDepth': { value: null },
        'tNormal': { value: null },
        'cameraNear': { value: 0.1 },
        'cameraFar': { value: 1000.0 },
        'resolution': { value: new THREE.Vector2() },
        'cameraProjectionMatrix': { value: new THREE.Matrix4() },
        'cameraInverseProjectionMatrix': { value: new THREE.Matrix4() },
        'viewMatrix': { value: new THREE.Matrix4() },
        'inverseViewMatrix': { value: new THREE.Matrix4() },
        // SSGI parameters
        'intensity': { value: 1.0 },
        'radius': { value: 3.0 },
        'samples': { value: 16 },
        'maxDistance': { value: 10.0 },
        'thickness': { value: 0.5 },
        'falloff': { value: 1.0 },
        'bounceIntensity': { value: 0.5 },
        'frame': { value: 0 }
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
        uniform sampler2D tNormal;
        
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform mat4 cameraProjectionMatrix;
        uniform mat4 cameraInverseProjectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 inverseViewMatrix;
        
        uniform float intensity;
        uniform float radius;
        uniform int samples;
        uniform float maxDistance;
        uniform float thickness;
        uniform float falloff;
        uniform float bounceIntensity;
        uniform int frame;
        
        varying vec2 vUv;
        
        const float PI = 3.14159265359;
        const float TWO_PI = 6.28318530718;
        
        // Hash functions for noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        vec2 hash2(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453);
        }
        
        // Reconstruct view-space position from depth
        vec3 getViewPosition(vec2 uv, float depth) {
            vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 viewPos = cameraInverseProjectionMatrix * clipPos;
            return viewPos.xyz / viewPos.w;
        }
        
        // Get linear depth from depth buffer
        float getLinearDepth(float depth) {
            return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        // Cosine-weighted hemisphere sample
        vec3 cosineSampleHemisphere(vec2 xi) {
            float phi = TWO_PI * xi.x;
            float cosTheta = sqrt(1.0 - xi.y);
            float sinTheta = sqrt(xi.y);
            return vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
        }
        
        // Create orthonormal basis from normal
        mat3 createTBN(vec3 normal) {
            vec3 up = abs(normal.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 tangent = normalize(cross(up, normal));
            vec3 bitangent = cross(normal, tangent);
            return mat3(tangent, bitangent, normal);
        }
        
        // Screen-space ray march
        vec4 traceRay(vec3 origin, vec3 direction, vec2 noise) {
            float stepSize = maxDistance / float(samples);
            vec3 rayPos = origin + direction * stepSize * noise.x;
            
            for (int i = 0; i < 32; i++) {
                if (i >= samples) break;
                
                rayPos += direction * stepSize;
                
                // Project to screen space
                vec4 projectedPos = cameraProjectionMatrix * vec4(rayPos, 1.0);
                projectedPos.xyz /= projectedPos.w;
                vec2 screenUV = projectedPos.xy * 0.5 + 0.5;
                
                // Check bounds
                if (screenUV.x < 0.0 || screenUV.x > 1.0 || 
                    screenUV.y < 0.0 || screenUV.y > 1.0) {
                    break;
                }
                
                // Sample depth at this position
                float sampleDepth = texture2D(tDepth, screenUV).x;
                float linearSampleDepth = getLinearDepth(sampleDepth);
                float rayDepth = -rayPos.z;
                
                // Check for intersection with thickness tolerance
                if (rayDepth > linearSampleDepth && rayDepth < linearSampleDepth + thickness) {
                    // Hit! Sample color and calculate contribution
                    vec4 color = texture2D(tDiffuse, screenUV);
                    
                    // Distance attenuation
                    float dist = length(rayPos - origin);
                    float attenuation = 1.0 - pow(clamp(dist / maxDistance, 0.0, 1.0), falloff);
                    
                    // Edge fade
                    vec2 edgeFade = smoothstep(0.0, 0.1, screenUV) * smoothstep(1.0, 0.9, screenUV);
                    float screenFade = edgeFade.x * edgeFade.y;
                    
                    color.rgb *= attenuation * screenFade * bounceIntensity;
                    color.a = attenuation * screenFade;
                    
                    return color;
                }
            }
            
            return vec4(0.0);
        }
        
        void main() {
            vec4 diffuse = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).x;
            
            // Skip background
            if (depth >= 1.0) {
                gl_FragColor = diffuse;
                return;
            }
            
            // Get view-space position and normal
            vec3 viewPos = getViewPosition(vUv, depth);
            vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
            vec3 viewNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
            
            // Create TBN matrix for hemisphere sampling
            mat3 tbn = createTBN(viewNormal);
            
            // Accumulate indirect lighting
            vec3 indirect = vec3(0.0);
            float ao = 0.0;
            float hitCount = 0.0;
            
            // Noise for jittering
            vec2 noise = hash2(vUv * resolution + float(frame) * 0.1);
            
            // Trace rays in hemisphere
            for (int i = 0; i < 16; i++) {
                if (i >= samples) break;
                
                // Generate sample direction
                vec2 xi = hash2(vUv * resolution * float(i + 1) + noise);
                vec3 sampleDir = tbn * cosineSampleHemisphere(xi);
                
                // Scale by radius
                vec3 rayDir = normalize(sampleDir) * radius;
                
                // Trace ray
                vec4 hitColor = traceRay(viewPos, rayDir, noise);
                
                if (hitColor.a > 0.0) {
                    indirect += hitColor.rgb;
                    ao += 1.0;
                    hitCount += 1.0;
                }
            }
            
            // Normalize
            indirect /= float(samples);
            ao = 1.0 - (ao / float(samples));
            
            // Combine direct and indirect lighting
            vec3 result = diffuse.rgb;
            
            // Add indirect bounce
            result += indirect * intensity;
            
            // Apply ambient occlusion
            result *= mix(1.0, ao, intensity * 0.5);
            
            gl_FragColor = vec4(result, diffuse.a);
        }
    `
};

/**
 * Temporal Blend Shader - Reduces noise by blending with previous frame
 */
const TemporalBlendShader = {
    uniforms: {
        'tCurrent': { value: null },
        'tPrevious': { value: null },
        'blendFactor': { value: 0.9 }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tCurrent;
        uniform sampler2D tPrevious;
        uniform float blendFactor;
        varying vec2 vUv;
        
        void main() {
            vec4 current = texture2D(tCurrent, vUv);
            vec4 previous = texture2D(tPrevious, vUv);
            gl_FragColor = mix(current, previous, blendFactor);
        }
    `
};

/**
 * SSGIPass - Adds screen space global illumination to the scene
 */
export class SSGIPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;

        // Settings
        this.enabled = true;
        this.intensity = options.intensity ?? 1.0;
        this.radius = options.radius ?? 3.0;
        this.samples = options.samples ?? 16;
        this.maxDistance = options.maxDistance ?? 10.0;
        this.thickness = options.thickness ?? 0.5;
        this.falloff = options.falloff ?? 1.0;
        this.bounceIntensity = options.bounceIntensity ?? 0.5;
        this.temporalBlend = options.temporalBlend ?? 0.9;

        // Frame counter for temporal noise
        this.frame = 0;

        // Get initial size
        const size = new THREE.Vector2();
        if (options.renderer) {
            options.renderer.getSize(size);
        } else {
            size.set(window.innerWidth, window.innerHeight);
        }

        // Render targets
        this.depthRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        this.depthRenderTarget.depthTexture = new THREE.DepthTexture();
        this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

        this.normalRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // Temporal buffers for denoising
        this.ssgiRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        this.previousRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // SSGI material
        this.ssgiMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(SSGIShader.uniforms),
            vertexShader: SSGIShader.vertexShader,
            fragmentShader: SSGIShader.fragmentShader
        });

        // Temporal blend material
        this.temporalMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(TemporalBlendShader.uniforms),
            vertexShader: TemporalBlendShader.vertexShader,
            fragmentShader: TemporalBlendShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.ssgiMaterial);
        this.temporalQuad = new FullScreenQuad(this.temporalMaterial);

        // Normal material for GBuffer pass
        this.normalMaterial = new THREE.MeshNormalMaterial();

        // Store original materials
        this._originalMaterials = new Map();
    }

    /**
     * Set quality preset
     * @param {'low'|'medium'|'high'|'ultra'} preset
     */
    setQuality(preset) {
        switch (preset) {
            case 'low':
                this.samples = 8;
                this.radius = 2.0;
                this.maxDistance = 5.0;
                break;
            case 'medium':
                this.samples = 16;
                this.radius = 3.0;
                this.maxDistance = 10.0;
                break;
            case 'high':
                this.samples = 24;
                this.radius = 4.0;
                this.maxDistance = 15.0;
                break;
            case 'ultra':
                this.samples = 32;
                this.radius = 5.0;
                this.maxDistance = 20.0;
                break;
        }
    }

    setSize(width, height) {
        this.depthRenderTarget.setSize(width, height);
        this.normalRenderTarget.setSize(width, height);
        this.ssgiRenderTarget.setSize(width, height);
        this.previousRenderTarget.setSize(width, height);
        this.ssgiMaterial.uniforms.resolution.value.set(width, height);
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
        // Update frame counter
        this.frame++;

        // Store original render target
        const originalRenderTarget = renderer.getRenderTarget();
        const originalAutoClear = renderer.autoClear;

        // Update SSGI uniforms
        const uniforms = this.ssgiMaterial.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        uniforms.tNormal.value = this.normalRenderTarget.texture;
        uniforms.cameraNear.value = this.camera.near;
        uniforms.cameraFar.value = this.camera.far;
        uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
        uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
        uniforms.viewMatrix.value.copy(this.camera.matrixWorldInverse);
        uniforms.inverseViewMatrix.value.copy(this.camera.matrixWorld);
        uniforms.intensity.value = this.intensity;
        uniforms.radius.value = this.radius;
        uniforms.samples.value = this.samples;
        uniforms.maxDistance.value = this.maxDistance;
        uniforms.thickness.value = this.thickness;
        uniforms.falloff.value = this.falloff;
        uniforms.bounceIntensity.value = this.bounceIntensity;
        uniforms.frame.value = this.frame;

        // Render GBuffer passes
        this._renderGBuffer(renderer);

        // Render SSGI to intermediate buffer
        renderer.setRenderTarget(this.ssgiRenderTarget);
        renderer.clear();
        this.fsQuad.material = this.ssgiMaterial;
        this.fsQuad.render(renderer);

        // Apply temporal blending for denoising
        this.temporalMaterial.uniforms.tCurrent.value = this.ssgiRenderTarget.texture;
        this.temporalMaterial.uniforms.tPrevious.value = this.previousRenderTarget.texture;
        this.temporalMaterial.uniforms.blendFactor.value = this.temporalBlend;

        // Render final output
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.temporalQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.temporalQuad.render(renderer);
        }

        // Swap buffers for next frame
        const temp = this.previousRenderTarget;
        this.previousRenderTarget = this.ssgiRenderTarget;
        this.ssgiRenderTarget = temp;

        // Restore state
        renderer.setRenderTarget(originalRenderTarget);
        renderer.autoClear = originalAutoClear;
    }

    _renderGBuffer(renderer) {
        // Render depth
        renderer.setRenderTarget(this.depthRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // Swap to normal material and render normals
        this._swapMaterials(true);
        renderer.setRenderTarget(this.normalRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);
        this._swapMaterials(false);
    }

    _swapMaterials(toNormal) {
        this.scene.traverse((object) => {
            if (object.isMesh) {
                if (toNormal) {
                    this._originalMaterials.set(object.uuid, object.material);
                    object.material = this.normalMaterial;
                } else {
                    const original = this._originalMaterials.get(object.uuid);
                    if (original) {
                        object.material = original;
                    }
                }
            }
        });

        if (!toNormal) {
            this._originalMaterials.clear();
        }
    }

    dispose() {
        this.depthRenderTarget.dispose();
        this.normalRenderTarget.dispose();
        this.ssgiRenderTarget.dispose();
        this.previousRenderTarget.dispose();
        this.ssgiMaterial.dispose();
        this.temporalMaterial.dispose();
        this.fsQuad.dispose();
        this.temporalQuad.dispose();
        this.normalMaterial.dispose();
    }
}

export { SSGIShader, TemporalBlendShader };
export default SSGIPass;
