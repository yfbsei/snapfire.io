/**
 * ImposterSystem - Billboard LOD system for distant object rendering
 * 
 * Renders 3D objects as camera-facing billboards at distance for performance.
 * Uses render-to-texture to capture object appearance from multiple angles.
 */
import * as THREE from 'three';

/**
 * ImposterAtlas - Stores pre-rendered object views in a texture atlas
 */
export class ImposterAtlas {
    constructor(texture, config) {
        this.texture = texture;
        this.angles = config.angles || 8;
        this.rows = config.rows || 1;
        this.cols = config.cols || this.angles;
        this.size = config.size || 256;
        this.objectSize = config.objectSize || new THREE.Vector3(1, 1, 1);
    }

    /**
     * Get UV coordinates for a specific angle
     * @param {number} angleIndex - Index of angle (0 to angles-1)
     * @returns {{u: number, v: number, uSize: number, vSize: number}}
     */
    getUVForAngle(angleIndex) {
        const col = angleIndex % this.cols;
        const row = Math.floor(angleIndex / this.cols);

        return {
            u: col / this.cols,
            v: 1 - (row + 1) / this.rows,
            uSize: 1 / this.cols,
            vSize: 1 / this.rows
        };
    }
}

/**
 * ImposterBaker - Renders objects to textures from multiple angles
 */
export class ImposterBaker {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

        // Transparent background - billboards will blend with environment
        this.scene.background = null;

        // Strong lighting to match outdoor scene
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);

        // Sun-like directional light
        const sun = new THREE.DirectionalLight(0xfffaf0, 1.0);
        sun.position.set(50, 100, 50);
        this.scene.add(sun);

        // Fill light from below to illuminate underside
        const fill = new THREE.DirectionalLight(0x87ceeb, 0.3);
        fill.position.set(0, -1, 0);
        this.scene.add(fill);
    }

    /**
     * Bake an object into an imposter atlas texture
     * @param {THREE.Object3D} object - Object to bake
     * @param {Object} options - Baking options
     * @returns {ImposterAtlas}
     */
    bake(object, options = {}) {
        const angles = options.angles || 8;
        const size = options.size || 256;

        // Calculate atlas dimensions
        const atlasWidth = size * angles;
        const atlasHeight = size;

        // Create render target with alpha for transparency
        const renderTarget = new THREE.WebGLRenderTarget(atlasWidth, atlasHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            generateMipmaps: false,
            colorSpace: THREE.SRGBColorSpace
        });

        // Calculate object bounds
        const bbox = new THREE.Box3().setFromObject(object);
        const objectSize = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const maxDim = Math.max(objectSize.x, objectSize.y, objectSize.z);

        // Setup camera to fit object with padding
        const cameraDistance = maxDim * 2.5;
        const halfWidth = maxDim * 0.6;
        const halfHeight = maxDim * 0.8; // Trees are taller than wide
        this.camera.left = -halfWidth;
        this.camera.right = halfWidth;
        this.camera.top = halfHeight;
        this.camera.bottom = -halfHeight * 0.3;
        this.camera.near = 0.1;
        this.camera.far = cameraDistance * 4;
        this.camera.updateProjectionMatrix();

        // Deep clone object preserving materials
        const renderObject = object.clone(true);

        // Traverse and ensure materials render properly
        renderObject.traverse((child) => {
            if (child.isMesh && child.material) {
                // Clone material to avoid modifying original
                const mat = child.material.clone();

                // Keep textures but ensure visibility
                if (mat.map) {
                    mat.map.needsUpdate = true;
                }

                // Ensure material is visible
                mat.side = THREE.DoubleSide;
                mat.transparent = true;
                mat.alphaTest = 0.1; // Lower threshold to capture more of tree
                mat.depthTest = true;
                mat.depthWrite = true;

                child.material = mat;
            }
        });

        // Center the object at origin
        renderObject.position.set(-center.x, -center.y, -center.z);

        // Wrap in group for easier management
        const objectGroup = new THREE.Group();
        objectGroup.add(renderObject);
        this.scene.add(objectGroup);

        // Store original renderer state
        const originalRenderTarget = this.renderer.getRenderTarget();
        const originalViewport = new THREE.Vector4();
        this.renderer.getViewport(originalViewport);
        const originalClearColor = this.renderer.getClearColor(new THREE.Color());
        const originalClearAlpha = this.renderer.getClearAlpha();
        const originalAutoClear = this.renderer.autoClear;

        // Setup for rendering
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.setClearColor(0x000000, 0); // Transparent black
        this.renderer.autoClear = true;

        // Render from each angle
        for (let i = 0; i < angles; i++) {
            const angle = (i / angles) * Math.PI * 2;

            // Position camera around object
            this.camera.position.set(
                Math.sin(angle) * cameraDistance,
                cameraDistance * 0.35,
                Math.cos(angle) * cameraDistance
            );
            this.camera.lookAt(0, objectSize.y * 0.35, 0);

            // Set viewport for this angle's slot
            this.renderer.setViewport(i * size, 0, size, size);
            this.renderer.clear(true, true, true);
            this.renderer.render(this.scene, this.camera);
        }

        // Restore renderer state
        this.renderer.setRenderTarget(originalRenderTarget);
        this.renderer.setViewport(originalViewport);
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
        this.renderer.autoClear = originalAutoClear;

        // Cleanup
        this.scene.remove(objectGroup);

        // Create atlas
        const atlas = new ImposterAtlas(renderTarget.texture, {
            angles,
            rows: 1,
            cols: angles,
            size,
            objectSize
        });

        atlas.renderTarget = renderTarget;
        return atlas;
    }

    dispose() {
        this.scene.clear();
    }
}

/**
 * ImposterMaterial - Shader material for camera-facing billboards
 */
export class ImposterMaterial extends THREE.ShaderMaterial {
    constructor(atlas, options = {}) {
        const vertexShader = `
            attribute float angleIndex;
            attribute vec2 uvOffset;
            
            varying vec2 vUv;
            varying float vOpacity;
            
            uniform float angleCount;
            uniform vec2 uvScale;
            
            void main() {
                // Billboard: always face camera
                vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
                
                // Get vertex position in camera space (billboard effect)
                vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                
                vec3 vertexPosition = mvPosition.xyz 
                    + cameraRight * position.x * 1.0
                    + cameraUp * position.y * 1.0;
                
                gl_Position = projectionMatrix * vec4(vertexPosition, 1.0);
                
                // Calculate UV with offset for atlas
                vUv = uvOffset + uv * uvScale;
                vOpacity = 1.0;
            }
        `;

        const fragmentShader = `
            uniform sampler2D atlas;
            uniform float opacity;
            
            varying vec2 vUv;
            varying float vOpacity;
            
            void main() {
                vec4 texColor = texture2D(atlas, vUv);
                
                // Alpha test for transparency
                if (texColor.a < 0.1) discard;
                
                gl_FragColor = vec4(texColor.rgb, texColor.a * opacity * vOpacity);
            }
        `;

        super({
            vertexShader,
            fragmentShader,
            uniforms: {
                atlas: { value: atlas.texture },
                angleCount: { value: atlas.angles },
                uvScale: { value: new THREE.Vector2(1.0 / atlas.cols, 1.0 / atlas.rows) },
                opacity: { value: options.opacity ?? 1.0 }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true,
            depthTest: true
        });

        this.atlas = atlas;
    }
}

/**
 * ImposterSystem - Main system for managing imposters
 */
export class ImposterSystem {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.baker = new ImposterBaker(renderer);
        this.groups = new Map(); // Map<uuid, ImposterGroup>

        // Configuration
        this.updateFrequency = 5; // Update every N frames
        this.frameCount = 0;

        // Reusable vectors
        this._cameraPosition = new THREE.Vector3();
        this._objectPosition = new THREE.Vector3();
    }

    /**
     * Bake an object into an imposter atlas
     * @param {THREE.Object3D} object - Object to bake
     * @param {Object} options - Baking options
     * @returns {ImposterAtlas}
     */
    bakeImposter(object, options = {}) {
        return this.baker.bake(object, options);
    }

    /**
     * Create an imposter mesh for instanced rendering
     * @param {ImposterAtlas} atlas - Pre-baked imposter atlas
     * @param {number} maxInstances - Maximum number of instances
     * @param {Object} options - Material options
     * @returns {THREE.InstancedMesh}
     */
    createImposterMesh(atlas, maxInstances, options = {}) {
        // Create billboard quad geometry
        const size = options.size || 1;
        const geometry = new THREE.PlaneGeometry(size, size);

        // Add instance attributes for UV offsets
        const uvOffsets = new Float32Array(maxInstances * 2);
        const angleIndices = new Float32Array(maxInstances);

        geometry.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2));
        geometry.setAttribute('angleIndex', new THREE.InstancedBufferAttribute(angleIndices, 1));

        // Create material
        const material = new ImposterMaterial(atlas, options);

        // Create instanced mesh
        const mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
        mesh.frustumCulled = true;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.isImposter = true;
        mesh.userData.atlas = atlas;

        return mesh;
    }

    /**
     * Register objects for imposter rendering
     * @param {THREE.Object3D[]} objects - 3D objects (or transforms)
     * @param {THREE.InstancedMesh} imposterMesh - Imposter mesh for distant rendering
     * @param {THREE.InstancedMesh|null} detailedMesh - Optional high-detail mesh for nearby
     * @param {Object} options - Options
     */
    register(objects, imposterMesh, detailedMesh = null, options = {}) {
        const switchDistance = options.switchDistance || 100;
        const fadeRange = options.fadeRange || 10;

        const group = {
            objects,
            imposterMesh,
            detailedMesh,
            switchDistance,
            fadeRange,
            currentStates: new Array(objects.length).fill('detailed'), // 'detailed' or 'imposter'
            visible: true
        };

        const uuid = THREE.MathUtils.generateUUID();
        this.groups.set(uuid, group);

        return uuid;
    }

    /**
     * Update imposter visibility based on camera distance
     * Call this in the render loop
     */
    update() {
        this.frameCount++;
        if (this.frameCount % this.updateFrequency !== 0) return;

        if (!this.camera) return;
        this.camera.getWorldPosition(this._cameraPosition);

        for (const [uuid, group] of this.groups) {
            if (!group.visible) continue;

            this._updateGroup(group);
        }
    }

    _updateGroup(group) {
        const { objects, imposterMesh, detailedMesh, switchDistance, fadeRange } = group;
        const atlas = imposterMesh.userData.atlas;

        const uvOffsets = imposterMesh.geometry.attributes.uvOffset;
        const angleIndices = imposterMesh.geometry.attributes.angleIndex;

        let imposterCount = 0;
        let detailedCount = 0;

        const matrix = new THREE.Matrix4();

        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];

            // Get object position
            if (obj.isVector3) {
                this._objectPosition.copy(obj);
            } else if (obj.isObject3D) {
                obj.getWorldPosition(this._objectPosition);
            } else if (obj.position) {
                this._objectPosition.copy(obj.position);
            } else {
                continue;
            }

            const distance = this._cameraPosition.distanceTo(this._objectPosition);

            if (distance > switchDistance) {
                // Use imposter
                const scale = obj.scale?.x || 1;
                matrix.compose(
                    this._objectPosition,
                    new THREE.Quaternion(),
                    new THREE.Vector3(scale, scale, scale)
                );
                imposterMesh.setMatrixAt(imposterCount, matrix);

                // Calculate which angle to show based on camera direction
                const toCam = new THREE.Vector3()
                    .subVectors(this._cameraPosition, this._objectPosition)
                    .normalize();
                let angle = Math.atan2(toCam.x, toCam.z);
                if (angle < 0) angle += Math.PI * 2;

                const angleIndex = Math.floor((angle / (Math.PI * 2)) * atlas.angles) % atlas.angles;

                // Set UV offset for this angle
                const uv = atlas.getUVForAngle(angleIndex);
                uvOffsets.setXY(imposterCount, uv.u, uv.v);
                angleIndices.setX(imposterCount, angleIndex);

                imposterCount++;
                group.currentStates[i] = 'imposter';

                // Hide detailed version
                if (detailedMesh && obj.visible !== undefined) {
                    obj.visible = false;
                }
            } else {
                // Use detailed mesh
                group.currentStates[i] = 'detailed';

                if (detailedMesh) {
                    // Show detailed version
                    if (obj.visible !== undefined) {
                        obj.visible = true;
                    }
                }
                detailedCount++;
            }
        }

        // Update imposter instance count and mark for GPU upload
        imposterMesh.count = imposterCount;
        imposterMesh.instanceMatrix.needsUpdate = true;
        uvOffsets.needsUpdate = true;
        angleIndices.needsUpdate = true;
    }

    /**
     * Unregister a group
     * @param {string} uuid 
     */
    unregister(uuid) {
        const group = this.groups.get(uuid);
        if (group) {
            // Cleanup
            if (group.imposterMesh) {
                group.imposterMesh.geometry.dispose();
                group.imposterMesh.material.dispose();
            }
            this.groups.delete(uuid);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        let totalObjects = 0;
        let imposterCount = 0;
        let detailedCount = 0;

        for (const [uuid, group] of this.groups) {
            totalObjects += group.objects.length;
            for (const state of group.currentStates) {
                if (state === 'imposter') imposterCount++;
                else detailedCount++;
            }
        }

        return {
            totalObjects,
            imposterCount,
            detailedCount,
            groups: this.groups.size
        };
    }

    /**
     * Dispose all resources
     */
    dispose() {
        for (const [uuid] of this.groups) {
            this.unregister(uuid);
        }
        this.baker.dispose();
    }
}

export default ImposterSystem;
