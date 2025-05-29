import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { Building } from '../entities/Building.js';
import { Tree } from '../entities/Tree.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.ground = null;
    this.buildings = [];
    this.trees = [];
    this.worldObjects = [];
  }

  async generate() {
    console.log('🌍 Generating world...');

    this.createGround();
    this.createBuildings();
    this.createTrees();

    console.log('✅ World generation complete');
    console.log(`📊 Generated: ${this.buildings.length} buildings, ${this.trees.length} trees`);
  }

  createGround() {
    const geometry = new THREE.PlaneGeometry(GameConfig.WORLD.SIZE, GameConfig.WORLD.SIZE);
    const material = new THREE.MeshLambertMaterial({
      color: GameConfig.MATERIALS.GROUND_COLOR,
      side: THREE.DoubleSide
    });

    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';

    this.scene.add(this.ground);
    this.worldObjects.push(this.ground);
  }

  createBuildings() {
    const spawnRadius = GameConfig.WORLD.SIZE * 0.4;
    const minDistance = 25; // Minimum distance from player spawn

    for (let i = 0; i < GameConfig.WORLD.BUILDING_COUNT; i++) {
      let position, attempts = 0;

      // Find a valid position
      do {
        position = this.getRandomPosition(spawnRadius);
        attempts++;
      } while (this.isNearPlayerSpawn(position, minDistance) && attempts < 10);

      if (attempts >= 10) continue; // Skip if can't find valid position

      const building = new Building(position.x, position.z);
      building.addToScene(this.scene);

      this.buildings.push(building);
      this.worldObjects.push(...building.getMeshes());
    }
  }

  createTrees() {
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

      const tree = new Tree(position.x, position.z);
      tree.addToScene(this.scene);

      this.trees.push(tree);
      this.worldObjects.push(...tree.getMeshes());
    }
  }

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
      const dx = building.position.x - position.x;
      const dz = building.position.z - position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      return distance < minDistance;
    });
  }

  update(deltaTime) {
    // No enemies to update anymore!
    // This method is ready for future multiplayer player updates
  }

  // Removed getEnemies() - no more enemies!

  getWorldObjects() {
    return this.worldObjects;
  }

  getCollisionObjects() {
    // Return objects that should be tested for collision
    return [
      ...this.buildings.flatMap(b => b.getMeshes()),
      ...this.trees.flatMap(t => t.getMeshes())
    ];
  }

  dispose() {
    // Dispose of all world objects
    this.buildings.forEach(building => building.dispose());
    this.trees.forEach(tree => tree.dispose());

    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      this.ground.material.dispose();
    }

    this.buildings = [];
    this.trees = [];
    this.worldObjects = [];

    console.log('🌍 World disposed');
  }
}