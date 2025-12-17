import * as THREE from 'three';

/**
 * LightProbeSystem - Global Illumination using Light Probes
 * Provides indirect lighting for realistic AAA visuals
 */
export class LightProbeSystem {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.probes = [];
        this.probeGrid = null;
        this.gridSize = new THREE.Vector3(10, 3, 10); // Default grid dimensions
        this.gridSpacing = 5; // Units between probes
        this.probeIntensity = 1.0;
    }

    /**
     * Generate a grid of light probes across the scene
     * @param {THREE.Vector3} min - Minimum bounds
     * @param {THREE.Vector3} max - Max bounds
     * @param {number} spacing - Distance between probes
     */
    generateProbeGrid(min, max, spacing = 5) {
        this.gridSpacing = spacing;
        const probes = [];

        for (let x = min.x; x <= max.x; x += spacing) {
            for (let y = min.y; y <= max.y; y += spacing) {
                for (let z = min.z; z <= max.z; z += spacing) {
                    const position = new THREE.Vector3(x, y, z);
                    const probe = this.createProbe(position);
                    probes.push(probe);
                }
            }
        }

        this.probes = probes;
        console.log(`Generated ${probes.length} light probes`);
    }

    /**
     * Create a single light probe
     * @param {THREE.Vector3} position 
     * @returns {Object}
     */
    createProbe(position) {
        // Light probe captures environment as spherical harmonics (simplified)
        const probe = new THREE.LightProbe();
        probe.position.copy(position);

        // Create a small visual helper (optional, for debugging)
        const helper = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
        );
        helper.position.copy(position);
        helper.visible = false; // Hidden by default

        this.scene.add(probe);
        this.scene.add(helper); // Add helper for debugging

        return {
            probe,
            helper,
            position: position.clone(),
            sh: null // Spherical harmonics data
        };
    }

    /**
     * Bake lighting data for all probes
     * This captures the lighting environment into spherical harmonics
     */
    async bakeProbes() {
        console.log('Baking light probes...');

        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
        const cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);

        for (let i = 0; i < this.probes.length; i++) {
            const probe = this.probes[i];

            // Position cube camera at probe location
            cubeCamera.position.copy(probe.position);
            cubeCamera.update(this.renderer, this.scene);

            // Generate spherical harmonics from cubemap
            // Three.js LightProbe.fromCubeRenderTarget does this internally
            probe.probe.copy(THREE.LightProbe.fromCubeRenderTarget(this.renderer, cubeRenderTarget));
            probe.sh = probe.probe.sh.coefficients; // Store SH data

            if (i % 10 === 0) {
                console.log(`Baked ${i + 1}/${this.probes.length} probes`);
            }
        }

        cubeRenderTarget.dispose();
        console.log('Light probe baking complete!');
    }

    /**
     * Get interpolated lighting for a world position
     * @param {THREE.Vector3} position 
     * @returns {THREE.LightProbe}
     */
    getProbeAt(position) {
        if (this.probes.length === 0) return null;

        // Find nearest 8 probes (trilinear interpolation)
        const nearestProbes = this._findNearestProbes(position, 8);

        if (nearestProbes.length === 0) return this.probes[0].probe;
        if (nearestProbes.length === 1) return nearestProbes[0].probe;

        // Blend probes based on distance
        const blendedProbe = new THREE.LightProbe();
        let totalWeight = 0;

        nearestProbes.forEach(({ probe, distance }) => {
            const weight = 1.0 / (distance + 0.1); // Inverse distance weighting
            totalWeight += weight;

            // Add weighted contribution
            for (let i = 0; i < 9; i++) {
                blendedProbe.sh.coefficients[i].add(
                    probe.probe.sh.coefficients[i].clone().multiplyScalar(weight)
                );
            }
        });

        // Normalize
        blendedProbe.sh.coefficients.forEach(coeff => coeff.divideScalar(totalWeight));
        blendedProbe.intensity = this.probeIntensity;

        return blendedProbe;
    }

    _findNearestProbes(position, count = 8) {
        const distances = this.probes.map(probe => ({
            probe,
            distance: position.distanceTo(probe.position)
        }));

        distances.sort((a, b) => a.distance - b.distance);
        return distances.slice(0, count);
    }

    /**
     * Apply probe lighting to an object
     * @param {THREE.Object3D} object 
     */
    applyToObject(object) {
        const probe = this.getProbeAt(object.position);
        if (probe && object.material) {
            // Add environmental lighting via light probe
            this.scene.add(probe);

            // Ensure material receives light probe data
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => {
                    if (mat.envMap !== undefined) {
                        mat.needsUpdate = true;
                    }
                });
            } else {
                object.material.needsUpdate = true;
            }
        }
    }

    /**
     * Toggle probe visualization
     * @param {boolean} visible 
     */
    showProbes(visible) {
        this.probes.forEach(probe => {
            probe.helper.visible = visible;
        });
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.probes.forEach(probe => {
            this.scene.remove(probe.probe);
            this.scene.remove(probe.helper);
            probe.helper.geometry.dispose();
            probe.helper.material.dispose();
        });
        this.probes = [];
    }
}
