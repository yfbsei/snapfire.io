import * as THREE from 'three';
import { GameConfig } from '../core/GameConfig.js';

export class Building {
  constructor(x, z, textureManager = null, config = null) {
    this.position = { x, z };
    this.textureManager = textureManager;
    this.meshes = [];

    // Realistic building dimensions (like real PUBG buildings)
    if (config) {
      this.dimensions = {
        width: config.width || this.getRealisticWidth(config.style),
        height: config.height || this.getRealisticHeight(config.style),
        depth: config.depth || this.getRealisticDepth(config.style)
      };
      this.buildingStyle = config.style || 'house';
      this.buildingType = config.type || 'residential';
      this.materialType = config.material || 'concrete';
    } else {
      this.buildingStyle = 'house';
      this.materialType = 'concrete';
      this.dimensions = {
        width: this.getRealisticWidth('house'),
        height: this.getRealisticHeight('house'),
        depth: this.getRealisticDepth('house')
      };
    }

    this.createRealisticBuilding();
  }

  getRealisticWidth(style) {
    const widths = {
      house: 8 + Math.random() * 4,        // 8-12m (realistic house width)
      apartment: 12 + Math.random() * 8,   // 12-20m (apartment building)
      warehouse: 20 + Math.random() * 15,  // 20-35m (large warehouse)
      school_building: 25 + Math.random() * 15, // 25-40m (school)
      military_barracks: 20 + Math.random() * 10, // 20-30m
      barn: 12 + Math.random() * 8,        // 12-20m (farm barn)
      shed: 4 + Math.random() * 2,         // 4-6m (small shed)
      factory: 25 + Math.random() * 15,    // 25-40m
      farmhouse: 10 + Math.random() * 4,   // 10-14m
      office: 15 + Math.random() * 10      // 15-25m
    };
    return widths[style] || widths.house;
  }

  getRealisticHeight(style) {
    const heights = {
      house: 6 + Math.random() * 2,        // 6-8m (2 stories)
      apartment: 12 + Math.random() * 8,   // 12-20m (4-6 stories)
      warehouse: 8 + Math.random() * 4,    // 8-12m (tall warehouse)
      school_building: 8 + Math.random() * 4, // 8-12m (2-3 stories)
      military_barracks: 4 + Math.random() * 2, // 4-6m (1-2 stories)
      barn: 8 + Math.random() * 4,         // 8-12m (tall barn)
      shed: 3 + Math.random() * 1,         // 3-4m (small shed)
      factory: 10 + Math.random() * 5,     // 10-15m (industrial)
      farmhouse: 7 + Math.random() * 2,    // 7-9m (farmhouse)
      office: 9 + Math.random() * 6        // 9-15m (office building)
    };
    return heights[style] || heights.house;
  }

  getRealisticDepth(style) {
    const depths = {
      house: 8 + Math.random() * 4,        // 8-12m
      apartment: 10 + Math.random() * 5,   // 10-15m
      warehouse: 15 + Math.random() * 10,  // 15-25m
      school_building: 20 + Math.random() * 10, // 20-30m
      military_barracks: 10 + Math.random() * 5, // 10-15m
      barn: 10 + Math.random() * 5,        // 10-15m
      shed: 4 + Math.random() * 2,         // 4-6m
      factory: 20 + Math.random() * 10,    // 20-30m
      farmhouse: 8 + Math.random() * 3,    // 8-11m
      office: 12 + Math.random() * 8       // 12-20m
    };
    return depths[style] || depths.house;
  }

  createRealisticBuilding() {
    // Create building based on style with ALL methods implemented
    switch (this.buildingStyle) {
      case 'house':
      case 'residential':
        this.createRealisticHouse();
        break;
      case 'apartment':
        this.createRealisticApartment();
        break;
      case 'warehouse':
        this.createRealisticWarehouse();
        break;
      case 'military_barracks':
        this.createMilitaryBarracks();
        break;
      case 'school_building':
        this.createSchoolBuilding();
        break;
      case 'factory':
        this.createFactoryBuilding();
        break;
      case 'barn':
        this.createBarn();
        break;
      case 'shed':
        this.createShed();
        break;
      case 'farmhouse':
        this.createFarmhouse();
        break;
      case 'office':
        this.createOfficeBuilding();
        break;
      case 'bunker':
        this.createBunker();
        break;
      case 'watchtower':
      case 'guard_tower':
        this.createWatchtower();
        break;
      case 'prison_block':
        this.createPrisonBlock();
        break;
      case 'silo':
        this.createSilo();
        break;
      case 'power_station':
        this.createPowerStation();
        break;
      default:
        this.createRealisticHouse();
        break;
    }
  }

  createRealisticHouse() {
    console.log(`Creating realistic house at ${this.position.x}, ${this.position.z}`);

    // Main structure
    this.createMainStructure();

    // Realistic slanted roof
    this.createSlantedRoof();

    // Windows with proper frames
    this.createHouseWindows();

    // Front door with steps
    this.createFrontDoor();
    this.createFrontSteps();

    // Foundation
    this.createFoundation();

    // Random chimney
    if (Math.random() > 0.6) {
      this.createChimney();
    }

    // Small front porch (sometimes)
    if (Math.random() > 0.7) {
      this.createFrontPorch();
    }
  }

  createMainStructure() {
    const { width, height, depth } = this.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = this.getWallMaterial();

    const building = new THREE.Mesh(geometry, material);
    building.position.set(this.position.x, height / 2, this.position.z);
    building.castShadow = true;
    building.receiveShadow = true;
    building.name = 'main-structure';

    this.meshes.push(building);
  }

  createSlantedRoof() {
    const { width, height, depth } = this.dimensions;

    // Create realistic slanted roof
    const roofWidth = width + 1;
    const roofDepth = depth + 1;
    const roofHeight = 2.5;

    // Use pyramid geometry for simple slanted roof
    const roofGeometry = new THREE.ConeGeometry(
      Math.sqrt(roofWidth * roofWidth + roofDepth * roofDepth) / 2,
      roofHeight,
      4
    );

    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Brown roof tiles
      roughness: 0.8
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + roofHeight / 2, this.position.z);
    roof.rotation.y = Math.PI / 4; // Rotate for proper orientation
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.name = 'slanted-roof';

    this.meshes.push(roof);
  }

  createHouseWindows() {
    const { width, height, depth } = this.dimensions;

    // Front windows (2-3 windows based on width)
    const frontWindowCount = Math.max(2, Math.floor(width / 4));
    const windowSpacing = width / (frontWindowCount + 1);

    for (let i = 0; i < frontWindowCount; i++) {
      const windowX = this.position.x - width / 2 + windowSpacing * (i + 1);
      const windowY = height * 0.65; // Position at 2/3 height
      const windowZ = this.position.z + depth / 2 + 0.05;

      this.createRealisticWindow(windowX, windowY, windowZ, 1.2, 1.8, 0);
    }

    // Side windows (if building is wide enough)
    if (depth > 8) {
      const sideWindowX = this.position.x + width / 2 + 0.05;
      const sideWindowY = height * 0.65;
      const sideWindowZ = this.position.z;

      this.createRealisticWindow(sideWindowX, sideWindowY, sideWindowZ, 1.2, 1.8, Math.PI / 2);
    }
  }

  createRealisticWindow(x, y, z, windowWidth, windowHeight, rotation) {
    // Window frame (outer)
    const frameGeometry = new THREE.PlaneGeometry(windowWidth + 0.3, windowHeight + 0.3);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0xF5F5DC, // Beige window frame
      roughness: 0.7
    });

    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    frame.position.set(x, y, z);
    frame.rotation.y = rotation;
    frame.name = 'window-frame';
    this.meshes.push(frame);

    // Window glass
    const glassGeometry = new THREE.PlaneGeometry(windowWidth, windowHeight);
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.1
    });

    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.set(x, y, z + 0.01);
    glass.rotation.y = rotation;
    glass.name = 'window-glass';
    this.meshes.push(glass);

    // Window cross dividers
    this.createWindowDividers(x, y, z + 0.02, windowWidth, windowHeight, rotation);
  }

  createWindowDividers(x, y, z, width, height, rotation) {
    const dividerMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Brown wood
      roughness: 0.8
    });

    // Vertical divider
    const vDividerGeometry = new THREE.PlaneGeometry(0.08, height);
    const vDivider = new THREE.Mesh(vDividerGeometry, dividerMaterial);
    vDivider.position.set(x, y, z);
    vDivider.rotation.y = rotation;
    this.meshes.push(vDivider);

    // Horizontal divider
    const hDividerGeometry = new THREE.PlaneGeometry(width, 0.08);
    const hDivider = new THREE.Mesh(hDividerGeometry, dividerMaterial);
    hDivider.position.set(x, y, z);
    hDivider.rotation.y = rotation;
    this.meshes.push(hDivider);
  }

  createFrontDoor() {
    const { width, height, depth } = this.dimensions;

    // Door frame
    const doorFrameGeometry = new THREE.PlaneGeometry(1.4, 2.8);
    const doorFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0xF5F5DC, // Beige door frame
      roughness: 0.7
    });

    const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
    doorFrame.position.set(this.position.x, height * 0.35, this.position.z + depth / 2 + 0.05);
    doorFrame.name = 'door-frame';
    this.meshes.push(doorFrame);

    // Door
    const doorGeometry = new THREE.PlaneGeometry(1.2, 2.5);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x654321, // Dark brown door
      roughness: 0.8
    });

    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(this.position.x, height * 0.35, this.position.z + depth / 2 + 0.06);
    door.name = 'front-door';
    this.meshes.push(door);

    // Door handle
    const handleGeometry = new THREE.SphereGeometry(0.05);
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700, // Gold handle
      metalness: 0.9,
      roughness: 0.1
    });

    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(this.position.x + 0.4, height * 0.35, this.position.z + depth / 2 + 0.07);
    this.meshes.push(handle);
  }

  createFrontSteps() {
    const { depth } = this.dimensions;

    // Create 3 front steps
    for (let i = 0; i < 3; i++) {
      const stepGeometry = new THREE.BoxGeometry(2.5, 0.2, 0.4);
      const stepMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080, // Gray concrete steps
        roughness: 0.9
      });

      const step = new THREE.Mesh(stepGeometry, stepMaterial);
      step.position.set(
        this.position.x,
        0.1 + i * 0.2,
        this.position.z + depth / 2 + 0.8 + i * 0.2
      );
      step.receiveShadow = true;
      step.castShadow = true;
      step.name = `front-step-${i}`;

      this.meshes.push(step);
    }
  }

  createFoundation() {
    const { width, depth } = this.dimensions;

    const foundationGeometry = new THREE.BoxGeometry(width + 0.8, 0.6, depth + 0.8);
    const foundationMaterial = new THREE.MeshStandardMaterial({
      color: 0x696969, // Dark gray foundation
      roughness: 0.9
    });

    const foundation = new THREE.Mesh(foundationGeometry, foundationMaterial);
    foundation.position.set(this.position.x, 0.3, this.position.z);
    foundation.receiveShadow = true;
    foundation.name = 'foundation';

    this.meshes.push(foundation);
  }

  createChimney() {
    const { width, height } = this.dimensions;

    const chimneyGeometry = new THREE.BoxGeometry(1.2, 5, 1.2);
    const chimneyMaterial = new THREE.MeshStandardMaterial({
      color: 0xB22222, // Red brick chimney
      roughness: 0.8
    });

    const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
    chimney.position.set(
      this.position.x + width * 0.25,
      height + 2.5,
      this.position.z - 2
    );
    chimney.castShadow = true;
    chimney.name = 'chimney';

    this.meshes.push(chimney);
  }

  createFrontPorch() {
    const { width, depth } = this.dimensions;

    // Porch roof
    const porchRoofGeometry = new THREE.BoxGeometry(width * 0.6, 0.3, 3);
    const porchRoofMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.8
    });

    const porchRoof = new THREE.Mesh(porchRoofGeometry, porchRoofMaterial);
    porchRoof.position.set(
      this.position.x,
      3.5,
      this.position.z + depth / 2 + 1.5
    );
    porchRoof.castShadow = true;

    this.meshes.push(porchRoof);

    // Porch supports
    for (let i = 0; i < 2; i++) {
      const supportGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3);
      const supportMaterial = new THREE.MeshStandardMaterial({
        color: 0xF5F5DC,
        roughness: 0.7
      });

      const support = new THREE.Mesh(supportGeometry, supportMaterial);
      support.position.set(
        this.position.x + (i === 0 ? -width * 0.25 : width * 0.25),
        1.5,
        this.position.z + depth / 2 + 1.5
      );
      support.castShadow = true;

      this.meshes.push(support);
    }
  }

  // ALL BUILDING TYPE METHODS IMPLEMENTED

  createRealisticApartment() {
    this.createMainStructure();
    this.createFlatRoof();
    this.createApartmentWindows();
    this.createApartmentBalconies();
    this.createFoundation();
  }

  createApartmentWindows() {
    const { width, height, depth } = this.dimensions;
    const floors = Math.max(2, Math.floor(height / 3));
    const windowsPerFloor = Math.max(3, Math.floor(width / 3));

    for (let floor = 0; floor < floors; floor++) {
      for (let window = 0; window < windowsPerFloor; window++) {
        const x = this.position.x - width / 2 + (width / (windowsPerFloor + 1)) * (window + 1);
        const y = (floor + 0.5) * (height / floors);
        const z = this.position.z + depth / 2 + 0.05;

        this.createRealisticWindow(x, y, z, 1.0, 1.5, 0);
      }
    }
  }

  createApartmentBalconies() {
    const { width, height, depth } = this.dimensions;
    const floors = Math.floor(height / 3);

    for (let floor = 1; floor < floors; floor++) {
      if (Math.random() > 0.4) {
        const balconyGeometry = new THREE.BoxGeometry(width * 0.4, 0.2, 2);
        const balconyMaterial = this.getWallMaterial();

        const balcony = new THREE.Mesh(balconyGeometry, balconyMaterial);
        balcony.position.set(
          this.position.x,
          floor * (height / floors),
          this.position.z + depth / 2 + 1
        );
        balcony.castShadow = true;

        this.meshes.push(balcony);
      }
    }
  }

  createRealisticWarehouse() {
    this.createMainStructure();
    this.createMetalRoof();
    this.createWarehouseWindows();
    this.createLoadingDocks();
    this.createFoundation();
  }

  createWarehouseWindows() {
    const { width, height, depth } = this.dimensions;
    const windowCount = Math.max(2, Math.floor(width / 8));

    for (let i = 0; i < windowCount; i++) {
      const x = this.position.x - width / 2 + (width / (windowCount + 1)) * (i + 1);
      const y = height * 0.7;
      const z = this.position.z + depth / 2 + 0.05;

      this.createRealisticWindow(x, y, z, 2, 3, 0);
    }
  }

  createLoadingDocks() {
    const { width, height, depth } = this.dimensions;

    const dockGeometry = new THREE.BoxGeometry(width * 0.3, 4, 4);
    const dockMaterial = this.getWallMaterial();

    const dock = new THREE.Mesh(dockGeometry, dockMaterial);
    dock.position.set(
      this.position.x,
      2,
      this.position.z + depth / 2 + 2
    );
    dock.castShadow = true;

    this.meshes.push(dock);
  }

  createSchoolBuilding() {
    this.createMainStructure();
    this.createFlatRoof();
    this.createSchoolWindows();
    this.createSchoolEntrance();
    this.createFoundation();
  }

  createSchoolWindows() {
    const { width, height, depth } = this.dimensions;
    const floors = Math.max(2, Math.floor(height / 4));
    const windowsPerFloor = Math.max(4, Math.floor(width / 4));

    for (let floor = 0; floor < floors; floor++) {
      for (let window = 0; window < windowsPerFloor; window++) {
        const x = this.position.x - width / 2 + (width / (windowsPerFloor + 1)) * (window + 1);
        const y = (floor + 0.5) * (height / floors);
        const z = this.position.z + depth / 2 + 0.05;

        this.createRealisticWindow(x, y, z, 1.5, 2.5, 0);
      }
    }
  }

  createSchoolEntrance() {
    const { width, depth } = this.dimensions;

    const entranceGeometry = new THREE.BoxGeometry(8, 4, 3);
    const entranceMaterial = this.getWallMaterial();

    const entrance = new THREE.Mesh(entranceGeometry, entranceMaterial);
    entrance.position.set(
      this.position.x,
      2,
      this.position.z + depth / 2 + 1.5
    );
    entrance.castShadow = true;

    this.meshes.push(entrance);
  }

  createMilitaryBarracks() {
    this.createMainStructure();
    this.createFlatRoof();
    this.createSmallWindows();
    this.createFoundation();
  }

  createSmallWindows() {
    const { width, height, depth } = this.dimensions;
    const windowCount = Math.max(2, Math.floor(width / 6));

    for (let i = 0; i < windowCount; i++) {
      const x = this.position.x - width / 2 + (width / (windowCount + 1)) * (i + 1);
      const y = height * 0.6;
      const z = this.position.z + depth / 2 + 0.05;

      this.createRealisticWindow(x, y, z, 0.8, 1.2, 0);
    }
  }

  createFactoryBuilding() {
    this.createMainStructure();
    this.createMetalRoof();
    this.createIndustrialWindows();
    this.addIndustrialDetails();
    this.createFoundation();
  }

  createIndustrialWindows() {
    const { width, height, depth } = this.dimensions;
    const windowCount = Math.max(3, Math.floor(width / 6));

    for (let i = 0; i < windowCount; i++) {
      const x = this.position.x - width / 2 + (width / (windowCount + 1)) * (i + 1);
      const y = height * 0.65;
      const z = this.position.z + depth / 2 + 0.05;

      this.createRealisticWindow(x, y, z, 1.5, 2, 0);
    }
  }

  addIndustrialDetails() {
    const { width, height } = this.dimensions;

    // Industrial chimney
    const chimneyGeometry = new THREE.CylinderGeometry(1, 1, 8);
    const chimneyMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8
    });

    const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
    chimney.position.set(
      this.position.x + width * 0.3,
      height + 4,
      this.position.z
    );
    chimney.castShadow = true;

    this.meshes.push(chimney);
  }

  createBarn() {
    this.createMainStructure();
    this.createBarnRoof();
    this.createBarnDoors();
    this.createFoundation();
  }

  createBarnRoof() {
    const { width, height, depth } = this.dimensions;

    const roofGeometry = new THREE.CylinderGeometry(0, width * 0.8, 4, 4);
    roofGeometry.rotateZ(Math.PI / 2);

    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B0000, // Red barn roof
      roughness: 0.8
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 2, this.position.z);
    roof.castShadow = true;

    this.meshes.push(roof);
  }

  createBarnDoors() {
    const { width, height, depth } = this.dimensions;

    const doorGeometry = new THREE.PlaneGeometry(width * 0.6, height * 0.7);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.9
    });

    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(
      this.position.x,
      height * 0.35,
      this.position.z + depth / 2 + 0.05
    );

    this.meshes.push(door);
  }

  createShed() {
    this.createMainStructure();
    this.createSimpleRoof();
    this.createShedDoor();
    this.createFoundation();
  }

  createSimpleRoof() {
    const { width, height, depth } = this.dimensions;

    const roofGeometry = new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 0.25, this.position.z);
    roof.castShadow = true;

    this.meshes.push(roof);
  }

  createShedDoor() {
    const { height, depth } = this.dimensions;

    const doorGeometry = new THREE.PlaneGeometry(1.5, height * 0.8);
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      roughness: 0.9
    });

    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(
      this.position.x,
      height * 0.4,
      this.position.z + depth / 2 + 0.05
    );

    this.meshes.push(door);
  }

  createFarmhouse() {
    // Farmhouse is like a house but slightly larger
    this.createRealisticHouse();
  }

  createOfficeBuilding() {
    this.createMainStructure();
    this.createFlatRoof();
    this.createOfficeWindows();
    this.createFoundation();
  }

  createOfficeWindows() {
    const { width, height, depth } = this.dimensions;
    const floors = Math.max(2, Math.floor(height / 3.5));
    const windowsPerFloor = Math.max(3, Math.floor(width / 3));

    for (let floor = 0; floor < floors; floor++) {
      for (let window = 0; window < windowsPerFloor; window++) {
        const x = this.position.x - width / 2 + (width / (windowsPerFloor + 1)) * (window + 1);
        const y = (floor + 0.5) * (height / floors);
        const z = this.position.z + depth / 2 + 0.05;

        this.createRealisticWindow(x, y, z, 1.3, 2, 0);
      }
    }
  }

  createBunker() {
    // Low, thick bunker
    const { width, depth } = this.dimensions;
    const bunkerHeight = 3;

    const geometry = new THREE.BoxGeometry(width, bunkerHeight, depth);
    const material = this.getWallMaterial();

    const bunker = new THREE.Mesh(geometry, material);
    bunker.position.set(this.position.x, bunkerHeight / 2, this.position.z);
    bunker.castShadow = true;
    bunker.receiveShadow = true;

    this.meshes.push(bunker);
    this.createFoundation();
  }

  createWatchtower() {
    // Tall, narrow tower
    const { height } = this.dimensions;
    const towerWidth = 3;

    const geometry = new THREE.BoxGeometry(towerWidth, height, towerWidth);
    const material = this.getWallMaterial();

    const tower = new THREE.Mesh(geometry, material);
    tower.position.set(this.position.x, height / 2, this.position.z);
    tower.castShadow = true;
    tower.receiveShadow = true;

    this.meshes.push(tower);
    this.createFoundation();
    this.createTowerTop();
  }

  createTowerTop() {
    const { height } = this.dimensions;

    const topGeometry = new THREE.BoxGeometry(4, 1, 4);
    const topMaterial = this.getWallMaterial();

    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(this.position.x, height + 0.5, this.position.z);
    top.castShadow = true;

    this.meshes.push(top);
  }

  createPrisonBlock() {
    this.createMainStructure();
    this.createFlatRoof();
    this.createPrisonWindows();
    this.createFoundation();
  }

  createPrisonWindows() {
    const { width, height, depth } = this.dimensions;
    const windowCount = Math.max(4, Math.floor(width / 4));

    for (let i = 0; i < windowCount; i++) {
      const x = this.position.x - width / 2 + (width / (windowCount + 1)) * (i + 1);
      const y = height * 0.7;
      const z = this.position.z + depth / 2 + 0.05;

      // Small, barred windows
      this.createRealisticWindow(x, y, z, 0.6, 0.8, 0);
    }
  }

  createSilo() {
    const { height } = this.dimensions;
    const siloRadius = 4;

    const geometry = new THREE.CylinderGeometry(siloRadius, siloRadius, height, 12);
    const material = this.getWallMaterial();

    const silo = new THREE.Mesh(geometry, material);
    silo.position.set(this.position.x, height / 2, this.position.z);
    silo.castShadow = true;
    silo.receiveShadow = true;

    this.meshes.push(silo);
    this.createSiloTop();
  }

  createSiloTop() {
    const { height } = this.dimensions;

    const topGeometry = new THREE.ConeGeometry(4.5, 3, 12);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8
    });

    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(this.position.x, height + 1.5, this.position.z);
    top.castShadow = true;

    this.meshes.push(top);
  }

  createPowerStation() {
    this.createMainStructure();
    this.createIndustrialRoof();
    this.createPowerStationDetails();
    this.createFoundation();
  }

  createIndustrialRoof() {
    const { width, height, depth } = this.dimensions;

    const roofGeometry = new THREE.BoxGeometry(width + 2, 2, depth + 2);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.3
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 1, this.position.z);
    roof.castShadow = true;

    this.meshes.push(roof);
  }

  createPowerStationDetails() {
    const { width, height } = this.dimensions;

    // Large industrial chimney
    const chimneyGeometry = new THREE.CylinderGeometry(2, 2, 15);
    const chimneyMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8
    });

    const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
    chimney.position.set(
      this.position.x + width * 0.4,
      height + 7.5,
      this.position.z
    );
    chimney.castShadow = true;

    this.meshes.push(chimney);
  }

  createFlatRoof() {
    const { width, height, depth } = this.dimensions;

    const roofGeometry = new THREE.BoxGeometry(width + 1, 0.8, depth + 1);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 0.8
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 0.4, this.position.z);
    roof.castShadow = true;
    roof.receiveShadow = true;

    this.meshes.push(roof);
  }

  createMetalRoof() {
    const { width, height, depth } = this.dimensions;

    const roofGeometry = new THREE.BoxGeometry(width + 2, 1.5, depth + 2);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.3
    });

    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.set(this.position.x, height + 0.75, this.position.z);
    roof.castShadow = true;

    this.meshes.push(roof);
  }

  // Material helper methods
  getWallMaterial() {
    if (this.textureManager && this.textureManager.isTextureSetLoaded(this.materialType)) {
      return this.textureManager.getMaterial(this.materialType);
    } else {
      const colors = {
        brick: 0xB22222,
        concrete: 0xBBBBBB,
        metal: 0x888888,
        wood: 0x8B4513
      };
      return new THREE.MeshStandardMaterial({
        color: colors[this.materialType] || colors.concrete,
        roughness: 0.8
      });
    }
  }

  // Interface methods
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