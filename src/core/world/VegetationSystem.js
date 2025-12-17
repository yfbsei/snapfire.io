import * as THREE from 'three';
import {
    MeshStandardNodeMaterial,
    positionLocal,
    time,
    sin,
    cos,
    vec3,
    float,
    mix,
    uv,
    attribute,
    instanceIndex
} from 'three/tsl';

/**
 * VegetationSystem - GPU-Driven Foliage with TSL
 * Supports WebGPU rendering with node-based wind animation
 */
export class VegetationSystem {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.scene = engine.scene;

        this.config = {
            grassCount: options.grassCount || 10000,
            range: options.range || 100,
            bladeWidth: 0.1,
            bladeHeight: 1.0,
            colorBase: new THREE.Color(0x2d4c1e),
            colorTip: new THREE.Color(0x7fbf5e),
            ...options
        };

        this.meshes = [];
        this.init();
    }

    init() {
        this._createGrass();
    }

    _createGrass() {
        console.log(`🌿 Initializing VegetationSystem with ${this.config.grassCount} instances (TSL)`);

        // Geometry: Simple blade
        // Pivot is already at bottom if we translate the geometry
        const geometry = new THREE.PlaneGeometry(this.config.bladeWidth, this.config.bladeHeight, 1, 4);
        geometry.translate(0, this.config.bladeHeight / 2, 0);

        // --------------------------------------------------------
        // TSL Node Material Setup
        // --------------------------------------------------------

        // 1. Wind Animation Logic
        // Calculate displacement based on UV height (only top moves)
        // uv().y 0 is bottom, 1 is top. Power it to keep bottom stiff.
        const stiffness = uv().y.pow(2.0);

        // Simple wind wave function based on time and instance position
        // In a real TSL setup, we would use instance attribute for position offset variation
        // For now, let's just use basic time loop
        const windTime = time.mul(2.0);
        const windWave = sin(windTime.add(instanceIndex.toFloat().mul(0.5))); // Offset by instance index for variety

        // Apply wind displacement to X and Z
        const displacement = vec3(
            windWave.mul(0.2).mul(stiffness), // X swerve
            0.0,                              // Y none
            windWave.mul(0.1).mul(stiffness)  // Z swerve
        );

        // Update vertex position
        const newPosition = positionLocal.add(displacement);

        // 2. Color Gradient
        // Mix base and tip color based on UV height
        // We need to convert Color objects to vec3 nodes? NodeMaterial handles Three.Color usually.
        // Or we can use `color( c )` node
        // const colorNode = mix(color(this.config.colorBase), color(this.config.colorTip), uv().y);

        // Create Material
        const material = new MeshStandardNodeMaterial();
        material.colorNode = mix(
            vec3(this.config.colorBase.r, this.config.colorBase.g, this.config.colorBase.b),
            vec3(this.config.colorTip.r, this.config.colorTip.g, this.config.colorTip.b),
            uv().y
        );
        material.positionNode = newPosition; // Use the modified position
        material.side = THREE.DoubleSide;
        material.alphaTest = 0.5; // If using alpha map
        // material.transparent = false; // Opaque is faster

        this.grassMaterial = material;

        // --------------------------------------------------------
        // Instanced Mesh Setup
        // --------------------------------------------------------

        const mesh = new THREE.InstancedMesh(geometry, material, this.config.grassCount);

        // Scatter
        const dummy = new THREE.Object3D();
        const range = this.config.range;

        for (let i = 0; i < this.config.grassCount; i++) {
            const x = (Math.random() - 0.5) * range;
            const z = (Math.random() - 0.5) * range;
            const y = 0; // Ground level

            dummy.position.set(x, y, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;

            const s = 0.5 + Math.random() * 0.5;
            dummy.scale.set(s, s * (0.8 + Math.random() * 0.4), s);

            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;

        // Enable shadows
        mesh.receiveShadow = true;
        mesh.castShadow = true; // Might be expensive, user can disable if needed
        mesh.frustumCulled = true; // Standard frustum culling

        this.scene.add(mesh);
        this.meshes.push(mesh);
    }

    update(deltaTime) {
        // TSL handles animation automatically via 'time' node!
        // No CPU update needed for wind.
    }
}
