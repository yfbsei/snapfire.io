/**
 * TAAPass - Temporal Anti-Aliasing
 * Reduces aliasing by accumulating samples over multiple frames
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * TAA Shader - Temporal accumulation with motion vectors
 */
const TAAShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tHistory': { value: null },
        'tDepth': { value: null },
        'tVelocity': { value: null },
        'resolution': { value: new THREE.Vector2() },
        'blendFactor': { value: 0.9 },
        'velocityScale': { value: 1.0 },
        'sharpness': { value: 0.25 },
        'jitterOffset': { value: new THREE.Vector2() }
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
        uniform sampler2D tHistory;
        uniform sampler2D tDepth;
        uniform sampler2D tVelocity;
        uniform vec2 resolution;
        uniform float blendFactor;
        uniform float velocityScale;
        uniform float sharpness;
        uniform vec2 jitterOffset;
        
        varying vec2 vUv;
        
        // Catmull-Rom weights
        vec4 cubic(float x) {
            float x2 = x * x;
            float x3 = x2 * x;
            vec4 w;
            w.x = -x3 + 3.0 * x2 - 3.0 * x + 1.0;
            w.y = 3.0 * x3 - 6.0 * x2 + 4.0;
            w.z = -3.0 * x3 + 3.0 * x2 + 3.0 * x + 1.0;
            w.w = x3;
            return w / 6.0;
        }
        
        // Bicubic sampling for history
        vec4 sampleBicubic(sampler2D tex, vec2 uv, vec2 texelSize) {
            vec2 pixel = uv / texelSize - 0.5;
            vec2 f = fract(pixel);
            pixel = floor(pixel);
            
            vec4 xcubic = cubic(f.x);
            vec4 ycubic = cubic(f.y);
            
            vec4 c = pixel.xxyy + vec2(-0.5, 1.5).xyxy;
            vec4 s = vec4(xcubic.xz + xcubic.yw, ycubic.xz + ycubic.yw);
            vec4 offset = c + vec4(xcubic.yw, ycubic.yw) / s;
            
            offset *= texelSize.xxyy;
            
            vec4 s1 = texture2D(tex, offset.xz);
            vec4 s2 = texture2D(tex, offset.yz);
            vec4 s3 = texture2D(tex, offset.xw);
            vec4 s4 = texture2D(tex, offset.yw);
            
            float sx = s.x / (s.x + s.y);
            float sy = s.z / (s.z + s.w);
            
            return mix(mix(s4, s3, sx), mix(s2, s1, sx), sy);
        }
        
        // RGB to YCoCg color space (better for temporal filtering)
        vec3 RGBToYCoCg(vec3 rgb) {
            return vec3(
                0.25 * rgb.r + 0.5 * rgb.g + 0.25 * rgb.b,
                0.5 * rgb.r - 0.5 * rgb.b,
                -0.25 * rgb.r + 0.5 * rgb.g - 0.25 * rgb.b
            );
        }
        
        vec3 YCoCgToRGB(vec3 ycocg) {
            return vec3(
                ycocg.x + ycocg.y - ycocg.z,
                ycocg.x + ycocg.z,
                ycocg.x - ycocg.y - ycocg.z
            );
        }
        
        // Neighborhood clamping to reduce ghosting
        vec3 clipAABB(vec3 color, vec3 minColor, vec3 maxColor) {
            vec3 center = 0.5 * (maxColor + minColor);
            vec3 extents = 0.5 * (maxColor - minColor);
            
            vec3 offset = color - center;
            vec3 ts = abs(extents) / max(abs(offset), vec3(0.0001));
            float t = clamp(min(min(ts.x, ts.y), ts.z), 0.0, 1.0);
            
            return center + offset * t;
        }
        
        void main() {
            vec2 texelSize = 1.0 / resolution;
            
            // Sample current frame (with jitter removed)
            vec2 jitteredUV = vUv + jitterOffset;
            vec4 current = texture2D(tDiffuse, jitteredUV);
            
            // Get velocity for reprojection
            vec2 velocity = texture2D(tVelocity, vUv).xy * velocityScale;
            vec2 historyUV = vUv - velocity;
            
            // Check if history UV is valid
            if (historyUV.x < 0.0 || historyUV.x > 1.0 || 
                historyUV.y < 0.0 || historyUV.y > 1.0) {
                gl_FragColor = current;
                return;
            }
            
            // Sample history with bicubic filtering
            vec4 history = sampleBicubic(tHistory, historyUV, texelSize);
            
            // Gather neighborhood for clamping (3x3)
            vec3 m1 = vec3(0.0);
            vec3 m2 = vec3(0.0);
            
            for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                    vec2 offset = vec2(float(x), float(y)) * texelSize;
                    vec3 sampleColor = texture2D(tDiffuse, jitteredUV + offset).rgb;
                    vec3 ycocg = RGBToYCoCg(sampleColor);
                    m1 += ycocg;
                    m2 += ycocg * ycocg;
                }
            }
            
            // Calculate variance-based AABB
            m1 /= 9.0;
            m2 /= 9.0;
            vec3 variance = sqrt(max(m2 - m1 * m1, vec3(0.0)));
            vec3 minColor = m1 - variance * 1.25;
            vec3 maxColor = m1 + variance * 1.25;
            
            // Clip history to neighborhood AABB
            vec3 historyYCoCg = RGBToYCoCg(history.rgb);
            historyYCoCg = clipAABB(historyYCoCg, minColor, maxColor);
            history.rgb = YCoCgToRGB(historyYCoCg);
            
            // Calculate blend factor based on velocity
            float velocityLength = length(velocity * resolution);
            float dynamicBlend = mix(blendFactor, 0.5, clamp(velocityLength / 10.0, 0.0, 1.0));
            
            // Blend current and history
            vec3 result = mix(current.rgb, history.rgb, dynamicBlend);
            
            // Optional sharpening
            if (sharpness > 0.0) {
                vec3 blur = (
                    texture2D(tDiffuse, jitteredUV + vec2(-texelSize.x, 0.0)).rgb +
                    texture2D(tDiffuse, jitteredUV + vec2(texelSize.x, 0.0)).rgb +
                    texture2D(tDiffuse, jitteredUV + vec2(0.0, -texelSize.y)).rgb +
                    texture2D(tDiffuse, jitteredUV + vec2(0.0, texelSize.y)).rgb
                ) * 0.25;
                result = result + (result - blur) * sharpness;
            }
            
            gl_FragColor = vec4(result, current.a);
        }
    `
};

/**
 * Velocity shader for motion vectors
 */
const VelocityShader = {
    uniforms: {
        'currentViewProjection': { value: new THREE.Matrix4() },
        'previousViewProjection': { value: new THREE.Matrix4() }
    },

    vertexShader: /* glsl */`
        uniform mat4 currentViewProjection;
        uniform mat4 previousViewProjection;
        
        varying vec4 vCurrentPos;
        varying vec4 vPreviousPos;
        
        void main() {
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vCurrentPos = currentViewProjection * worldPos;
            vPreviousPos = previousViewProjection * worldPos;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        varying vec4 vCurrentPos;
        varying vec4 vPreviousPos;
        
        void main() {
            vec2 current = (vCurrentPos.xy / vCurrentPos.w) * 0.5 + 0.5;
            vec2 previous = (vPreviousPos.xy / vPreviousPos.w) * 0.5 + 0.5;
            gl_FragColor = vec4(current - previous, 0.0, 1.0);
        }
    `
};

/**
 * Halton sequence for jitter
 */
function halton(index, base) {
    let result = 0;
    let f = 1;
    let i = index;
    while (i > 0) {
        f /= base;
        result += f * (i % base);
        i = Math.floor(i / base);
    }
    return result;
}

/**
 * TAAPass - Temporal Anti-Aliasing pass
 */
export class TAAPass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;

        // Settings
        this.enabled = true;
        this.blendFactor = options.blendFactor ?? 0.9;
        this.sharpness = options.sharpness ?? 0.25;

        // Jitter settings
        this.jitterEnabled = true;
        this.jitterSampleCount = 16;
        this.jitterIndex = 0;
        this.jitterOffsets = this._generateJitterSequence(this.jitterSampleCount);

        // Create render targets
        const size = new THREE.Vector2();
        if (options.renderer) {
            options.renderer.getSize(size);
        } else {
            size.set(window.innerWidth, window.innerHeight);
        }

        // History buffers (ping-pong)
        this.historyRenderTarget = [
            this._createRenderTarget(size.x, size.y),
            this._createRenderTarget(size.x, size.y)
        ];
        this.historyIndex = 0;

        // Velocity render target
        this.velocityRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });

        // TAA material
        this.taaMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(TAAShader.uniforms),
            vertexShader: TAAShader.vertexShader,
            fragmentShader: TAAShader.fragmentShader
        });

        // Velocity material
        this.velocityMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(VelocityShader.uniforms),
            vertexShader: VelocityShader.vertexShader,
            fragmentShader: VelocityShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.taaMaterial);

        // Store previous matrices
        this.previousViewProjection = new THREE.Matrix4();
        this.currentViewProjection = new THREE.Matrix4();

        // First frame flag
        this.isFirstFrame = true;

        // Store original materials
        this._originalMaterials = new Map();
    }

    _createRenderTarget(width, height) {
        return new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });
    }

    _generateJitterSequence(count) {
        const offsets = [];
        for (let i = 0; i < count; i++) {
            offsets.push(new THREE.Vector2(
                halton(i + 1, 2) - 0.5,
                halton(i + 1, 3) - 0.5
            ));
        }
        return offsets;
    }

    setSize(width, height) {
        this.historyRenderTarget[0].setSize(width, height);
        this.historyRenderTarget[1].setSize(width, height);
        this.velocityRenderTarget.setSize(width, height);
        this.taaMaterial.uniforms.resolution.value.set(width, height);
    }

    /**
     * Apply jitter to camera projection matrix
     * Call this before rendering the scene
     */
    applyJitter() {
        if (!this.jitterEnabled) return;

        const offset = this.jitterOffsets[this.jitterIndex];
        const width = this.taaMaterial.uniforms.resolution.value.x;
        const height = this.taaMaterial.uniforms.resolution.value.y;

        // Save current projection
        this._originalProjection = this.camera.projectionMatrix.clone();

        // Apply subpixel jitter
        const jitterX = (offset.x * 2.0) / width;
        const jitterY = (offset.y * 2.0) / height;

        this.camera.projectionMatrix.elements[8] += jitterX;
        this.camera.projectionMatrix.elements[9] += jitterY;

        // Store jitter offset for shader
        this.taaMaterial.uniforms.jitterOffset.value.set(
            offset.x / width,
            offset.y / height
        );

        // Advance jitter index
        this.jitterIndex = (this.jitterIndex + 1) % this.jitterSampleCount;
    }

    /**
     * Remove jitter from camera
     * Call this after rendering the scene
     */
    removeJitter() {
        if (!this.jitterEnabled || !this._originalProjection) return;
        this.camera.projectionMatrix.copy(this._originalProjection);
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
        // Update view projection matrices
        this.currentViewProjection.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );

        // Render velocity buffer
        this._renderVelocity(renderer);

        // Get history buffers
        const currentHistory = this.historyRenderTarget[this.historyIndex];
        const previousHistory = this.historyRenderTarget[1 - this.historyIndex];

        // Update uniforms
        this.taaMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this.taaMaterial.uniforms.tHistory.value = this.isFirstFrame ?
            readBuffer.texture : previousHistory.texture;
        this.taaMaterial.uniforms.tVelocity.value = this.velocityRenderTarget.texture;
        this.taaMaterial.uniforms.blendFactor.value = this.isFirstFrame ? 0.0 : this.blendFactor;
        this.taaMaterial.uniforms.sharpness.value = this.sharpness;

        // Render TAA
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);

            // Also copy to history
            renderer.setRenderTarget(currentHistory);
            this.fsQuad.render(renderer);
        } else {
            // Render to write buffer
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);

            // Copy to history
            renderer.setRenderTarget(currentHistory);
            this.fsQuad.render(renderer);
        }

        // Swap history buffers
        this.historyIndex = 1 - this.historyIndex;

        // Store current matrices for next frame
        this.previousViewProjection.copy(this.currentViewProjection);
        this.isFirstFrame = false;
    }

    _renderVelocity(renderer) {
        // Update velocity material uniforms
        this.velocityMaterial.uniforms.currentViewProjection.value.copy(this.currentViewProjection);
        this.velocityMaterial.uniforms.previousViewProjection.value.copy(this.previousViewProjection);

        // Swap materials and render
        this._swapMaterials(true);

        renderer.setRenderTarget(this.velocityRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        this._swapMaterials(false);
    }

    _swapMaterials(toVelocity) {
        this.scene.traverse((object) => {
            if (object.isMesh) {
                if (toVelocity) {
                    this._originalMaterials.set(object.uuid, object.material);
                    object.material = this.velocityMaterial;
                } else {
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

    dispose() {
        this.historyRenderTarget[0].dispose();
        this.historyRenderTarget[1].dispose();
        this.velocityRenderTarget.dispose();
        this.taaMaterial.dispose();
        this.velocityMaterial.dispose();
        this.fsQuad.dispose();
    }
}

export { TAAShader, VelocityShader, halton };
export default TAAPass;
