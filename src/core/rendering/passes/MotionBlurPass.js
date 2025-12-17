/**
 * MotionBlurPass - Per-object motion blur using velocity buffer
 * Samples along motion vectors to create cinematic blur
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Motion Blur Shader
 */
const MotionBlurShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tVelocity': { value: null },
        'tDepth': { value: null },
        'resolution': { value: new THREE.Vector2() },
        'intensity': { value: 1.0 },
        'samples': { value: 16 },
        'maxVelocity': { value: 32.0 },
        'cameraNear': { value: 0.1 },
        'cameraFar': { value: 1000.0 }
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
        uniform sampler2D tVelocity;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform float intensity;
        uniform int samples;
        uniform float maxVelocity;
        uniform float cameraNear;
        uniform float cameraFar;
        
        varying vec2 vUv;
        
        // Reconstruct linear depth
        float getLinearDepth(float depth) {
            return cameraNear * cameraFar / (cameraFar - depth * (cameraFar - cameraNear));
        }
        
        void main() {
            // Sample velocity
            vec2 velocity = texture2D(tVelocity, vUv).xy;
            
            // Scale and clamp velocity
            velocity *= intensity;
            float velocityLength = length(velocity * resolution);
            if (velocityLength > maxVelocity) {
                velocity = normalize(velocity) * maxVelocity / resolution;
            }
            
            // Early exit for static pixels
            if (velocityLength < 0.5) {
                gl_FragColor = texture2D(tDiffuse, vUv);
                return;
            }
            
            // Accumulate samples along velocity direction
            vec4 color = vec4(0.0);
            float totalWeight = 0.0;
            
            float sampleCount = float(samples);
            float centerDepth = getLinearDepth(texture2D(tDepth, vUv).x);
            
            for (int i = 0; i < 32; i++) { // Max samples compile-time bound
                if (i >= samples) break;
                
                float t = (float(i) / sampleCount) - 0.5;
                vec2 sampleUV = vUv + velocity * t;
                
                // Bounds check
                if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || 
                    sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;
                
                // Depth-aware weighting (softer blur for depth discontinuities)
                float sampleDepth = getLinearDepth(texture2D(tDepth, sampleUV).x);
                float depthDiff = abs(centerDepth - sampleDepth);
                float depthWeight = 1.0 / (1.0 + depthDiff * 0.1);
                
                // Distance from center weighting (bell curve)
                float distWeight = 1.0 - abs(t) * 2.0;
                distWeight = distWeight * distWeight;
                
                float weight = depthWeight * distWeight;
                color += texture2D(tDiffuse, sampleUV) * weight;
                totalWeight += weight;
            }
            
            if (totalWeight > 0.0) {
                color /= totalWeight;
            } else {
                color = texture2D(tDiffuse, vUv);
            }
            
            gl_FragColor = color;
        }
    `
};

/**
 * Velocity shader for per-object motion vectors
 */
const VelocityShader = {
    uniforms: {
        'currentWorldMatrix': { value: new THREE.Matrix4() },
        'previousWorldMatrix': { value: new THREE.Matrix4() },
        'currentViewProjection': { value: new THREE.Matrix4() },
        'previousViewProjection': { value: new THREE.Matrix4() }
    },

    vertexShader: /* glsl */`
        uniform mat4 currentWorldMatrix;
        uniform mat4 previousWorldMatrix;
        uniform mat4 currentViewProjection;
        uniform mat4 previousViewProjection;
        
        varying vec4 vCurrentPos;
        varying vec4 vPreviousPos;
        
        void main() {
            // Current frame position
            vec4 worldPos = currentWorldMatrix * vec4(position, 1.0);
            vCurrentPos = currentViewProjection * worldPos;
            
            // Previous frame position (using previous world matrix if available)
            vec4 prevWorldPos = previousWorldMatrix * vec4(position, 1.0);
            vPreviousPos = previousViewProjection * prevWorldPos;
            
            gl_Position = vCurrentPos;
        }
    `,

    fragmentShader: /* glsl */`
        varying vec4 vCurrentPos;
        varying vec4 vPreviousPos;
        
        void main() {
            // Calculate screen-space velocity
            vec2 current = (vCurrentPos.xy / vCurrentPos.w) * 0.5 + 0.5;
            vec2 previous = (vPreviousPos.xy / vPreviousPos.w) * 0.5 + 0.5;
            vec2 velocity = current - previous;
            
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `
};

/**
 * MotionBlurPass - Cinematic per-object motion blur
 */
export class MotionBlurPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;
        this.enabled = true;

        // Settings
        this.intensity = options.intensity ?? 1.0;
        this.samples = options.samples ?? 16;
        this.maxVelocity = options.maxVelocity ?? 32.0;

        // Create render targets
        const size = options.renderer ?
            new THREE.Vector2() :
            new THREE.Vector2(window.innerWidth, window.innerHeight);

        if (options.renderer) {
            options.renderer.getSize(size);
        }

        // Velocity buffer
        this.velocityRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // Motion blur material
        this.blurMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(MotionBlurShader.uniforms),
            vertexShader: MotionBlurShader.vertexShader,
            fragmentShader: MotionBlurShader.fragmentShader
        });

        // Velocity material
        this.velocityMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(VelocityShader.uniforms),
            vertexShader: VelocityShader.vertexShader,
            fragmentShader: VelocityShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.blurMaterial);

        // Camera matrices
        this.previousViewProjection = new THREE.Matrix4();
        this.currentViewProjection = new THREE.Matrix4();

        // Object tracking for per-object motion
        this._previousWorldMatrices = new Map();
        this._originalMaterials = new Map();

        // First frame flag
        this.isFirstFrame = true;
    }

    setSize(width, height) {
        this.velocityRenderTarget.setSize(width, height);
        this.blurMaterial.uniforms.resolution.value.set(width, height);
    }

    /**
     * Configure motion blur settings
     */
    setSettings(options) {
        if (options.intensity !== undefined) {
            this.intensity = options.intensity;
        }
        if (options.samples !== undefined) {
            this.samples = Math.min(32, Math.max(4, options.samples));
        }
        if (options.maxVelocity !== undefined) {
            this.maxVelocity = options.maxVelocity;
        }
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        // Update camera matrices
        this.currentViewProjection.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );

        // Render velocity buffer
        this._renderVelocity(renderer);

        // Update blur material uniforms
        this.blurMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this.blurMaterial.uniforms.tVelocity.value = this.velocityRenderTarget.texture;
        this.blurMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
        this.blurMaterial.uniforms.intensity.value = this.intensity;
        this.blurMaterial.uniforms.samples.value = this.samples;
        this.blurMaterial.uniforms.maxVelocity.value = this.maxVelocity;
        this.blurMaterial.uniforms.cameraNear.value = this.camera.near;
        this.blurMaterial.uniforms.cameraFar.value = this.camera.far;

        // Render motion blur
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }

        // Store matrices for next frame
        this.previousViewProjection.copy(this.currentViewProjection);
        this._storePreviousWorldMatrices();
        this.isFirstFrame = false;
    }

    _renderVelocity(renderer) {
        // Update velocity material with camera matrices
        this.velocityMaterial.uniforms.currentViewProjection.value.copy(this.currentViewProjection);
        this.velocityMaterial.uniforms.previousViewProjection.value.copy(
            this.isFirstFrame ? this.currentViewProjection : this.previousViewProjection
        );

        // Swap to velocity materials
        this._swapMaterials(true);

        renderer.setRenderTarget(this.velocityRenderTarget);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // Restore original materials
        this._swapMaterials(false);
    }

    _swapMaterials(toVelocity) {
        this.scene.traverse((object) => {
            if (object.isMesh && object.visible) {
                if (toVelocity) {
                    // Store original material
                    this._originalMaterials.set(object.uuid, object.material);

                    // Create velocity material instance with per-object matrices
                    const velMat = this.velocityMaterial.clone();
                    velMat.uniforms.currentWorldMatrix.value.copy(object.matrixWorld);

                    // Use previous matrix if available, otherwise current
                    const prevMatrix = this._previousWorldMatrices.get(object.uuid);
                    if (prevMatrix && !this.isFirstFrame) {
                        velMat.uniforms.previousWorldMatrix.value.copy(prevMatrix);
                    } else {
                        velMat.uniforms.previousWorldMatrix.value.copy(object.matrixWorld);
                    }

                    object.material = velMat;
                } else {
                    // Restore original material
                    const original = this._originalMaterials.get(object.uuid);
                    if (original) {
                        object.material = original;
                    }
                }
            }
        });

        if (!toVelocity) {
            this._originalMaterials.clear();
        }
    }

    _storePreviousWorldMatrices() {
        this.scene.traverse((object) => {
            if (object.isMesh && object.visible) {
                if (!this._previousWorldMatrices.has(object.uuid)) {
                    this._previousWorldMatrices.set(object.uuid, new THREE.Matrix4());
                }
                this._previousWorldMatrices.get(object.uuid).copy(object.matrixWorld);
            }
        });
    }

    dispose() {
        this.velocityRenderTarget.dispose();
        this.blurMaterial.dispose();
        this.velocityMaterial.dispose();
        this.fsQuad.dispose();
        this._previousWorldMatrices.clear();
    }
}

export { MotionBlurShader, VelocityShader };
export default MotionBlurPass;
