/**
 * TemporalUpscalePass - FSR-like Temporal Upscaling
 * Renders at lower resolution and reconstructs high-quality output
 */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Temporal Upscaling Shader
 * Uses motion vectors and history buffer for quality reconstruction
 */
const TemporalUpscaleShader = {
    uniforms: {
        'tLowRes': { value: null },          // Low resolution render
        'tHistory': { value: null },          // Previous frame (high res)
        'tVelocity': { value: null },         // Motion vectors
        'tDepth': { value: null },            // Depth buffer
        'resolution': { value: new THREE.Vector2() },      // Output resolution
        'lowResolution': { value: new THREE.Vector2() },   // Input resolution
        'jitterOffset': { value: new THREE.Vector2() },
        'sharpness': { value: 0.5 },
        'blendWeight': { value: 0.9 }
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tLowRes;
        uniform sampler2D tHistory;
        uniform sampler2D tVelocity;
        uniform sampler2D tDepth;
        uniform vec2 resolution;
        uniform vec2 lowResolution;
        uniform vec2 jitterOffset;
        uniform float sharpness;
        uniform float blendWeight;
        
        varying vec2 vUv;
        
        // Catmull-Rom interpolation for high-quality upscaling
        vec4 textureBicubic(sampler2D tex, vec2 uv, vec2 texelSize) {
            vec2 pixel = uv / texelSize - 0.5;
            vec2 f = fract(pixel);
            pixel = floor(pixel);
            
            // Weights
            vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
            vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
            vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
            vec2 w3 = f * f * (-0.5 + 0.5 * f);
            
            vec2 s0 = w0 + w1;
            vec2 s1 = w2 + w3;
            vec2 f0 = w1 / s0;
            vec2 f1 = w3 / s1;
            
            vec2 t0 = (pixel - 0.5 + f0) * texelSize;
            vec2 t1 = (pixel + 1.5 + f1) * texelSize;
            
            return (texture2D(tex, vec2(t0.x, t0.y)) * s0.x +
                    texture2D(tex, vec2(t1.x, t0.y)) * s1.x) * s0.y +
                   (texture2D(tex, vec2(t0.x, t1.y)) * s0.x +
                    texture2D(tex, vec2(t1.x, t1.y)) * s1.x) * s1.y;
        }
        
        // RGB to YCoCg for temporal accumulation
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
        
        // Neighborhood clamping
        vec3 clipToAABB(vec3 color, vec3 minC, vec3 maxC) {
            vec3 center = 0.5 * (maxC + minC);
            vec3 extents = 0.5 * (maxC - minC) + 0.001;
            vec3 offset = color - center;
            vec3 ts = abs(extents) / max(abs(offset), vec3(0.0001));
            float t = clamp(min(min(ts.x, ts.y), ts.z), 0.0, 1.0);
            return center + offset * t;
        }
        
        void main() {
            vec2 texelSize = 1.0 / resolution;
            vec2 lowTexelSize = 1.0 / lowResolution;
            
            // Get motion vector for reprojection
            vec2 velocity = texture2D(tVelocity, vUv).xy;
            vec2 historyUV = vUv - velocity;
            
            // Upscale low-res input using bicubic interpolation
            vec4 current = textureBicubic(tLowRes, vUv + jitterOffset * lowTexelSize, lowTexelSize);
            
            // Check history bounds
            if (historyUV.x < 0.0 || historyUV.x > 1.0 ||
                historyUV.y < 0.0 || historyUV.y > 1.0) {
                gl_FragColor = current;
                return;
            }
            
            // Sample history with high-quality filtering
            vec4 history = texture2D(tHistory, historyUV);
            
            // Neighborhood sampling for variance clamping
            vec3 m1 = vec3(0.0);
            vec3 m2 = vec3(0.0);
            
            for (int x = -1; x <= 1; x++) {
                for (int y = -1; y <= 1; y++) {
                    vec2 offset = vec2(float(x), float(y)) * lowTexelSize;
                    vec3 sampleColor = texture2D(tLowRes, vUv + offset).rgb;
                    vec3 ycocg = RGBToYCoCg(sampleColor);
                    m1 += ycocg;
                    m2 += ycocg * ycocg;
                }
            }
            
            m1 /= 9.0;
            m2 /= 9.0;
            vec3 sigma = sqrt(max(m2 - m1 * m1, vec3(0.0)));
            vec3 minC = m1 - sigma * 1.5;
            vec3 maxC = m1 + sigma * 1.5;
            
            // Clamp history to neighborhood
            vec3 historyYCoCg = RGBToYCoCg(history.rgb);
            historyYCoCg = clipToAABB(historyYCoCg, minC, maxC);
            history.rgb = YCoCgToRGB(historyYCoCg);
            
            // Blend current and history
            vec3 result = mix(current.rgb, history.rgb, blendWeight);
            
            // Edge-aware sharpening
            if (sharpness > 0.0) {
                vec3 blur = (
                    texture2D(tLowRes, vUv + vec2(-lowTexelSize.x, 0.0)).rgb +
                    texture2D(tLowRes, vUv + vec2(lowTexelSize.x, 0.0)).rgb +
                    texture2D(tLowRes, vUv + vec2(0.0, -lowTexelSize.y)).rgb +
                    texture2D(tLowRes, vUv + vec2(0.0, lowTexelSize.y)).rgb
                ) * 0.25;
                result += (result - blur) * sharpness;
            }
            
            gl_FragColor = vec4(result, 1.0);
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
 * Quality presets matching FSR 2.0
 */
const QualityPresets = {
    'ultra_quality': { scale: 0.77, name: 'Ultra Quality' },  // 1.3x
    'quality': { scale: 0.67, name: 'Quality' },              // 1.5x
    'balanced': { scale: 0.59, name: 'Balanced' },            // 1.7x
    'performance': { scale: 0.50, name: 'Performance' }       // 2.0x
};

/**
 * TemporalUpscalePass - FSR-like temporal upscaling
 */
export class TemporalUpscalePass extends Pass {
    constructor(scene, camera, options = {}) {
        super();

        this.scene = scene;
        this.camera = camera;
        this.enabled = true;

        // Quality preset
        this.quality = options.quality || 'balanced';
        this.scale = QualityPresets[this.quality]?.scale || 0.59;

        // Settings
        this.sharpness = options.sharpness ?? 0.5;
        this.blendWeight = options.blendWeight ?? 0.9;

        // Jitter settings
        this.jitterEnabled = true;
        this.jitterSampleCount = 16;
        this.jitterIndex = 0;
        this.jitterOffsets = this._generateJitterSequence(this.jitterSampleCount);

        // Resolution
        const outputSize = options.renderer ?
            options.renderer.getSize(new THREE.Vector2()) :
            new THREE.Vector2(window.innerWidth, window.innerHeight);

        this.outputResolution = outputSize.clone();
        this.renderResolution = new THREE.Vector2(
            Math.floor(outputSize.x * this.scale),
            Math.floor(outputSize.y * this.scale)
        );

        // Low-res render target
        this.lowResTarget = new THREE.WebGLRenderTarget(
            this.renderResolution.x,
            this.renderResolution.y,
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType,
                depthTexture: new THREE.DepthTexture()
            }
        );

        // History buffers (ping-pong)
        this.historyTargets = [
            this._createHistoryTarget(outputSize.x, outputSize.y),
            this._createHistoryTarget(outputSize.x, outputSize.y)
        ];
        this.historyIndex = 0;

        // Velocity buffer
        this.velocityTarget = new THREE.WebGLRenderTarget(
            this.renderResolution.x,
            this.renderResolution.y,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType
            }
        );

        // Upscale material
        this.upscaleMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(TemporalUpscaleShader.uniforms),
            vertexShader: TemporalUpscaleShader.vertexShader,
            fragmentShader: TemporalUpscaleShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.upscaleMaterial);

        // Camera matrices for velocity
        this.previousProjectionMatrix = new THREE.Matrix4();
        this.previousViewMatrix = new THREE.Matrix4();
        this.isFirstFrame = true;
    }

    _createHistoryTarget(width, height) {
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

    /**
     * Set quality preset
     * @param {'ultra_quality'|'quality'|'balanced'|'performance'} preset
     */
    setQuality(preset) {
        if (!QualityPresets[preset]) return;

        this.quality = preset;
        this.scale = QualityPresets[preset].scale;

        // Resize low-res target
        this.renderResolution.set(
            Math.floor(this.outputResolution.x * this.scale),
            Math.floor(this.outputResolution.y * this.scale)
        );

        this.lowResTarget.setSize(this.renderResolution.x, this.renderResolution.y);
        this.velocityTarget.setSize(this.renderResolution.x, this.renderResolution.y);
    }

    setSize(width, height) {
        this.outputResolution.set(width, height);

        this.renderResolution.set(
            Math.floor(width * this.scale),
            Math.floor(height * this.scale)
        );

        this.lowResTarget.setSize(this.renderResolution.x, this.renderResolution.y);
        this.velocityTarget.setSize(this.renderResolution.x, this.renderResolution.y);
        this.historyTargets[0].setSize(width, height);
        this.historyTargets[1].setSize(width, height);

        this.upscaleMaterial.uniforms.resolution.value.set(width, height);
        this.upscaleMaterial.uniforms.lowResolution.value.copy(this.renderResolution);
    }

    /**
     * Get the low-res render target for scene rendering
     * Call renderer.setRenderTarget(this.getRenderTarget()) before rendering scene
     */
    getRenderTarget() {
        return this.lowResTarget;
    }

    /**
     * Apply jitter to camera projection
     */
    applyJitter() {
        if (!this.jitterEnabled) return;

        const offset = this.jitterOffsets[this.jitterIndex];
        const width = this.renderResolution.x;
        const height = this.renderResolution.y;

        this._originalProjection = this.camera.projectionMatrix.clone();

        const jitterX = (offset.x * 2.0) / width;
        const jitterY = (offset.y * 2.0) / height;

        this.camera.projectionMatrix.elements[8] += jitterX;
        this.camera.projectionMatrix.elements[9] += jitterY;

        this.upscaleMaterial.uniforms.jitterOffset.value.copy(offset);
        this.jitterIndex = (this.jitterIndex + 1) % this.jitterSampleCount;
    }

    /**
     * Remove jitter from camera
     */
    removeJitter() {
        if (!this.jitterEnabled || !this._originalProjection) return;
        this.camera.projectionMatrix.copy(this._originalProjection);
    }

    render(renderer, writeBuffer, readBuffer) {
        // Get current and previous history
        const currentHistory = this.historyTargets[this.historyIndex];
        const previousHistory = this.historyTargets[1 - this.historyIndex];

        // Update uniforms
        this.upscaleMaterial.uniforms.tLowRes.value = readBuffer.texture;
        this.upscaleMaterial.uniforms.tHistory.value = this.isFirstFrame ?
            readBuffer.texture : previousHistory.texture;
        this.upscaleMaterial.uniforms.tVelocity.value = this.velocityTarget.texture;
        this.upscaleMaterial.uniforms.tDepth.value = this.lowResTarget.depthTexture;
        this.upscaleMaterial.uniforms.sharpness.value = this.sharpness;
        this.upscaleMaterial.uniforms.blendWeight.value = this.isFirstFrame ? 0.0 : this.blendWeight;

        // Render upscale to output
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);

            // Also render to history
            renderer.setRenderTarget(currentHistory);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);

            renderer.setRenderTarget(currentHistory);
            this.fsQuad.render(renderer);
        }

        // Swap history buffers
        this.historyIndex = 1 - this.historyIndex;

        // Store matrices for next frame
        this.previousProjectionMatrix.copy(this.camera.projectionMatrix);
        this.previousViewMatrix.copy(this.camera.matrixWorldInverse);
        this.isFirstFrame = false;
    }

    dispose() {
        this.lowResTarget.dispose();
        this.velocityTarget.dispose();
        this.historyTargets[0].dispose();
        this.historyTargets[1].dispose();
        this.upscaleMaterial.dispose();
        this.fsQuad.dispose();
    }
}

export { QualityPresets, TemporalUpscaleShader };
export default TemporalUpscalePass;
