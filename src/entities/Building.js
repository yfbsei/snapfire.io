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
    this.createDetails();
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

    // Different roof types based on building type
    if (this.buildingType === 'residential' && Math.random() > 0.5) {
      this.createSlopedRoof(width, height, depth);
    } else {
      this.createFlatRoof(width, height, depth);
    }
  }

  createFlatRoof(width, height, depth) {
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

  createSlopedRoof(width, height, depth) {
    // Create a simple triangular roof
    const roofGeometry = new THREE.ConeGeometry(Math.max(width, depth) * 0.7, 4, 4);

    let roofMaterial;
    if (this.textureManager) {
      roofMaterial = this.textureManager.getMaterial('brick');
    } else {
      roofMaterial = new THREE.MeshLambertMaterial({
        color: 0x8B4513
      });
    }

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 2, this.position.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.name = 'roof-sloped';

    this.meshes.push(roof);
  }

  createDetails() {
    // Add architectural details based on building type
    switch (this.buildingType) {
      case 'office':
        this.createOfficeDetails();
        break;
      case 'residential':
        this.createResidentialDetails();
        break;
      case 'industrial':
        this.createIndustrialDetails();
        break;
      case 'commercial':
        this.createCommercialDetails();
        break;
    }
  }

  createOfficeDetails() {
    // Add entrance canopy
    const canopyGeometry = new THREE.BoxGeometry(6, 0.3, 2);
    const canopyMaterial = this.textureManager ?
      this.textureManager.getMaterial('metal') :
      new THREE.MeshLambertMaterial({ color: 0x888888 });

    const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
    canopy.position.set(
      this.position.x,
      3,
      this.position.z + this.dimensions.depth / 2 + 1
    );
    canopy.castShadow = true;
    canopy.name = 'canopy';

    this.meshes.push(canopy);
  }

  createResidentialDetails() {
    // Add balconies
    const balconyCount = Math.floor(this.dimensions.height / 8);

    for (let i = 0; i < balconyCount; i++) {
      const balconyGeometry = new THREE.BoxGeometry(4, 0.2, 1.5);
      const balconyMaterial = this.textureManager ?
        this.textureManager.getMaterial('concrete') :
        new THREE.MeshLambertMaterial({ color: 0xCCCCCC });

      const balcony = new THREE.Mesh(balconyGeometry, balconyMaterial);
      balcony.position.set(
        this.position.x,
        8 + i * 8,
        this.position.z + this.dimensions.depth / 2 + 0.75
      );
      balcony.castShadow = true;
      balcony.name = 'balcony';

      this.meshes.push(balcony);
    }
  }

  createIndustrialDetails() {
    // Add industrial pipes/vents
    const pipeGeometry = new THREE.CylinderGeometry(0.3, 0.3, this.dimensions.height * 0.3);
    const pipeMaterial = this.textureManager ?
      this.textureManager.getMaterial('metal') :
      new THREE.MeshLambertMaterial({ color: 0x666666 });

    const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
    pipe.position.set(
      this.position.x + this.dimensions.width * 0.3,
      this.dimensions.height + this.dimensions.height * 0.15,
      this.position.z
    );
    pipe.castShadow = true;
    pipe.name = 'pipe';

    this.meshes.push(pipe);
  }

  createCommercialDetails() {
    // Add storefront awning
    const awningGeometry = new THREE.CylinderGeometry(3, 3, this.dimensions.width * 0.8, 8, 1, true, 0, Math.PI);
    const awningMaterial = new THREE.MeshLambertMaterial({
      color: 0xFF6B6B,
      side: THREE.DoubleSide
    });

    const awning = new THREE.Mesh(awningGeometry, awningMaterial);
    awning.position.set(
      this.position.x,
      4,
      this.position.z + this.dimensions.depth / 2
    );
    awning.rotation.x = Math.PI;
    awning.castShadow = true;
    awning.name = 'awning';

    this.meshes.push(awning);
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