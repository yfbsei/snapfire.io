/**
 * ContactShadowsPass - Screen-space contact shadows
 * Adds soft shadows for small details and ground contact
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Contact Shadows Shader
 */
const ContactShadowShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tDepth': { value: null },
        'cameraNear': { value: 0.1 },
        'cameraFar': { value: 1000.0 },
        'resolution': { value: new THREE.Vector2() },
        'cameraProjectionMatrix': { value: new THREE.Matrix4() },
        'cameraInverseProjectionMatrix': { value: new THREE.Matrix4() },
        'lightDirection': { value: new THREE.Vector3(0, -1, 0) },
        'shadowIntensity': { value: 0.5 },
        'shadowRadius': { value: 0.5 },
        'shadowSamples': { value: 16 },
        'maxDistance': { value: 0.3 },
        'thickness': { value: 0.05 },
        'groundLevel': { value: 0.0 }
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
        
        uniform float cameraNear;
        uniform float cameraFar;
        uniform vec2 resolution;
        uniform mat4 cameraProjectionMatrix;
        uniform mat4 cameraInverseProjectionMatrix;
        
        uniform vec3 lightDirection;
        uniform float shadowIntensity;
        uniform float shadowRadius;
        uniform int shadowSamples;
        uniform float maxDistance;
        uniform float thickness;
        uniform float groundLevel;
        
        varying vec2 vUv;
        
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        float getLinearDepth(float depth) {
            return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        vec3 getViewPosition(vec2 uv, float depth) {
            vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 viewPos = cameraInverseProjectionMatrix * clipPos;
            return viewPos.xyz / viewPos.w;
        }
        
        void main() {
            vec4 diffuse = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).x;
            
            // Skip background
            if (depth >= 1.0) {
                gl_FragColor = diffuse;
                return;
            }
            
            vec3 viewPos = getViewPosition(vUv, depth);
            float linearDepth = getLinearDepth(depth);
            
            // Calculate shadow contribution
            float shadow = 0.0;
            float noise = hash(vUv * resolution);
            
            // Project rays toward light and check for occlusion
            vec3 rayDir = normalize(-lightDirection);
            
            for (int i = 0; i < 16; i++) {
                if (i >= shadowSamples) break;
                
                float t = (float(i) + noise) / float(shadowSamples) * maxDistance;
                vec3 samplePos = viewPos + rayDir * t;
                
                // Add some randomness for soft shadows
                float angle = float(i) * 2.399963 + noise * 6.28318;
                vec2 offset = vec2(cos(angle), sin(angle)) * shadowRadius * (float(i) / float(shadowSamples));
                
                // Project to screen
                vec4 projPos = cameraProjectionMatrix * vec4(samplePos, 1.0);
                projPos.xyz /= projPos.w;
                vec2 sampleUV = projPos.xy * 0.5 + 0.5 + offset / resolution;
                
                // Check bounds
                if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
                    continue;
                }
                
                float sampleDepth = texture2D(tDepth, sampleUV).x;
                float linearSampleDepth = getLinearDepth(sampleDepth);
                float sampleZ = -samplePos.z;
                
                // Check if sample is occluded
                if (sampleZ > linearSampleDepth && sampleZ < linearSampleDepth + thickness) {
                    shadow += 1.0;
                }
            }
            
            shadow = shadow / float(shadowSamples);
            shadow = clamp(shadow * shadowIntensity, 0.0, 1.0);
            
            // Apply shadow
            vec3 result = diffuse.rgb * (1.0 - shadow);
            
            gl_FragColor = vec4(result, diffuse.a);
        }
    `
};

/**
 * ContactShadowsPass - Adds screen-space contact shadows
 */
export class ContactShadowsPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;

        // Settings
        this.enabled = true;
        this.intensity = options.intensity ?? 0.5;
        this.radius = options.radius ?? 0.5;
        this.samples = options.samples ?? 16;
        this.maxDistance = options.maxDistance ?? 0.3;
        this.thickness = options.thickness ?? 0.05;
        this.lightDirection = options.lightDirection ?? new THREE.Vector3(0, -1, 0);

        // Get size
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

        // Shadow material
        this.shadowMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(ContactShadowShader.uniforms),
            vertexShader: ContactShadowShader.vertexShader,
            fragmentShader: ContactShadowShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.shadowMaterial);
    }

    /**
     * Set light direction for contact shadows
     * @param {THREE.Vector3} direction
     */
    setLightDirection(direction) {
        this.lightDirection.copy(direction).normalize();
    }

    setSize(width, height) {
        this.depthRenderTarget.setSize(width, height);
        this.shadowMaterial.uniforms.resolution.value.set(width, height);
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
        // Store original state
        const originalRenderTarget = renderer.getRenderTarget();

        // Update uniforms
        const uniforms = this.shadowMaterial.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        uniforms.cameraNear.value = this.camera.near;
        uniforms.cameraFar.value = this.camera.far;
        uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
        uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
        uniforms.lightDirection.value.copy(this.lightDirection);
        uniforms.shadowIntensity.value = this.intensity;
        uniforms.shadowRadius.value = this.radius;
        uniforms.shadowSamples.value = this.samples;
        uniforms.maxDistance.value = this.maxDistance;
        uniforms.thickness.value = this.thickness;

        // Render depth pass
        renderer.setRenderTarget(this.depthRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // Render contact shadows
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }

        // Restore state
        renderer.setRenderTarget(originalRenderTarget);
    }

    dispose() {
        this.depthRenderTarget.dispose();
        this.shadowMaterial.dispose();
        this.fsQuad.dispose();
    }
}

export { ContactShadowShader };
export default ContactShadowsPass;
