import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig.js';

export class Building {
  constructor(x, z) {
    this.position = { x, z };
    this.meshes = [];
    this.dimensions = this.generateDimensions();
    
    this.createBuilding();
  }

  generateDimensions() {
    return {
      width: 5 + Math.random() * 15,
      height: 10 + Math.random() * 30,
      depth: 5 + Math.random() * 15
    };
  }

  createBuilding() {
    this.createMainStructure();
    this.createWindows();
    this.createRoof();
  }

  createMainStructure() {
    const { width, height, depth } = this.dimensions;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({
      color: this.generateBuildingColor()
    });
    
    const building = new THREE.Mesh(geometry, material);
    building.position.set(this.position.x, height / 2, this.position.z);
    building.castShadow = true;
    building.receiveShadow = true;
    building.name = 'building';
    
    this.meshes.push(building);
  }

  createWindows() {
    const { width, height, depth } = this.dimensions;
    const windowCount = Math.floor(height / 5); // One window per 5 units of height
    
    for (let i = 0; i < windowCount; i++) {
      const windowHeight = 2;
      const windowWidth = Math.min(width * 0.8, depth * 0.8);
      
      // Front and back windows
      const frontWindow = this.createWindow(windowWidth, windowHeight);
      frontWindow.position.set(
        this.position.x,
        5 + i * (height / windowCount),
        this.position.z + depth / 2 + 0.1
      );
      this.meshes.push(frontWindow);
      
      const backWindow = this.createWindow(windowWidth, windowHeight);
      backWindow.position.set(
        this.position.x,
        5 + i * (height / windowCount),
        this.position.z - depth / 2 - 0.1
      );
      this.meshes.push(backWindow);
      
      // Side windows (if building is wide enough)
      if (width > 8) {
        const sideWindow1 = this.createWindow(depth * 0.6, windowHeight);
        sideWindow1.position.set(
          this.position.x + width / 2 + 0.1,
          5 + i * (height / windowCount),
          this.position.z
        );
        sideWindow1.rotation.y = Math.PI / 2;
        this.meshes.push(sideWindow1);
        
        const sideWindow2 = this.createWindow(depth * 0.6, windowHeight);
        sideWindow2.position.set(
          this.position.x - width / 2 - 0.1,
          5 + i * (height / windowCount),
          this.position.z
        );
        sideWindow2.rotation.y = Math.PI / 2;
        this.meshes.push(sideWindow2);
      }
    }
  }

  createWindow(width, height) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshLambertMaterial({
      color: GameConfig.MATERIALS.WINDOW_COLOR,
      transparent: true,
      opacity: 0.7
    });
    
    return new THREE.Mesh(geometry, material);
  }

  createRoof() {
    const { width, height, depth } = this.dimensions;
    
    // Simple flat roof with slight overhang
    const roofGeometry = new THREE.BoxGeometry(width + 1, 0.5, depth + 1);
    const roofMaterial = new THREE.MeshLambertMaterial({
      color: this.darkenColor(this.generateBuildingColor(), 0.3)
    });
    
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 0.25, this.position.z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.name = 'roof';
    
    this.meshes.push(roof);
  }

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