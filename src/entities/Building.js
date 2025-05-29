import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig.js';

export class Building {
  constructor(x, z, textureManager = null) {
    this.position = { x, z };
    this.textureManager = textureManager;
    this.meshes = [];
    this.dimensions = this.generateDimensions();
    this.buildingType = this.getBuildingType();

    this.createBuilding();
  }

  generateDimensions() {
    return {
      width: 8 + Math.random() * 12,
      height: 12 + Math.random() * 25,
      depth: 8 + Math.random() * 12
    };
  }

  getBuildingType() {
    const types = ['office', 'residential', 'industrial', 'commercial'];
    return types[Math.floor(Math.random() * types.length)];
  }

  createBuilding() {
    this.createMainStructure();
    this.createWindows();
    this.createRoof();
  }

  createMainStructure() {
    const { width, height, depth } = this.dimensions;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    // Choose material based on building type and texture manager availability
    let material;
    if (this.textureManager) {
      material = this.getMaterialForBuildingType();
    } else {
      // Fallback to old color system
      material = new THREE.MeshLambertMaterial({
        color: this.generateBuildingColor()
      });
    }

    const building = new THREE.Mesh(geometry, material);
    building.position.set(this.position.x, height / 2, this.position.z);
    building.castShadow = true;
    building.receiveShadow = true;
    building.name = 'building-main';

    this.meshes.push(building);
  }

  getMaterialForBuildingType() {
    switch (this.buildingType) {
      case 'office':
        return Math.random() > 0.5 ?
          this.textureManager.getMaterial('concrete') :
          this.textureManager.getMaterial('metal');

      case 'residential':
        return Math.random() > 0.3 ?
          this.textureManager.getMaterial('brick') :
          this.textureManager.getMaterial('concrete');

      case 'industrial':
        return this.textureManager.getMaterial('metal');

      case 'commercial':
        return Math.random() > 0.4 ?
          this.textureManager.getMaterial('concrete') :
          this.textureManager.getMaterial('brick');

      default:
        return this.textureManager.getRandomBuildingMaterial();
    }
  }

  createWindows() {
    const { width, height, depth } = this.dimensions;

    // Calculate window layout
    const windowRows = Math.max(2, Math.floor(height / 4));
    const windowsPerRow = Math.max(2, Math.floor(Math.min(width, depth) / 3));

    // Create windows on each face
    this.createWindowsForFace('front', width, height, depth, windowRows, windowsPerRow);
    this.createWindowsForFace('back', width, height, depth, windowRows, windowsPerRow);
    this.createWindowsForFace('left', depth, height, width, windowRows, windowsPerRow);
    this.createWindowsForFace('right', depth, height, width, windowRows, windowsPerRow);
  }

  createWindowsForFace(face, faceWidth, buildingHeight, faceDepth, rows, windowsPerRow) {
    const windowWidth = faceWidth / (windowsPerRow + 1) * 0.6;
    const windowHeight = Math.min(3, buildingHeight / rows * 0.4);

    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < windowsPerRow; col++) {
        const window = this.createWindow(windowWidth, windowHeight);

        const yPos = (buildingHeight / rows) * (row + 1);
        const xOffset = (faceWidth / (windowsPerRow + 1)) * (col + 1) - faceWidth / 2;

        // Position based on face
        switch (face) {
          case 'front':
            window.position.set(
              this.position.x + xOffset,
              yPos,
              this.position.z + faceDepth / 2 + 0.1
            );
            break;
          case 'back':
            window.position.set(
              this.position.x + xOffset,
              yPos,
              this.position.z - faceDepth / 2 - 0.1
            );
            break;
          case 'left':
            window.position.set(
              this.position.x - faceDepth / 2 - 0.1,
              yPos,
              this.position.z + xOffset
            );
            window.rotation.y = Math.PI / 2;
            break;
          case 'right':
            window.position.set(
              this.position.x + faceDepth / 2 + 0.1,
              yPos,
              this.position.z + xOffset
            );
            window.rotation.y = Math.PI / 2;
            break;
        }

        this.meshes.push(window);
      }
    }
  }

  createWindow(width, height) {
    const geometry = new THREE.PlaneGeometry(width, height);

    // Create realistic window material
    const material = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      metalness: 0.1,
      envMapIntensity: 1.0
    });

    const window = new THREE.Mesh(geometry, material);
    window.name = 'window';

    return window;
  }

  createRoof() {
    const { width, height, depth } = this.dimensions;

    // Simple flat roof with slight overhang
    const roofGeometry = new THREE.BoxGeometry(width + 1, 0.8, depth + 1);

    let roofMaterial;
    if (this.textureManager) {
      roofMaterial = this.textureManager.getMaterial('concrete');
    } else {
      roofMaterial = new THREE.MeshLambertMaterial({
        color: this.darkenColor(this.generateBuildingColor(), 0.4)
      });
    }

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 0.4, this.position.z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.name = 'roof-flat';

    this.meshes.push(roof);
  }

  // Fallback color generation for when texture manager isn't available
  generateBuildingColor() {
    const config = GameConfig.MATERIALS.BUILDING_COLORS;
    const hue = config.HUE_RANGE[0] + Math.random() * (config.HUE_RANGE[1] - config.HUE_RANGE[0]);
    const saturation = config.SATURATION;
    const lightness = config.LIGHTNESS_RANGE[0] + Math.random() * (config.LIGHTNESS_RANGE[1] - config.LIGHTNESS_RANGE[0]);

    return new THREE.Color().setHSL(hue, saturation, lightness);
  }

  darkenColor(color, factor) {
    const hsl = {};
    color.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l * (1 - factor));
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
    return {
      minX: this.position.x - this.dimensions.width / 2,
      maxX: this.position.x + this.dimensions.width / 2,
      minZ: this.position.z - this.dimensions.depth / 2,
      maxZ: this.position.z + this.dimensions.depth / 2,
      height: this.dimensions.height
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