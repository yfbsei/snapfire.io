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
    this.terrainChunks = [];

    // World generation settings
    this.worldSize = GameConfig.WORLD.SIZE;
    this.chunkSize = 100; // Size of terrain chunks for LOD
    this.heightScale = 8; // Maximum terrain height variation
  }

  async generate() {
    console.log('🌍 Generating enhanced world with textures...');

    // Initialize texture manager first
    await this.textureManager.init();

    // Generate world components
    this.createTerrain();
    this.createBuildings();
    this.createTrees();
    this.createEnvironmentalDetails();

    console.log('✅ Enhanced world generation complete');
    console.log(`📊 Generated: ${this.buildings.length} buildings, ${this.trees.length} trees`);
  }

  createTerrain() {
    console.log('🏔️ Creating realistic terrain...');

    // Create main terrain
    this.createMainTerrain();

    // Create terrain variations
    this.createTerrainPatches();
  }

  createMainTerrain() {
    // Create heightmap for terrain variation
    const resolution = 128;
    const heightData = this.generateHeightMap(resolution);

    // Create terrain geometry
    const geometry = new THREE.PlaneGeometry(
      this.worldSize,
      this.worldSize,
      resolution - 1,
      resolution - 1
    );

    // Apply height data to vertices
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const z = vertices[i + 2];
      const heightIndex = Math.floor((x / this.worldSize + 0.5) * resolution) +
        Math.floor((z / this.worldSize + 0.5) * resolution) * resolution;

      if (heightIndex >= 0 && heightIndex < heightData.length) {
        vertices[i + 1] = heightData[heightIndex] * this.heightScale;
      }
    }

    geometry.computeVertexNormals();

    // Use grass material as base terrain
    const material = this.textureManager.getMaterial('grass');

    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.rotation.x = -Math.PI / 2;
    this.terrain.receiveShadow = true;
    this.terrain.name = 'terrain';

    this.scene.add(this.terrain);
    this.worldObjects.push(this.terrain);
  }

  generateHeightMap(resolution) {
    const heightData = new Float32Array(resolution * resolution);

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const x = (i / resolution) * 8;
        const z = (j / resolution) * 8;

        // Generate height using multiple octaves of noise
        let height = 0;
        height += Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.5;
        height += Math.sin(x * 1.2) * Math.cos(z * 1.2) * 0.25;
        height += Math.sin(x * 2.4) * Math.cos(z * 2.4) * 0.125;

        // Add some randomness
        height += (Math.random() - 0.5) * 0.1;

        heightData[i + j * resolution] = height;
      }
    }

    return heightData;
  }

  createTerrainPatches() {
    // Create patches of different terrain types
    const patchCount = 15;

    for (let i = 0; i < patchCount; i++) {
      const position = this.getRandomPosition(this.worldSize * 0.4);
      const size = 20 + Math.random() * 30;
      const terrainType = this.getRandomTerrainType();

      this.createTerrainPatch(position, size, terrainType);
    }
  }

  createTerrainPatch(position, size, terrainType) {
    const geometry = new THREE.CircleGeometry(size, 16);
    const material = this.textureManager.getMaterial(terrainType);

    const patch = new THREE.Mesh(geometry, material);
    patch.position.set(position.x, 0.1, position.z);
    patch.rotation.x = -Math.PI / 2;
    patch.receiveShadow = true;
    patch.name = `terrain-patch-${terrainType}`;

    this.scene.add(patch);
    this.worldObjects.push(patch);
  }

  getRandomTerrainType() {
    const types = ['dirt', 'rock'];
    return types[Math.floor(Math.random() * types.length)];
  }

  createBuildings() {
    console.log('🏢 Creating buildings with realistic materials...');

    const spawnRadius = this.worldSize * 0.4;
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

    const spawnRadius = this.worldSize * 0.4;
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

  createEnvironmentalDetails() {
    console.log('🌿 Adding environmental details...');

    // Add rocks
    this.createRocks();

    // Add paths
    this.createPaths();

    // Add water features (optional)
    // this.createWater();
  }

  createRocks() {
    const rockCount = 25;

    for (let i = 0; i < rockCount; i++) {
      const position = this.getRandomPosition(this.worldSize * 0.45);

      // Skip if too close to buildings or spawn
      if (this.isNearPlayerSpawn(position, 15) || this.isNearBuildings(position, 10)) {
        continue;
      }

      const rock = this.createRock(position);
      this.scene.add(rock);
      this.worldObjects.push(rock);
    }
  }

  createRock(position) {
    // Random rock size and shape
    const size = 1 + Math.random() * 3;
    const geometry = new THREE.SphereGeometry(size, 8, 6);

    // Deform geometry for more natural look
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i] *= 0.8 + Math.random() * 0.4;
      vertices[i + 1] *= 0.6 + Math.random() * 0.8;
      vertices[i + 2] *= 0.8 + Math.random() * 0.4;
    }
    geometry.computeVertexNormals();

    const material = this.textureManager.getMaterial('rock');
    const rock = new THREE.Mesh(geometry, material);

    rock.position.set(position.x, size * 0.3, position.z);
    rock.rotation.y = Math.random() * Math.PI * 2;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.name = 'rock';

    return rock;
  }

  createPaths() {
    // Create simple dirt paths between some buildings
    const pathCount = 5;

    for (let i = 0; i < pathCount && i < this.buildings.length - 1; i++) {
      const start = this.buildings[i].getPosition();
      const end = this.buildings[i + 1].getPosition();

      this.createPath(start, end);
    }
  }

  createPath(start, end) {
    const distance = Math.sqrt(
      (end.x - start.x) ** 2 + (end.z - start.z) ** 2
    );

    const pathWidth = 3;
    const geometry = new THREE.PlaneGeometry(pathWidth, distance);
    const material = this.textureManager.getMaterial('dirt');

    const path = new THREE.Mesh(geometry, material);

    // Position path between start and end
    path.position.set(
      (start.x + end.x) / 2,
      0.05,
      (start.z + end.z) / 2
    );

    // Rotate to face the correct direction
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = angle - Math.PI / 2;

    path.receiveShadow = true;
    path.name = 'path';

    this.scene.add(path);
    this.worldObjects.push(path);
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
    // - Wind effects on trees
    // - Water animations
    // - Dynamic lighting
  }

  getWorldObjects() {
    return this.worldObjects;
  }

  getCollisionObjects() {
    return [
      ...this.buildings.flatMap(b => b.getMeshes()),
      ...this.trees.flatMap(t => t.getMeshes()),
      ...this.worldObjects.filter(obj => obj.name === 'rock')
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
    this.terrainChunks = [];

    console.log('🌍 Enhanced world disposed');
  }
}