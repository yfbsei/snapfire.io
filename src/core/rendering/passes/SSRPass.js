/**
 * SSRPass - Screen Space Reflections
 * High-quality reflections using screen-space ray marching
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * SSR (Screen Space Reflections) Shader
 */
const SSRShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tDepth': { value: null },
        'tNormal': { value: null },
        'tMetalRoughness': { value: null },
        'cameraNear': { value: 0.1 },
        'cameraFar': { value: 1000.0 },
        'resolution': { value: new THREE.Vector2() },
        'cameraProjectionMatrix': { value: new THREE.Matrix4() },
        'cameraInverseProjectionMatrix': { value: new THREE.Matrix4() },
        'viewMatrix': { value: new THREE.Matrix4() },
        'maxDistance': { value: 50.0 },
        'thickness': { value: 0.1 },
        'maxSteps': { value: 64 },
        'jitterSpread': { value: 0.1 },
        'fade': { value: 0.8 },
        'roughnessFade': { value: 0.8 },
        'intensity': { value: 1.0 }
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
        uniform sampler2D tMetalRoughness;
        
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform mat4 cameraProjectionMatrix;
        uniform mat4 cameraInverseProjectionMatrix;
        uniform mat4 viewMatrix;
        
        uniform float maxDistance;
        uniform float thickness;
        uniform int maxSteps;
        uniform float jitterSpread;
        uniform float fade;
        uniform float roughnessFade;
        uniform float intensity;
        
        varying vec2 vUv;
        
        // Reconstruct view-space position from depth
        vec3 getViewPosition(vec2 uv, float depth) {
            vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 viewPos = cameraInverseProjectionMatrix * clipPos;
            return viewPos.xyz / viewPos.w;
        }
        
        // Linear depth from depth buffer
        float getLinearDepth(vec2 uv) {
            float depth = texture2D(tDepth, uv).x;
            return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        // Hash function for jittering
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        // Screen-space ray marching
        vec4 rayMarch(vec3 origin, vec3 direction) {
            vec3 rayPos = origin;
            float stepSize = maxDistance / float(maxSteps);
            
            // Jitter the starting position
            float jitter = hash(vUv) * jitterSpread;
            rayPos += direction * jitter * stepSize;
            
            for (int i = 0; i < 64; i++) {
                if (i >= maxSteps) break;
                
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
                float sampleDepth = getLinearDepth(screenUV);
                float rayDepth = -rayPos.z;
                
                // Check for intersection
                if (rayDepth > sampleDepth && rayDepth < sampleDepth + thickness) {
                    // Calculate fade based on distance
                    float dist = length(rayPos - origin);
                    float distFade = 1.0 - clamp(dist / maxDistance, 0.0, 1.0);
                    
                    // Edge fade
                    vec2 edgeFade = smoothstep(0.0, 0.1, screenUV) * 
                                   smoothstep(1.0, 0.9, screenUV);
                    float screenFade = edgeFade.x * edgeFade.y;
                    
                    vec4 color = texture2D(tDiffuse, screenUV);
                    color.a = distFade * screenFade * fade;
                    
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
            
            // Get normal and metallic/roughness
            vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
            vec4 metalRoughness = texture2D(tMetalRoughness, vUv);
            float metallic = metalRoughness.b;
            float roughness = metalRoughness.g;
            
            // Only reflect on sufficiently smooth and metallic surfaces
            if (metallic < 0.1 || roughness > roughnessFade) {
                gl_FragColor = diffuse;
                return;
            }
            
            // Get view-space position and reflect direction
            vec3 viewPos = getViewPosition(vUv, depth);
            vec3 viewNormal = normalize((viewMatrix * vec4(normal, 0.0)).xyz);
            vec3 viewDir = normalize(viewPos);
            vec3 reflectDir = reflect(viewDir, viewNormal);
            
            // March the ray
            vec4 reflection = rayMarch(viewPos, reflectDir);
            
            // Blend based on metallic and roughness
            float reflectivity = metallic * (1.0 - roughness) * intensity;
            
            gl_FragColor = mix(diffuse, reflection, reflection.a * reflectivity);
        }
    `
};

/**
 * SSRPass - Adds screen space reflections to the scene
 */
export class SSRPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;

        // Settings
        this.enabled = true;
        this.intensity = options.intensity ?? 1.0;
        this.maxDistance = options.maxDistance ?? 50.0;
        this.thickness = options.thickness ?? 0.1;
        this.maxSteps = options.maxSteps ?? 64;
        this.roughnessFade = options.roughnessFade ?? 0.8;

        // Create render targets for GBuffer
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
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
        this.depthRenderTarget.depthTexture = new THREE.DepthTexture();
        this.depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;

        // Normal render target
        this.normalRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // SSR material
        this.ssrMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(SSRShader.uniforms),
            vertexShader: SSRShader.vertexShader,
            fragmentShader: SSRShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.ssrMaterial);

        // Normal material for GBuffer pass
        this.normalMaterial = new THREE.MeshNormalMaterial();

        // Store original materials
        this._originalMaterials = new Map();
    }

    setSize(width, height) {
        this.depthRenderTarget.setSize(width, height);
        this.normalRenderTarget.setSize(width, height);
        this.ssrMaterial.uniforms.resolution.value.set(width, height);
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
        // Store original render target and settings
        const originalRenderTarget = renderer.getRenderTarget();
        const originalAutoClear = renderer.autoClear;

        // Update uniforms
        this.ssrMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this.ssrMaterial.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        this.ssrMaterial.uniforms.tNormal.value = this.normalRenderTarget.texture;
        this.ssrMaterial.uniforms.cameraNear.value = this.camera.near;
        this.ssrMaterial.uniforms.cameraFar.value = this.camera.far;
        this.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
        this.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
        this.ssrMaterial.uniforms.viewMatrix.value.copy(this.camera.matrixWorldInverse);
        this.ssrMaterial.uniforms.maxDistance.value = this.maxDistance;
        this.ssrMaterial.uniforms.thickness.value = this.thickness;
        this.ssrMaterial.uniforms.maxSteps.value = this.maxSteps;
        this.ssrMaterial.uniforms.roughnessFade.value = this.roughnessFade;
        this.ssrMaterial.uniforms.intensity.value = this.intensity;

        // Render GBuffer passes
        this._renderGBuffer(renderer);

        // Restore render target
        renderer.setRenderTarget(originalRenderTarget);
        renderer.autoClear = originalAutoClear;

        // Render SSR
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
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
        this.ssrMaterial.dispose();
        this.fsQuad.dispose();
        this.normalMaterial.dispose();
    }
}

export { SSRShader };
export default SSRPass;
