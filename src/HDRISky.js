import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

/**
 * HDRISky - Manages HDRI environment and background using a custom shader sky sphere
 * for independent exposure control and proper tone mapping.
 */
export class HDRISky {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.texture = null;
        this.skyMesh = null;
    }

    /**
     * Load an HDRI texture and apply it to the scene
     * @param {string} path - Path to the HDR file
     * @returns {Promise<THREE.Texture>}
     */
    async load(path) {
        return new Promise((resolve, reject) => {
            const loader = new RGBELoader();

            loader.load(
                path,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    this.texture = texture;

                    // Set environment for scene lighting
                    this.scene.environment = texture;

                    // Create custom sky sphere for background
                    this._createSkySphere(texture);

                    console.log('🌅 HDRI loaded with shader-based sky sphere');
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error('Failed to load HDRI:', error);
                    reject(error);
                }
            );
        });
    }

    _createSkySphere(texture) {
        // Remove existing sky mesh
        if (this.skyMesh) {
            this.scene.remove(this.skyMesh);
            this.skyMesh.geometry.dispose();
            this.skyMesh.material.dispose();
        }

        const material = new THREE.ShaderMaterial({
            uniforms: {
                tEquirect: { value: texture },
                exposure: { value: 0.05 },
                brightness: { value: 0.0 }, // Offset
                contrast: { value: 1.0 },   // Scale
            },
            vertexShader: `
                varying vec3 vWorldDirection;
                void main() {
                    vWorldDirection = position;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_Position.z = gl_Position.w;
                }
            `,
            fragmentShader: `
                uniform sampler2D tEquirect;
                uniform float exposure;
                uniform float brightness;
                uniform float contrast;
                varying vec3 vWorldDirection;

                #define RECIPROCAL_PI 0.3183098861837907
                #define RECIPROCAL_PI2 0.15915494309189535

                vec3 ACESFilm(vec3 x) {
                    float a = 2.51;
                    float b = 0.03;
                    float c = 2.43;
                    float d = 0.59;
                    float e = 0.14;
                    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
                }

                void main() {
                    vec3 direction = normalize(vWorldDirection);
                    // Flip y for orientation correction
                    vec2 uv = vec2(atan(direction.z, direction.x) * RECIPROCAL_PI2 + 0.5, 1.0 - acos(direction.y) * RECIPROCAL_PI);
                    
                    vec4 texColor = texture2D(tEquirect, uv);
                    
                    // 1. Exposure
                    vec3 color = texColor.rgb * exposure;
                    
                    // 2. Contrast & Brightness
                    color = (color - 0.5) * contrast + 0.5 + brightness;
                    
                    // 3. Tone Mapping
                    color = ACESFilm(color);
                    
                    // 4. Gamma
                    color = pow(max(color, 0.0), vec3(1.0 / 2.2));

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
        });

        const geometry = new THREE.SphereGeometry(1, 64, 32);
        this.skyMesh = new THREE.Mesh(geometry, material);

        this.skyMesh.scale.setScalar(4000);
        this.scene.add(this.skyMesh);

        this.scene.background = null;
    }

    setSkyExposure(value) {
        if (this.skyMesh) {
            this.skyMesh.material.uniforms.exposure.value = value;
        }
    }

    setSkyBrightness(value) {
        if (this.skyMesh) {
            this.skyMesh.material.uniforms.brightness.value = value;
        }
    }

    setSkyContrast(value) {
        if (this.skyMesh) {
            this.skyMesh.material.uniforms.contrast.value = value;
        }
    }

    dispose() {
        if (this.texture) {
            this.texture.dispose();
            this.texture = null;
        }
        if (this.skyMesh) {
            this.scene.remove(this.skyMesh);
            this.skyMesh.geometry.dispose();
            this.skyMesh.material.dispose();
            this.skyMesh = null;
        }
        this.scene.environment = null;
    }
}
