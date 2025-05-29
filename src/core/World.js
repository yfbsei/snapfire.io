import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { Building } from '../entities/Building.js';
import { Tree } from '../entities/Tree.js';
import { TextureManager } from '../utils/TextureManager.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.textureManager = new TextureManager();

    // World objects
    this.terrain = null;
    this.buildings = [];
    this.trees = [];
    this.worldObjects = [];
  }

  async generate() {
    console.log('🌍 Generating enhanced world with textures...');

    // Initialize texture manager first
    await this.textureManager.init();

    // Generate world components
    this.createTerrain();
    this.createBuildings();
    this.createTrees();

    console.log('✅ Enhanced world generation complete');
    console.log(`📊 Generated: ${this.buildings.length} buildings, ${this.trees.length} trees`);
  }

  createTerrain() {
    console.log('🏔️ Creating realistic terrain...');

    const geometry = new THREE.PlaneGeometry(GameConfig.WORLD.SIZE, GameConfig.WORLD.SIZE);

    // Use grass material from texture manager
    const material = this.textureManager.getMaterial('grass');

    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';

    this.scene.add(this.terrain);
    this.worldObjects.push(this.terrain);
  }

  createBuildings() {
    console.log('🏢 Creating buildings with realistic materials...');

    const spawnRadius = GameConfig.WORLD.SIZE * 0.4;
    const minDistance = 25;

    for (let i = 0; i < GameConfig.WORLD.BUILDING_COUNT; i++) {
      let position, attempts = 0;

      do {
        position = this.getRandomPosition(spawnRadius);
        attempts++;
      } while (this.isNearPlayerSpawn(position, minDistance) && attempts < 10);

      if (attempts >= 10) continue;

      // Create building with texture manager
      const building = new Building(position.x, position.z, this.textureManager);
      building.addToScene(this.scene);

      this.buildings.push(building);
      this.worldObjects.push(...building.getMeshes());
    }
  }

  createTrees() {
    console.log('🌳 Creating trees with bark and foliage textures...');

    const spawnRadius = GameConfig.WORLD.SIZE * 0.4;
    const minDistance = 20;

    for (let i = 0; i < GameConfig.WORLD.TREE_COUNT; i++) {
      let position, attempts = 0;

      do {
        position = this.getRandomPosition(spawnRadius);
        attempts++;
      } while (
        (this.isNearPlayerSpawn(position, minDistance) ||
          this.isNearBuildings(position, 15)) &&
        attempts < 10
      );

      if (attempts >= 10) continue;

      // Create tree with texture manager
      const tree = new Tree(position.x, position.z, this.textureManager);
      tree.addToScene(this.scene);

      this.trees.push(tree);
      this.worldObjects.push(...tree.getMeshes());
    }
  }

  // Utility methods
  getRandomPosition(radius) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;

    return {
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance
    };
  }

  isNearPlayerSpawn(position, minDistance) {
    const distance = Math.sqrt(position.x * position.x + position.z * position.z);
    return distance < minDistance;
  }

  isNearBuildings(position, minDistance) {
    return this.buildings.some(building => {
      const buildingPos = building.getPosition();
      const dx = buildingPos.x - position.x;
      const dz = buildingPos.z - position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      return distance < minDistance;
    });
  }

  update(deltaTime) {
    // Future: Update dynamic world elements
  }

  getWorldObjects() {
    return this.worldObjects;
  }

  getCollisionObjects() {
    return [
      ...this.buildings.flatMap(b => b.getMeshes()),
      ...this.trees.flatMap(t => t.getMeshes())
    ];
  }

  dispose() {
    // Dispose of all world objects
    this.buildings.forEach(building => building.dispose());
    this.trees.forEach(tree => tree.dispose());

    // Dispose terrain
    if (this.terrain) {
      this.scene.remove(this.terrain);
      this.terrain.geometry.dispose();
      this.terrain.material.dispose();
    }

    // Dispose other objects
    this.worldObjects.forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });

    // Dispose texture manager
    this.textureManager.dispose();

    this.buildings = [];
    this.trees = [];
    this.worldObjects = [];

    console.log('🌍 Enhanced world disposed');
  }
}