/**
 * LODGenerator - Automatic mesh simplification for LOD chains
 * Uses edge collapse algorithm for mesh decimation
 */
import * as THREE from 'three';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';

/**
 * LODGenerator - Creates LOD chains from high-poly meshes
 */
export class LODGenerator {
    constructor() {
        this.simplifyModifier = new SimplifyModifier();

        // Default LOD ratios (percentage of original vertices)
        this.defaultRatios = [1.0, 0.5, 0.25, 0.1, 0.02];

        // Default LOD distances
        this.defaultDistances = [0, 10, 25, 50, 100];
    }

    /**
     * Generate LOD chain for a mesh
     * @param {THREE.Mesh} mesh - Original high-poly mesh
     * @param {Object} options
     * @returns {THREE.LOD}
     */
    generate(mesh, options = {}) {
        const ratios = options.ratios ?? this.defaultRatios;
        const distances = options.distances ?? this.defaultDistances;
        const preserveUVs = options.preserveUVs ?? true;
        const preserveNormals = options.preserveNormals ?? true;

        // Ensure we have valid geometry
        if (!mesh.geometry) {
            console.warn('LODGenerator: Mesh has no geometry');
            return null;
        }

        // Create LOD object
        const lod = new THREE.LOD();
        lod.name = mesh.name ? `${mesh.name}_LOD` : 'GeneratedLOD';
        lod.position.copy(mesh.position);
        lod.rotation.copy(mesh.rotation);
        lod.scale.copy(mesh.scale);

        // Get original vertex count
        const originalGeometry = mesh.geometry;
        const originalVertexCount = originalGeometry.attributes.position.count;

        console.log(`LODGenerator: Generating ${ratios.length} LOD levels for mesh with ${originalVertexCount} vertices`);

        // Generate each LOD level
        for (let i = 0; i < ratios.length; i++) {
            const ratio = ratios[i];
            const distance = distances[i] ?? i * 20;

            let lodMesh;

            if (ratio >= 1.0) {
                // Use original geometry for LOD0
                lodMesh = mesh.clone();
            } else {
                // Simplify geometry
                const targetCount = Math.max(10, Math.floor(originalVertexCount * ratio));

                try {
                    const simplifiedGeometry = this._simplifyGeometry(
                        originalGeometry.clone(),
                        targetCount,
                        preserveUVs,
                        preserveNormals
                    );

                    lodMesh = new THREE.Mesh(simplifiedGeometry, mesh.material);
                    lodMesh.castShadow = mesh.castShadow;
                    lodMesh.receiveShadow = mesh.receiveShadow;

                    console.log(`LODGenerator: LOD${i} - ${simplifiedGeometry.attributes.position.count} vertices (target: ${targetCount})`);
                } catch (error) {
                    console.warn(`LODGenerator: Failed to generate LOD${i}, using previous level`);
                    lodMesh = mesh.clone();
                }
            }

            lodMesh.name = `LOD${i}`;
            lod.addLevel(lodMesh, distance);
        }

        return lod;
    }

    _simplifyGeometry(geometry, targetCount, preserveUVs, preserveNormals) {
        // Ensure geometry is non-indexed for SimplifyModifier
        let workGeometry = geometry;
        if (geometry.index) {
            workGeometry = geometry.toNonIndexed();
        }

        // Store original attributes if preserving
        const originalUVs = preserveUVs ? workGeometry.attributes.uv?.clone() : null;
        const originalNormals = preserveNormals ? workGeometry.attributes.normal?.clone() : null;

        // Calculate reduction
        const currentCount = workGeometry.attributes.position.count;
        const reductionCount = currentCount - targetCount;

        if (reductionCount <= 0) {
            return workGeometry;
        }

        // Use SimplifyModifier
        const simplified = this.simplifyModifier.modify(workGeometry, reductionCount);

        // Recompute normals if we couldn't preserve them
        if (!preserveNormals || !simplified.attributes.normal) {
            simplified.computeVertexNormals();
        }

        return simplified;
    }

    /**
     * Generate LOD for a scene/group with multiple meshes
     * @param {THREE.Object3D} object
     * @param {Object} options
     * @returns {THREE.Object3D}
     */
    generateForObject(object, options = {}) {
        const result = new THREE.Group();
        result.name = object.name ? `${object.name}_LOD` : 'GeneratedLOD';
        result.position.copy(object.position);
        result.rotation.copy(object.rotation);
        result.scale.copy(object.scale);

        object.traverse((child) => {
            if (child.isMesh) {
                const lod = this.generate(child, options);
                if (lod) {
                    // Maintain relative position
                    lod.position.copy(child.position);
                    lod.rotation.copy(child.rotation);
                    lod.scale.copy(child.scale);
                    result.add(lod);
                }
            }
        });

        return result;
    }

    /**
     * Get recommended LOD distances based on mesh size
     * @param {THREE.Mesh} mesh
     * @param {number} lodCount
     * @returns {number[]}
     */
    getRecommendedDistances(mesh, lodCount = 5) {
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const size = boundingBox.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);

        // Scale distances based on object size
        const distances = [];
        for (let i = 0; i < lodCount; i++) {
            distances.push(maxDimension * (i * 5 + 1));
        }

        return distances;
    }

    /**
     * Create billboard LOD for distant objects
     * @param {THREE.Mesh} mesh
     * @param {number} textureSize
     * @returns {THREE.Mesh}
     */
    createBillboardLOD(mesh, textureSize = 256) {
        // Create orthographic camera for rendering billboard
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const size = boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y);

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(size.x, size.y);

        // Create basic material with transparency
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });

        const billboard = new THREE.Mesh(geometry, material);
        billboard.name = 'Billboard_LOD';
        billboard.userData.isBillboard = true;

        return billboard;
    }

    /**
     * Create impostor LOD (multi-angle billboard)
     * Uses ImposterBaker for proper render-to-texture if renderer available
     * @param {THREE.Mesh} mesh
     * @param {Object} options
     * @returns {THREE.Mesh}
     */
    createImpostorLOD(mesh, options = {}) {
        const angles = options.angles ?? 8;
        const textureSize = options.textureSize ?? 512;

        // If we have a renderer, use proper imposter baking
        if (options.renderer) {
            try {
                const { ImposterBaker } = require('./ImposterSystem.js');
                const baker = new ImposterBaker(options.renderer);
                const atlas = baker.bake(mesh, { angles, size: textureSize });

                // Create billboard with baked texture
                const boundingBox = new THREE.Box3().setFromObject(mesh);
                const size = boundingBox.getSize(new THREE.Vector3());

                const geometry = new THREE.PlaneGeometry(size.x, size.y);
                const material = new THREE.MeshBasicMaterial({
                    map: atlas.texture,
                    transparent: true,
                    alphaTest: 0.5,
                    side: THREE.DoubleSide
                });

                const billboard = new THREE.Mesh(geometry, material);
                billboard.name = 'Impostor_LOD';
                billboard.userData.isImpostor = true;
                billboard.userData.atlas = atlas;
                billboard.userData.angles = angles;

                baker.dispose();
                return billboard;
            } catch (e) {
                console.warn('ImposterBaker not available, falling back to simple billboard');
            }
        }

        // Fallback to simple billboard
        return this.createBillboardLOD(mesh, textureSize);
    }

    /**
     * Analyze mesh and suggest optimal LOD configuration
     * @param {THREE.Mesh} mesh
     * @returns {Object}
     */
    analyzeMesh(mesh) {
        if (!mesh.geometry) {
            return { error: 'No geometry found' };
        }

        const geometry = mesh.geometry;
        const vertexCount = geometry.attributes.position.count;
        const hasNormals = !!geometry.attributes.normal;
        const hasUVs = !!geometry.attributes.uv;
        const isIndexed = !!geometry.index;

        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const size = boundingBox.getSize(new THREE.Vector3());

        // Suggest LOD levels based on complexity
        let suggestedLevels;
        if (vertexCount < 1000) {
            suggestedLevels = 2;
        } else if (vertexCount < 10000) {
            suggestedLevels = 3;
        } else if (vertexCount < 100000) {
            suggestedLevels = 4;
        } else {
            suggestedLevels = 5;
        }

        return {
            vertexCount,
            hasNormals,
            hasUVs,
            isIndexed,
            boundingSize: size,
            suggestedLevels,
            suggestedRatios: this.defaultRatios.slice(0, suggestedLevels),
            suggestedDistances: this.getRecommendedDistances(mesh, suggestedLevels)
        };
    }
}

export default LODGenerator;
