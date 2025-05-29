import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig.js';

export class Tree {
  constructor(x, z, textureManager = null) {
    this.position = { x, z };
    this.textureManager = textureManager;
    this.meshes = [];
    this.dimensions = this.generateDimensions();

    this.createTree();
  }

  generateDimensions() {
    const scale = 0.8 + Math.random() * 0.4; // Random scale between 0.8 and 1.2

    return {
      trunkRadius: 0.3 + Math.random() * 0.3,
      trunkHeight: 6 + Math.random() * 4,
      foliageRadius: 3 + Math.random() * 2,
      scale
    };
  }

  createTree() {
    this.createTrunk();
    this.createFoliage();
  }

  createTrunk() {
    const { trunkRadius, trunkHeight, scale } = this.dimensions;

    const geometry = new THREE.CylinderGeometry(
      trunkRadius * scale,
      (trunkRadius + 0.2) * scale,
      trunkHeight * scale,
      8
    );

    let material;
    if (this.textureManager) {
      material = this.textureManager.getMaterial('bark');
    } else {
      material = new THREE.MeshLambertMaterial({
        color: GameConfig.MATERIALS.TREE.TRUNK_COLOR
      });
    }

    const trunk = new THREE.Mesh(geometry, material);
    trunk.position.set(this.position.x, (trunkHeight * scale) / 2, this.position.z);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.name = 'tree-trunk';

    this.meshes.push(trunk);
  }

  createFoliage() {
    const { foliageRadius, trunkHeight, scale } = this.dimensions;

    // Create multiple foliage spheres for a more natural look
    const foliageCount = 2 + Math.floor(Math.random() * 2); // 2-3 foliage spheres

    for (let i = 0; i < foliageCount; i++) {
      const radius = (foliageRadius * scale) * (0.8 + Math.random() * 0.4);
      const height = trunkHeight * scale + (i * radius * 0.3);

      // Slight random offset for natural look
      const offsetX = (Math.random() - 0.5) * radius * 0.3;
      const offsetZ = (Math.random() - 0.5) * radius * 0.3;

      const geometry = new THREE.SphereGeometry(radius, 8, 6);

      let material;
      if (this.textureManager) {
        material = this.textureManager.getMaterial('leaves');
      } else {
        material = new THREE.MeshLambertMaterial({
          color: this.generateFoliageColor()
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
      foliage.name = 'tree-foliage';

      this.meshes.push(foliage);
    }
  }

  generateFoliageColor() {
    // Slight variation in green color
    const baseColor = new THREE.Color(GameConfig.MATERIALS.TREE.FOLIAGE_COLOR);
    const hsl = {};
    baseColor.getHSL(hsl);

    // Add slight variation
    const hueVariation = (Math.random() - 0.5) * 0.1;
    const lightnessVariation = (Math.random() - 0.5) * 0.2;

    return new THREE.Color().setHSL(
      hsl.h + hueVariation,
      hsl.s,
      Math.max(0.1, Math.min(0.9, hsl.l + lightnessVariation))
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