import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig.js';

export class Tree {
  constructor(x, z, textureManager = null) {
    this.position = { x, z };
    this.textureManager = textureManager;
    this.meshes = [];
    this.dimensions = this.generateDimensions();
    this.treeType = this.getTreeType();

    this.createTree();
  }

  generateDimensions() {
    const scale = 0.7 + Math.random() * 0.6; // Random scale between 0.7 and 1.3

    return {
      trunkRadius: 0.3 + Math.random() * 0.4,
      trunkHeight: 6 + Math.random() * 6,
      foliageRadius: 3 + Math.random() * 3,
      scale
    };
  }

  getTreeType() {
    const types = ['oak', 'pine', 'birch', 'maple'];
    return types[Math.floor(Math.random() * types.length)];
  }

  createTree() {
    this.createTrunk();
    this.createFoliage();
    this.createRoots();
  }

  createTrunk() {
    const { trunkRadius, trunkHeight, scale } = this.dimensions;

    // Create slightly tapered trunk
    const geometry = new THREE.CylinderGeometry(
      trunkRadius * scale * 0.8,      // Top radius (smaller)
      (trunkRadius + 0.2) * scale,    // Bottom radius (larger)
      trunkHeight * scale,
      12,                             // More segments for smoother look
      4                               // Height segments for better lighting
    );

    // Add slight texture variation to trunk shape
    this.deformTrunk(geometry);

    let material;
    if (this.textureManager) {
      material = this.textureManager.getMaterial('bark');
    } else {
      // Fallback bark material
      material = new THREE.MeshLambertMaterial({
        color: GameConfig.MATERIALS.TREE.TRUNK_COLOR,
        roughness: 0.9
      });
    }

    const trunk = new THREE.Mesh(geometry, material);
    trunk.position.set(this.position.x, (trunkHeight * scale) / 2, this.position.z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.name = 'tree-trunk';

    this.meshes.push(trunk);
  }

  deformTrunk(geometry) {
    // Add slight randomness to trunk vertices for more natural look
    const vertices = geometry.attributes.position.array;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      // Add noise based on height
      const heightFactor = (y + this.dimensions.trunkHeight * this.dimensions.scale / 2) /
        (this.dimensions.trunkHeight * this.dimensions.scale);
      const noise = (Math.random() - 0.5) * 0.1 * heightFactor;

      vertices[i] += noise;
      vertices[i + 2] += noise;
    }

    geometry.computeVertexNormals();
  }

  createFoliage() {
    const foliageCount = this.getFoliageCount();

    for (let i = 0; i < foliageCount; i++) {
      this.createFoliageCluster(i, foliageCount);
    }
  }

  getFoliageCount() {
    switch (this.treeType) {
      case 'pine':
        return 4 + Math.floor(Math.random() * 3); // 4-6 clusters
      case 'oak':
        return 3 + Math.floor(Math.random() * 2); // 3-4 clusters
      case 'birch':
        return 2 + Math.floor(Math.random() * 2); // 2-3 clusters
      case 'maple':
        return 3 + Math.floor(Math.random() * 2); // 3-4 clusters
      default:
        return 3;
    }
  }

  createFoliageCluster(index, totalClusters) {
    const { foliageRadius, trunkHeight, scale } = this.dimensions;

    let geometry, radius, height;

    switch (this.treeType) {
      case 'pine':
        // Conical shape for pine trees
        radius = (foliageRadius * scale) * (1 - index * 0.2);
        geometry = new THREE.ConeGeometry(radius, radius * 1.5, 8);
        height = trunkHeight * scale * 0.7 + (index * radius * 0.8);
        break;

      case 'oak':
        // Irregular spheres for oak
        radius = (foliageRadius * scale) * (0.8 + Math.random() * 0.4);
        geometry = new THREE.SphereGeometry(radius, 8, 6);
        this.deformFoliage(geometry, 0.3);
        height = trunkHeight * scale + (index * radius * 0.4);
        break;

      case 'birch':
        // Smaller, more delicate foliage
        radius = (foliageRadius * scale * 0.8) * (0.9 + Math.random() * 0.2);
        geometry = new THREE.SphereGeometry(radius, 6, 5);
        height = trunkHeight * scale + (index * radius * 0.5);
        break;

      default:
        // Default maple-like foliage
        radius = (foliageRadius * scale) * (0.8 + Math.random() * 0.4);
        geometry = new THREE.SphereGeometry(radius, 8, 6);
        this.deformFoliage(geometry, 0.2);
        height = trunkHeight * scale + (index * radius * 0.3);
    }

    // Slight random offset for natural look
    const offsetX = (Math.random() - 0.5) * radius * 0.4;
    const offsetZ = (Math.random() - 0.5) * radius * 0.4;

    let material;
    if (this.textureManager) {
      material = this.textureManager.getMaterial('leaves');
    } else {
      material = new THREE.MeshLambertMaterial({
        color: this.generateFoliageColor(),
        transparent: true,
        alphaTest: 0.5
      });
    }

    const foliage = new THREE.Mesh(geometry, material);
    foliage.position.set(
      this.position.x + offsetX,
      height,
      this.position.z + offsetZ
    );
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    foliage.name = `tree-foliage-${this.treeType}`;

    this.meshes.push(foliage);
  }

  deformFoliage(geometry, intensity) {
    // Add randomness to foliage vertices for more organic look
    const vertices = geometry.attributes.position.array;

    for (let i = 0; i < vertices.length; i += 3) {
      const noise = (Math.random() - 0.5) * intensity;
      vertices[i] *= 1 + noise;
      vertices[i + 1] *= 1 + noise * 0.5;
      vertices[i + 2] *= 1 + noise;
    }

    geometry.computeVertexNormals();
  }

  createRoots() {
    // Add some visible roots for larger trees
    if (this.dimensions.scale > 1.0) {
      const rootCount = 3 + Math.floor(Math.random() * 3);

      for (let i = 0; i < rootCount; i++) {
        this.createRoot(i, rootCount);
      }
    }
  }

  createRoot(index, totalRoots) {
    const angle = (index / totalRoots) * Math.PI * 2;
    const length = 1 + Math.random() * 2;
    const radius = 0.1 + Math.random() * 0.1;

    const geometry = new THREE.CylinderGeometry(radius * 0.5, radius, length, 6);

    let material;
    if (this.textureManager) {
      material = this.textureManager.getMaterial('bark');
    } else {
      material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(GameConfig.MATERIALS.TREE.TRUNK_COLOR).multiplyScalar(0.8)
      });
    }

    const root = new THREE.Mesh(geometry, material);

    // Position root at base of tree
    const rootX = this.position.x + Math.cos(angle) * length * 0.5;
    const rootZ = this.position.z + Math.sin(angle) * length * 0.5;

    root.position.set(rootX, length * 0.3, rootZ);
    root.rotation.z = Math.sin(angle) * 0.3; // Slight tilt
    root.rotation.y = angle;

    root.castShadow = true;
    root.receiveShadow = true;
    root.name = 'tree-root';

    this.meshes.push(root);
  }

  generateFoliageColor() {
    // Color variation based on tree type
    let baseHue, saturation, lightness;

    switch (this.treeType) {
      case 'pine':
        baseHue = 0.25;       // Green
        saturation = 0.6;
        lightness = 0.3;
        break;
      case 'oak':
        baseHue = 0.28;       // Slightly yellow-green
        saturation = 0.5;
        lightness = 0.4;
        break;
      case 'birch':
        baseHue = 0.30;       // Light green
        saturation = 0.4;
        lightness = 0.5;
        break;
      case 'maple':
        // Seasonal variation - sometimes red/orange
        if (Math.random() > 0.7) {
          baseHue = 0.08;     // Orange-red
          saturation = 0.8;
          lightness = 0.5;
        } else {
          baseHue = 0.27;     // Green
          saturation = 0.5;
          lightness = 0.4;
        }
        break;
      default:
        baseHue = 0.27;
        saturation = 0.5;
        lightness = 0.4;
    }

    // Add slight variation
    const hueVariation = (Math.random() - 0.5) * 0.1;
    const lightnessVariation = (Math.random() - 0.5) * 0.2;

    return new THREE.Color().setHSL(
      baseHue + hueVariation,
      saturation,
      Math.max(0.1, Math.min(0.9, lightness + lightnessVariation))
    );
  }

  addToScene(scene) {
    this.meshes.forEach(mesh => {
      scene.add(mesh);
    });
  }

  removeFromScene(scene) {
    this.meshes.forEach(mesh => {
      scene.remove(mesh);
    });
  }

  getMeshes() {
    return this.meshes;
  }

  getPosition() {
    return { ...this.position };
  }

  getBounds() {
    const { foliageRadius, trunkHeight, scale } = this.dimensions;
    const radius = foliageRadius * scale;

    return {
      minX: this.position.x - radius,
      maxX: this.position.x + radius,
      minZ: this.position.z - radius,
      maxZ: this.position.z + radius,
      height: trunkHeight * scale + radius
    };
  }

  dispose() {
    this.meshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    this.meshes = [];
  }
}