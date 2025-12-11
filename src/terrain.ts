import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { GroundMesh } from '@babylonjs/core/Meshes/groundMesh';
import { Vector2, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

export interface TerrainConfig {
    /** Width in meters (e.g., 2000 for 2km) */
    width: number;
    /** Height in meters (e.g., 2000 for 2km) */
    height: number;
    /** Number of subdivisions (higher = more detail, use heightmap resolution) */
    subdivisions: number;
    /** Maximum terrain elevation in meters */
    maxHeight: number;
    /** Minimum terrain elevation in meters */
    minHeight: number;
    /** Path to heightmap image */
    heightmapPath: string;
}

export class TerrainSystem {
    private scene: Scene;
    private config: TerrainConfig;
    private terrainMesh: GroundMesh | null = null;

    constructor(scene: Scene, config: TerrainConfig) {
        this.scene = scene;
        this.config = config;
    }

    async createTerrain(): Promise<GroundMesh> {
        console.log('🏔️ Creating terrain from heightmap...');

        return new Promise((resolve) => {
            // Create ground from heightmap using BabylonJS API
            // Signature: (name, url, width, height, subdivisions, minHeight, maxHeight, scene, updatable?, onReady?)
            this.terrainMesh = GroundMesh.CreateGroundFromHeightMap(
                'terrain',
                this.config.heightmapPath,
                this.config.width,
                this.config.height,
                this.config.subdivisions,
                this.config.minHeight,
                this.config.maxHeight,
                this.scene,
                false,  // updatable
                (mesh: GroundMesh) => {
                    console.log('✅ Terrain mesh created');

                    // Ensure tangents are calculated for Normal Mapping (Critical for PBR Node Material)
                    mesh.forceSharedVertices();

                    const positions = mesh.getVerticesData('position');
                    const normals = mesh.getVerticesData('normal');
                    const uvs = mesh.getVerticesData('uv');
                    const indices = mesh.getIndices();

                    // Calculate tangents manually to avoid Mesh prototype issues
                    if (positions && normals && uvs && indices) {
                        const tangents = this.calculateTangents(positions, normals, uvs, indices);
                        mesh.setVerticesData('tangent', tangents);
                    }

                    this.applyMaterial(mesh);

                    // Enable collisions
                    mesh.checkCollisions = true;

                    resolve(mesh);
                }
            );
        });
    }

    private async applyMaterial(mesh: GroundMesh): Promise<void> {
        console.log('🎨 Applying Node Material multi-texture terrain...');

        const { TerrainNodeMaterial } = await import('./terrain-node-material');
        const { TerrainSplatmapGenerator } = await import('./terrain-splatmap-generator');
        const { TERRAIN_TEXTURES } = await import('./terrain-texture-config');

        // Generate procedural splatmap
        const splatmapGen = new TerrainSplatmapGenerator(this.scene);
        const splatmap = splatmapGen.generateSplatmap(mesh);

        // Create the Node Material
        // We pass the configuration directly. The material class handles texture loading.
        const terrainMat = new TerrainNodeMaterial('terrainNodeMat', this.scene, TERRAIN_TEXTURES);

        // Assign the runtime-generated splatmap
        terrainMat.setSplatmap(splatmap);

        // Assign to mesh
        mesh.material = terrainMat.getMaterial();

        console.log('✅ Terrain Node Material applied');
        console.log(`   - Blending ${TERRAIN_TEXTURES.length} texture sets based on slope`);
        console.log(`   - Splatmap: Procedural RGB`);
    }

    getTerrain(): GroundMesh | null {
        return this.terrainMesh;
    }

    dispose(): void {
        if (this.terrainMesh) {
            this.terrainMesh.dispose();
            this.terrainMesh = null;
        }
    }
    private calculateTangents(positions: any, normals: any, uvs: any, indices: any): Float32Array {
        const tangents = new Float32Array(4 * (positions.length / 3));
        const tan1 = new Float32Array(2 * positions.length);
        const tan2 = new Float32Array(2 * positions.length);

        const indexCount = indices.length;

        for (let i = 0; i < indexCount; i += 3) {
            const i1 = indices[i];
            const i2 = indices[i + 1];
            const i3 = indices[i + 2];

            const x1 = positions[i1 * 3];
            const y1 = positions[i1 * 3 + 1];
            const z1 = positions[i1 * 3 + 2];

            const x2 = positions[i2 * 3];
            const y2 = positions[i2 * 3 + 1];
            const z2 = positions[i2 * 3 + 2];

            const x3 = positions[i3 * 3];
            const y3 = positions[i3 * 3 + 1];
            const z3 = positions[i3 * 3 + 2];

            const w1 = uvs[i1 * 2];
            const v1 = uvs[i1 * 2 + 1];

            const w2 = uvs[i2 * 2];
            const v2 = uvs[i2 * 2 + 1];

            const w3 = uvs[i3 * 2];
            const v3 = uvs[i3 * 2 + 1];

            const x10 = x2 - x1;
            const x20 = x3 - x1;
            const y10 = y2 - y1;
            const y20 = y3 - y1;
            const z10 = z2 - z1;
            const z20 = z3 - z1;

            const s1 = w2 - w1;
            const s2 = w3 - w1;
            const t1 = v2 - v1;
            const t2 = v3 - v1;

            const r = 1.0 / (s1 * t2 - s2 * t1);
            const sdirX = (t2 * x10 - t1 * x20) * r;
            const sdirY = (t2 * y10 - t1 * y20) * r;
            const sdirZ = (t2 * z10 - t1 * z20) * r;

            const tdirX = (s1 * x20 - s2 * x10) * r;
            const tdirY = (s1 * y20 - s2 * y10) * r;
            const tdirZ = (s1 * z20 - s2 * z10) * r;

            tan1[i1 * 3] += sdirX;
            tan1[i1 * 3 + 1] += sdirY;
            tan1[i1 * 3 + 2] += sdirZ;

            tan1[i2 * 3] += sdirX;
            tan1[i2 * 3 + 1] += sdirY;
            tan1[i2 * 3 + 2] += sdirZ;

            tan1[i3 * 3] += sdirX;
            tan1[i3 * 3 + 1] += sdirY;
            tan1[i3 * 3 + 2] += sdirZ;

            tan2[i1 * 3] += tdirX;
            tan2[i1 * 3 + 1] += tdirY;
            tan2[i1 * 3 + 2] += tdirZ;

            tan2[i2 * 3] += tdirX;
            tan2[i2 * 3 + 1] += tdirY;
            tan2[i2 * 3 + 2] += tdirZ;

            tan2[i3 * 3] += tdirX;
            tan2[i3 * 3 + 1] += tdirY;
            tan2[i3 * 3 + 2] += tdirZ;
        }

        const vertexCount = positions.length / 3;
        for (let i = 0; i < vertexCount; i++) {
            const nX = normals[i * 3];
            const nY = normals[i * 3 + 1];
            const nZ = normals[i * 3 + 2];

            const tX = tan1[i * 3];
            const tY = tan1[i * 3 + 1];
            const tZ = tan1[i * 3 + 2];

            // Gram-Schmidt orthogonalize
            const ndott = nX * tX + nY * tY + nZ * tZ;
            let tanX = tX - nX * ndott;
            let tanY = tY - nY * ndott;
            let tanZ = tZ - nZ * ndott;

            const length = Math.sqrt(tanX * tanX + tanY * tanY + tanZ * tanZ);
            tanX /= length;
            tanY /= length;
            tanZ /= length;

            tangents[i * 4] = tanX;
            tangents[i * 4 + 1] = tanY;
            tangents[i * 4 + 2] = tanZ;

            // Calculate handedness
            const crossX = nY * tZ - nZ * tY;
            const crossY = nZ * tX - nX * tZ;
            const crossZ = nX * tY - nY * tX;

            const t2X = tan2[i * 3];
            const t2Y = tan2[i * 3 + 1];
            const t2Z = tan2[i * 3 + 2];

            const dotCross = crossX * t2X + crossY * t2Y + crossZ * t2Z;
            tangents[i * 4 + 3] = (dotCross < 0.0) ? -1.0 : 1.0;
        }

        return tangents;
    }
}
