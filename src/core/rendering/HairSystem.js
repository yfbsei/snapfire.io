/**
 * HairSystem - GPU-Instanced Strand-Based Hair Rendering
 * High-performance hair/fur rendering using instanced line segments
 */
import * as THREE from 'three';

/**
 * Hair strand vertex shader with wind animation
 */
const HairVertexShader = /* glsl */`
    attribute vec3 instancePosition;
    attribute vec3 instanceDirection;
    attribute float instanceLength;
    attribute vec3 instanceColor;
    attribute float instanceCurvature;
    
    uniform float time;
    uniform vec3 windDirection;
    uniform float windStrength;
    uniform float windFrequency;
    uniform mat4 rootTransform;
    
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSegment;
    
    void main() {
        vColor = instanceColor;
        vSegment = position.y; // 0 at root, 1 at tip
        
        // Calculate strand position along length
        float t = position.y;
        vec3 strandPos = instancePosition;
        
        // Apply root transform (for character attachment)
        vec4 transformedRoot = rootTransform * vec4(strandPos, 1.0);
        strandPos = transformedRoot.xyz;
        
        // Direction with curvature
        vec3 dir = normalize(instanceDirection);
        float curveAmount = instanceCurvature * t * t;
        dir = normalize(dir + vec3(curveAmount * 0.5, -curveAmount, curveAmount * 0.3));
        
        // Extend along strand direction
        vec3 offset = dir * instanceLength * t;
        
        // Wind animation (more effect at tip)
        float windPhase = time * windFrequency + dot(instancePosition, vec3(1.0)) * 0.1;
        float windEffect = sin(windPhase) * windStrength * t * t;
        offset += windDirection * windEffect;
        
        // Gravity droop (more at tip)
        offset.y -= 0.1 * instanceLength * t * t;
        
        vec3 finalPos = strandPos + offset;
        
        // Alpha falloff towards tip
        vAlpha = 1.0 - t * 0.3;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
    }
`;

/**
 * Hair strand fragment shader with simple shading
 */
const HairFragmentShader = /* glsl */`
    uniform vec3 lightDirection;
    uniform vec3 ambientColor;
    uniform float specularPower;
    
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSegment;
    
    void main() {
        // Simple hair shading (Kajiya-Kay approximation)
        vec3 tangent = normalize(vec3(0.0, 1.0, 0.0)); // Simplified tangent
        
        // Diffuse
        float NdotL = max(0.0, dot(tangent, lightDirection));
        vec3 diffuse = vColor * (0.5 + 0.5 * NdotL);
        
        // Add ambient
        vec3 color = diffuse + ambientColor * 0.2;
        
        // Tip fade
        float tipFade = 1.0 - smoothstep(0.7, 1.0, vSegment);
        
        gl_FragColor = vec4(color, vAlpha * tipFade);
    }
`;

/**
 * HairSystem - Manages strand-based hair rendering
 */
export class HairSystem {
    constructor(options = {}) {
        // Configuration
        this.strandCount = options.strandCount || 10000;
        this.strandSegments = options.strandSegments || 8;
        this.strandLength = options.strandLength || 0.15;
        this.strandLengthVariation = options.strandLengthVariation || 0.3;
        this.curvature = options.curvature || 0.5;
        this.curvatureVariation = options.curvatureVariation || 0.5;

        // Color
        this.baseColor = options.baseColor || new THREE.Color(0.2, 0.1, 0.05);
        this.tipColor = options.tipColor || new THREE.Color(0.4, 0.25, 0.15);
        this.colorVariation = options.colorVariation || 0.1;

        // Wind
        this.windDirection = options.windDirection || new THREE.Vector3(1, 0, 0.5).normalize();
        this.windStrength = options.windStrength || 0.02;
        this.windFrequency = options.windFrequency || 2.0;

        // LOD
        this.lodDistances = options.lodDistances || [10, 30, 60];
        this.lodDensities = options.lodDensities || [1.0, 0.5, 0.2];

        // Internal
        this.mesh = null;
        this.material = null;
        this.geometry = null;
        this.time = 0;

        // Root transform (for attaching to character)
        this.rootTransform = new THREE.Matrix4();

        this._init();
    }

    _init() {
        // Create strand geometry (line segments)
        const segmentPositions = [];
        for (let i = 0; i <= this.strandSegments; i++) {
            const t = i / this.strandSegments;
            segmentPositions.push(0, t, 0); // x, y (progress), z
        }

        this.geometry = new THREE.InstancedBufferGeometry();

        // Base strand (single line from 0 to 1)
        this.geometry.setAttribute('position',
            new THREE.Float32BufferAttribute(segmentPositions, 3)
        );

        // Instance attributes
        const positions = new Float32Array(this.strandCount * 3);
        const directions = new Float32Array(this.strandCount * 3);
        const lengths = new Float32Array(this.strandCount);
        const colors = new Float32Array(this.strandCount * 3);
        const curvatures = new Float32Array(this.strandCount);

        // Initialize with random values (will be overwritten by setRoots)
        for (let i = 0; i < this.strandCount; i++) {
            const i3 = i * 3;

            // Random position on unit sphere (placeholder)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i3] = Math.sin(phi) * Math.cos(theta) * 0.5;
            positions[i3 + 1] = Math.cos(phi) * 0.5 + 0.5;
            positions[i3 + 2] = Math.sin(phi) * Math.sin(theta) * 0.5;

            // Direction (outward + some randomness)
            const nx = positions[i3] + (Math.random() - 0.5) * 0.3;
            const ny = positions[i3 + 1] + (Math.random() - 0.5) * 0.3;
            const nz = positions[i3 + 2] + (Math.random() - 0.5) * 0.3;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            directions[i3] = nx / len;
            directions[i3 + 1] = ny / len;
            directions[i3 + 2] = nz / len;

            // Length with variation
            lengths[i] = this.strandLength * (1 + (Math.random() - 0.5) * this.strandLengthVariation);

            // Color (blend base to tip with variation)
            const colorMix = Math.random();
            const variation = (Math.random() - 0.5) * this.colorVariation;
            colors[i3] = THREE.MathUtils.lerp(this.baseColor.r, this.tipColor.r, colorMix) + variation;
            colors[i3 + 1] = THREE.MathUtils.lerp(this.baseColor.g, this.tipColor.g, colorMix) + variation;
            colors[i3 + 2] = THREE.MathUtils.lerp(this.baseColor.b, this.tipColor.b, colorMix) + variation;

            // Curvature
            curvatures[i] = this.curvature * (1 + (Math.random() - 0.5) * this.curvatureVariation);
        }

        this.geometry.setAttribute('instancePosition',
            new THREE.InstancedBufferAttribute(positions, 3)
        );
        this.geometry.setAttribute('instanceDirection',
            new THREE.InstancedBufferAttribute(directions, 3)
        );
        this.geometry.setAttribute('instanceLength',
            new THREE.InstancedBufferAttribute(lengths, 1)
        );
        this.geometry.setAttribute('instanceColor',
            new THREE.InstancedBufferAttribute(colors, 3)
        );
        this.geometry.setAttribute('instanceCurvature',
            new THREE.InstancedBufferAttribute(curvatures, 1)
        );

        // Create material
        this.material = new THREE.ShaderMaterial({
            vertexShader: HairVertexShader,
            fragmentShader: HairFragmentShader,
            uniforms: {
                time: { value: 0 },
                windDirection: { value: this.windDirection },
                windStrength: { value: this.windStrength },
                windFrequency: { value: this.windFrequency },
                rootTransform: { value: this.rootTransform },
                lightDirection: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
                ambientColor: { value: new THREE.Color(0.3, 0.3, 0.35) },
                specularPower: { value: 64.0 }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        // Create line mesh
        this.mesh = new THREE.LineSegments(this.geometry, this.material);
        this.mesh.frustumCulled = true;
    }

    /**
     * Set hair root positions from a mesh's vertices
     * @param {THREE.Mesh} mesh - The scalp/skin mesh to grow hair from
     * @param {number} density - 0-1 density of hair coverage
     */
    setRootsFromMesh(mesh, density = 1.0) {
        const positions = this.geometry.getAttribute('instancePosition');
        const directions = this.geometry.getAttribute('instanceDirection');

        if (!mesh.geometry.attributes.position) return;

        const vertices = mesh.geometry.attributes.position.array;
        const normals = mesh.geometry.attributes.normal?.array;
        const vertexCount = vertices.length / 3;

        const activeStrands = Math.floor(this.strandCount * density);

        for (let i = 0; i < activeStrands; i++) {
            const i3 = i * 3;

            // Pick random vertex
            const vertIdx = Math.floor(Math.random() * vertexCount);
            const v3 = vertIdx * 3;

            // Add small random offset
            positions.array[i3] = vertices[v3] + (Math.random() - 0.5) * 0.01;
            positions.array[i3 + 1] = vertices[v3 + 1] + (Math.random() - 0.5) * 0.01;
            positions.array[i3 + 2] = vertices[v3 + 2] + (Math.random() - 0.5) * 0.01;

            // Use normal as growth direction
            if (normals) {
                directions.array[i3] = normals[v3] + (Math.random() - 0.5) * 0.2;
                directions.array[i3 + 1] = normals[v3 + 1] + (Math.random() - 0.5) * 0.2;
                directions.array[i3 + 2] = normals[v3 + 2] + (Math.random() - 0.5) * 0.2;
            }
        }

        positions.needsUpdate = true;
        directions.needsUpdate = true;
    }

    /**
     * Attach hair to a bone/object transform
     * @param {THREE.Object3D} object - The object to follow
     */
    attachTo(object) {
        this.rootObject = object;
    }

    /**
     * Set wind parameters
     */
    setWind(direction, strength, frequency) {
        if (direction) this.windDirection.copy(direction).normalize();
        if (strength !== undefined) this.windStrength = strength;
        if (frequency !== undefined) this.windFrequency = frequency;

        this.material.uniforms.windDirection.value.copy(this.windDirection);
        this.material.uniforms.windStrength.value = this.windStrength;
        this.material.uniforms.windFrequency.value = this.windFrequency;
    }

    /**
     * Set light direction for shading
     */
    setLightDirection(direction) {
        this.material.uniforms.lightDirection.value.copy(direction).normalize();
    }

    /**
     * Update LOD based on camera distance
     * @param {THREE.Camera} camera
     */
    updateLOD(camera) {
        if (!this.mesh) return;

        const distance = camera.position.distanceTo(this.mesh.position);
        let density = 1.0;

        for (let i = 0; i < this.lodDistances.length; i++) {
            if (distance > this.lodDistances[i]) {
                density = this.lodDensities[i] || 0.1;
            }
        }

        // Update instance count for LOD
        const activeStrands = Math.floor(this.strandCount * density);
        this.geometry.instanceCount = activeStrands;
    }

    /**
     * Update animation
     * @param {number} deltaTime
     * @param {THREE.Camera} camera - For LOD updates
     */
    update(deltaTime, camera = null) {
        this.time += deltaTime;
        this.material.uniforms.time.value = this.time;

        // Update root transform
        if (this.rootObject) {
            this.rootTransform.copy(this.rootObject.matrixWorld);
            this.material.uniforms.rootTransform.value.copy(this.rootTransform);
        }

        // LOD
        if (camera) {
            this.updateLOD(camera);
        }
    }

    /**
     * Dispose resources
     */
    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

export default HairSystem;
