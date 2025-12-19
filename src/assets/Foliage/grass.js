import * as THREE from 'three';
import { Noise } from '../../Noise.js';

export class GrassSystem {
    constructor(scene, terrainSystem) {
        this.scene = scene;
        this.terrainSystem = terrainSystem;

        this.loadedChunks = new Map();

        // Asset paths
        this.GRASS_TEXTURE_PATH = '/assets/billboard/grass_green.png';

        this.NOISE_SEED = 12345;
        this.noise = new Noise(this.NOISE_SEED);

        this.texLoader = new THREE.TextureLoader();
        this.isLoaded = false;

        // ============ CONFIGURATION ============
        // Pure Point Cloud System
        this.NEAR_DIST = 300; // Range for point cloud grass
        this.NEAR_DENSITY = 100000;
        this.FADE_ZONE = 100;
        this.MAX_CHUNKS = 100; // 10x10 grid

        this.loadAssets();
    }

    async loadAssets() {
        try {
            const grassTexture = await this.texLoader.loadAsync(this.GRASS_TEXTURE_PATH);
            this.grassTexture = grassTexture;

            // --- Point Cloud Material ---
            this.pointMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTexture: { value: grassTexture },
                    uPlayerPos: { value: new THREE.Vector3() },
                    uNearDist: { value: this.NEAR_DIST },
                    uFadeZone: { value: this.FADE_ZONE },
                    uTime: { value: 0 }
                },
                vertexShader: `
                    uniform vec3 uPlayerPos;
                    uniform float uNearDist;
                    uniform float uFadeZone;
                    uniform float uTime;
                    varying float vAlpha;
                    varying float vWind;
                    varying vec3 vWorldPos;

                    void main() {
                        vec4 worldPos = modelMatrix * vec4(position, 1.0);
                        vWorldPos = worldPos.xyz;
                        
                        // Calculate wind value but don't apply to position (keep base fixed)
                        vWind = sin(worldPos.x * 0.4 + uTime * 2.5) * cos(worldPos.z * 0.4 + uTime * 2.0) * 0.15;

                        float dist = distance(worldPos.xz, uPlayerPos.xz);
                        vAlpha = 1.0 - clamp((dist - uNearDist) / uFadeZone, 0.0, 1.0);
                        
                        vec4 mvPosition = viewMatrix * worldPos;
                        gl_Position = projectionMatrix * mvPosition;
                        
                        // Blade size
                        gl_PointSize = (800.0 / -mvPosition.z);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uTexture;
                    varying float vAlpha;
                    varying float vWind;
                    varying vec3 vWorldPos;
                    
                    void main() {
                        // gl_PointCoord.y: 0 = top of sprite, 1 = bottom of sprite
                        // We want bottom pinned (no offset at y=1) and top to sway (max offset at y=0)
                        float heightFactor = 1.0 - gl_PointCoord.y; // 1 at top, 0 at bottom
                        heightFactor = heightFactor * heightFactor; // Quadratic falloff for natural bend
                        
                        // Offset UV based on wind and height
                        vec2 uv = gl_PointCoord;
                        uv.x += vWind * heightFactor;
                        
                        vec4 texColor = texture2D(uTexture, uv);
                        if (texColor.a < 0.6) discard;
                        gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);
                    }
                `,
                transparent: true,
                depthWrite: true,
            });

            // Create Global Point Cloud
            this.pointGeometry = new THREE.BufferGeometry();
            this.pointPositions = new Float32Array(this.MAX_CHUNKS * this.NEAR_DENSITY * 3);
            this.pointGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));

            this.pointCloud = new THREE.Points(this.pointGeometry, this.pointMaterial);
            this.pointCloud.frustumCulled = false;
            this.scene.add(this.pointCloud);

            this.isLoaded = true;
            console.log('🌿 Grass System simplified: Pure Point Cloud');
        } catch (error) {
            console.error('❌ Failed to load grass assets:', error);
        }
    }

    update(playerPosition, time) {
        if (!this.isLoaded) return;

        this.pointMaterial.uniforms.uPlayerPos.value.copy(playerPosition);
        this.pointMaterial.uniforms.uTime.value = time;

        const currentChunks = this.terrainSystem.chunks;
        let chunksChanged = false;

        // Unload distant chunks
        for (const [key] of this.loadedChunks.entries()) {
            if (!currentChunks.has(key)) {
                this.loadedChunks.delete(key);
                chunksChanged = true;
            } else {
                const chunk = currentChunks.get(key);
                const dist = new THREE.Vector2(chunk.x, chunk.z).distanceTo(
                    new THREE.Vector2(playerPosition.x, playerPosition.z)
                );
                if (dist > this.NEAR_DIST + this.FADE_ZONE + chunk.size) {
                    this.loadedChunks.delete(key);
                    chunksChanged = true;
                }
            }
        }

        // Load nearby chunks
        for (const [key, chunk] of currentChunks.entries()) {
            const dist = new THREE.Vector2(chunk.x, chunk.z).distanceTo(
                new THREE.Vector2(playerPosition.x, playerPosition.z)
            );
            if (dist > this.NEAR_DIST + this.FADE_ZONE + chunk.size) continue;

            if (!this.loadedChunks.has(key) && chunk.isReady) {
                this._generateChunkData(key, chunk);
                chunksChanged = true;
            }
        }

        if (chunksChanged) {
            this._rebuildGlobalBuffers();
        }
    }

    _generateChunkData(key, chunk) {
        const pointData = new Float32Array(this.NEAR_DENSITY * 3);
        const h = (wx, wz) => this.terrainSystem.getHeight(wx, wz);

        for (let i = 0; i < this.NEAR_DENSITY; i++) {
            const rx = (Math.random() - 0.5) * chunk.size;
            const rz = (Math.random() - 0.5) * chunk.size;
            const wx = rx + chunk.x;
            const wz = rz + chunk.z;
            const wy = h(wx, wz);

            pointData[i * 3] = wx;
            pointData[i * 3 + 1] = wy + 0.3;
            pointData[i * 3 + 2] = wz;
        }

        this.loadedChunks.set(key, { pointData });
    }

    _rebuildGlobalBuffers() {
        let pointIdx = 0;

        for (const chunkData of this.loadedChunks.values()) {
            if (pointIdx + this.NEAR_DENSITY <= this.MAX_CHUNKS * this.NEAR_DENSITY) {
                this.pointPositions.set(chunkData.pointData, pointIdx * 3);
                pointIdx += this.NEAR_DENSITY;
            }
        }

        this.pointGeometry.attributes.position.needsUpdate = true;
        this.pointGeometry.setDrawRange(0, pointIdx);

        console.log(`🌿 Grass (Points): ${pointIdx}`);
    }

    dispose() {
        if (this.pointCloud) {
            this.scene.remove(this.pointCloud);
            this.pointCloud.dispose();
        }
        if (this.pointGeometry) this.pointGeometry.dispose();
        if (this.pointMaterial) this.pointMaterial.dispose();
        if (this.grassTexture) this.grassTexture.dispose();

        this.loadedChunks.clear();
    }
}
