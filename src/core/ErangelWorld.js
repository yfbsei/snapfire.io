import * as THREE from 'three';
import { GameConfig } from './GameConfig.js';
import { Building } from '../entities/Building.js';
import { Tree } from '../entities/Tree.js';
import { TextureManager } from '../utils/TextureManager.js';

export class ErangelWorld {
    constructor(scene) {
        this.scene = scene;
        this.textureManager = new TextureManager();

        // Static Erangel configuration (1km x 1km)
        this.worldSize = 1000;

        // World objects
        this.terrain = null;
        this.buildings = [];
        this.trees = [];
        this.roads = [];
        this.worldObjects = [];

        // Static predefined Erangel locations (never change)
        this.staticLocations = this.defineStaticErangelLocations();
        this.staticTrees = this.defineStaticTreeLocations();
        this.staticBuildings = this.defineStaticBuildingLocations();
    }

    defineStaticErangelLocations() {
        // Fixed PUBG Erangel locations that never change
        return {
            // Major landmarks (exactly where they should be)
            pochinki: {
                x: 0, z: 100,
                buildings: [
                    { x: -20, z: 80, style: 'house', material: 'brick' },
                    { x: 15, z: 90, style: 'house', material: 'concrete' },
                    { x: -10, z: 110, style: 'house', material: 'brick' },
                    { x: 25, z: 75, style: 'house', material: 'concrete' },
                    { x: -30, z: 95, style: 'house', material: 'brick' },
                    { x: 20, z: 105, style: 'office', material: 'concrete' },
                    { x: -5, z: 85, style: 'house', material: 'brick' },
                    { x: 10, z: 120, style: 'house', material: 'concrete' },
                    { x: -25, z: 110, style: 'house', material: 'brick' },
                    { x: 30, z: 90, style: 'house', material: 'concrete' }
                ]
            },

            school: {
                x: -250, z: -200,
                buildings: [
                    { x: -250, z: -200, style: 'school_building', material: 'brick' },
                    { x: -230, z: -180, style: 'office', material: 'concrete' },
                    { x: -270, z: -220, style: 'house', material: 'brick' },
                    { x: -240, z: -210, style: 'house', material: 'brick' }
                ]
            },

            rozhok: {
                x: 200, z: -100,
                buildings: [
                    { x: 180, z: -90, style: 'house', material: 'brick' },
                    { x: 210, z: -110, style: 'house', material: 'concrete' },
                    { x: 190, z: -120, style: 'house', material: 'concrete' },
                    { x: 220, z: -80, style: 'house', material: 'brick' },
                    { x: 200, z: -100, style: 'apartment', material: 'concrete' },
                    { x: 185, z: -105, style: 'house', material: 'brick' }
                ]
            },

            military_base: {
                x: -350, z: 250,
                buildings: [
                    { x: -350, z: 250, style: 'military_barracks', material: 'concrete' },
                    { x: -330, z: 230, style: 'bunker', material: 'concrete' },
                    { x: -370, z: 270, style: 'watchtower', material: 'concrete' },
                    { x: -340, z: 260, style: 'military_barracks', material: 'concrete' },
                    { x: -360, z: 240, style: 'bunker', material: 'concrete' },
                    { x: -350, z: 280, style: 'warehouse', material: 'metal' }
                ]
            },

            power_plant: {
                x: 350, z: -250,
                buildings: [
                    { x: 350, z: -250, style: 'power_station', material: 'concrete' },
                    { x: 330, z: -230, style: 'silo', material: 'metal' },
                    { x: 370, z: -270, style: 'warehouse', material: 'metal' },
                    { x: 340, z: -260, style: 'factory', material: 'metal' },
                    { x: 360, z: -240, style: 'silo', material: 'metal' }
                ]
            },

            prison: {
                x: -150, z: 350,
                buildings: [
                    { x: -150, z: 350, style: 'prison_block', material: 'concrete' },
                    { x: -130, z: 330, style: 'watchtower', material: 'concrete' },
                    { x: -170, z: 370, style: 'office', material: 'concrete' },
                    { x: -140, z: 360, style: 'prison_block', material: 'concrete' }
                ]
            },

            primorsk: {
                x: -300, z: -350,
                buildings: [
                    { x: -300, z: -350, style: 'house', material: 'brick' },
                    { x: -280, z: -330, style: 'shed', material: 'metal' },
                    { x: -320, z: -370, style: 'house', material: 'brick' },
                    { x: -290, z: -360, style: 'house', material: 'concrete' }
                ]
            },

            lipovka: {
                x: 250, z: 200,
                buildings: [
                    { x: 250, z: 200, style: 'house', material: 'brick' },
                    { x: 230, z: 180, style: 'barn', material: 'metal' },
                    { x: 270, z: 220, style: 'house', material: 'brick' }
                ]
            }
        };
    }

    defineStaticTreeLocations() {
        // Fixed tree positions for consistent map
        const trees = [];

        // Forest area 1 (west side)
        for (let i = 0; i < 30; i++) {
            trees.push({
                x: -400 + Math.random() * 100,
                z: -100 + Math.random() * 200
            });
        }

        // Forest area 2 (east side)
        for (let i = 0; i < 25; i++) {
            trees.push({
                x: 300 + Math.random() * 150,
                z: 50 + Math.random() * 150
            });
        }

        // Scattered trees around map
        const scatteredPositions = [
            { x: -100, z: -50 }, { x: 50, z: -150 }, { x: -200, z: 100 },
            { x: 150, z: 50 }, { x: -50, z: 200 }, { x: 100, z: -200 },
            { x: -150, z: -100 }, { x: 200, z: 150 }, { x: -250, z: 50 },
            { x: 250, z: -50 }, { x: -300, z: 150 }, { x: 300, z: 100 }
        ];

        scatteredPositions.forEach(pos => {
            trees.push({ x: pos.x, z: pos.z });
        });

        return trees;
    }

    defineStaticBuildingLocations() {
        // Additional scattered buildings outside major locations
        return [
            { x: -100, z: -200, style: 'farmhouse', material: 'brick' },
            { x: 150, z: 300, style: 'warehouse', material: 'metal' },
            { x: -200, z: 150, style: 'house', material: 'brick' },
            { x: 250, z: -200, style: 'barn', material: 'metal' },
            { x: 50, z: 250, style: 'shed', material: 'metal' },
            { x: -300, z: -100, style: 'house', material: 'brick' },
            { x: 100, z: -300, style: 'farmhouse', material: 'brick' }
        ];
    }

    async generate() {
        console.log('🏝️ Generating realistic PUBG Erangel world...');

        // Initialize texture manager
        await this.textureManager.init();

        // Generate static world (same every time)
        this.createRealisticTerrain();
        this.generateStaticRoads();
        this.generateStaticLocations();
        this.generateStaticTrees();
        this.generateStaticBuildings();
        this.addPowerLines();

        console.log('✅ Realistic PUBG Erangel world generated');
        console.log(`📊 Static world: ${this.buildings.length} buildings, ${this.trees.length} trees`);
    }

    createRealisticTerrain() {
        console.log('🌍 Creating realistic grass terrain...');

        // Create terrain with realistic PUBG-style elevation
        const geometry = new THREE.PlaneGeometry(this.worldSize, this.worldSize, 128, 128);

        // Apply realistic height variation like PUBG Erangel
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];

            let height = 0;

            // Create hills and valleys like PUBG
            // Main hill in northeast (like the hill near School)
            const hillCenterX = -200;
            const hillCenterY = -150;
            const hillDistance = Math.sqrt((x - hillCenterX) ** 2 + (y - hillCenterY) ** 2);
            if (hillDistance < 200) {
                height += Math.max(0, 30 - (hillDistance / 200) * 30);
            }

            // Secondary hill near power plant
            const hill2X = 300;
            const hill2Y = -200;
            const hill2Distance = Math.sqrt((x - hill2X) ** 2 + (y - hill2Y) ** 2);
            if (hill2Distance < 150) {
                height += Math.max(0, 20 - (hill2Distance / 150) * 20);
            }

            // Valley areas
            const valleyX = 0;
            const valleyY = 0;
            const valleyDistance = Math.sqrt((x - valleyX) ** 2 + (y - valleyY) ** 2);
            height -= Math.max(0, 5 - (valleyDistance / 300) * 5);

            // Gentle rolling terrain
            height += Math.sin(x * 0.003) * Math.cos(y * 0.003) * 8;
            height += Math.sin(x * 0.001) * Math.sin(y * 0.001) * 5;

            // Small scale variation
            height += (Math.random() - 0.5) * 2;

            // Clamp height to reasonable values
            height = Math.max(-3, Math.min(50, height));

            vertices[i + 2] = height;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        // Create realistic grass terrain material like the reference image
        const terrainMaterial = this.createRealisticGrassMaterial();

        this.terrain = new THREE.Mesh(geometry, terrainMaterial);
        this.terrain.rotation.x = -Math.PI / 2;
        this.terrain.receiveShadow = true;
        this.terrain.name = 'erangel_terrain';

        this.scene.add(this.terrain);
        this.worldObjects.push(this.terrain);
    }

    createRealisticGrassMaterial() {
        // Create extremely realistic grass texture like the reference image
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const context = canvas.getContext('2d');

        // Base dirt/earth color (brownish)
        context.fillStyle = '#8B7355';
        context.fillRect(0, 0, 1024, 1024);

        // Add dirt patches and variations
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = Math.random() * 15 + 5;

            // Various earth tones
            const earthColors = ['#A0926B', '#9A8A6B', '#8B7355', '#7A6B4F', '#6B5D41'];
            context.fillStyle = earthColors[Math.floor(Math.random() * earthColors.length)];

            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }

        // Add grass patches (green areas)
        for (let i = 0; i < 1500; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = Math.random() * 8 + 2;

            // Various grass colors - mix of green and brown like real grass
            const grassColors = ['#4A5D23', '#5D6B2A', '#3A4B1C', '#6B7A32', '#4F5A28'];
            context.fillStyle = grassColors[Math.floor(Math.random() * grassColors.length)];

            context.globalAlpha = 0.7; // Semi-transparent for realistic blending
            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }

        // Add dried grass/straw elements (yellow/brown)
        context.globalAlpha = 0.5;
        for (let i = 0; i < 1000; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const size = Math.random() * 4 + 1;

            // Dried grass colors
            const strawColors = ['#D4C4A0', '#B8A882', '#C9B896', '#A89970'];
            context.fillStyle = strawColors[Math.floor(Math.random() * strawColors.length)];

            context.beginPath();
            context.arc(x, y, size, 0, Math.PI * 2);
            context.fill();
        }

        // Add small twigs and debris
        context.globalAlpha = 0.3;
        context.strokeStyle = '#8B4513';
        context.lineWidth = 1;
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 1024;
            const y = Math.random() * 1024;
            const length = Math.random() * 20 + 5;
            const angle = Math.random() * Math.PI * 2;

            context.beginPath();
            context.moveTo(x, y);
            context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            context.stroke();
        }

        context.globalAlpha = 1.0;

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(30, 30); // Large repeat for realistic scale
        texture.anisotropy = 16;
        texture.colorSpace = THREE.SRGBColorSpace;

        return new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.0,
            color: 0xFFFFFF // Pure white to not tint the texture
        });
    }

    generateStaticRoads() {
        console.log('🛣️ Generating static road network...');

        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.8
        });

        // Fixed road network (same every time)
        const staticRoads = [
            // Main road from Pochinki to School
            { start: { x: 0, z: 100 }, end: { x: -250, z: -200 }, width: 15 },
            // Road from Pochinki to Rozhok
            { start: { x: 0, z: 100 }, end: { x: 200, z: -100 }, width: 12 },
            // Road to Military Base
            { start: { x: 0, z: 100 }, end: { x: -350, z: 250 }, width: 12 },
            // Road to Power Plant
            { start: { x: 200, z: -100 }, end: { x: 350, z: -250 }, width: 10 },
            // Coastal road to Primorsk
            { start: { x: -250, z: -200 }, end: { x: -300, z: -350 }, width: 8 }
        ];

        staticRoads.forEach(road => {
            this.createRoad(road.start, road.end, road.width, roadMaterial);
        });
    }

    createRoad(start, end, width, material) {
        const startPos = new THREE.Vector3(start.x, 0.3, start.z);
        const endPos = new THREE.Vector3(end.x, 0.3, end.z);
        const distance = startPos.distanceTo(endPos);

        const geometry = new THREE.BoxGeometry(distance, 0.2, width);
        const road = new THREE.Mesh(geometry, material);

        road.position.copy(startPos.clone().lerp(endPos, 0.5));
        road.lookAt(endPos);
        road.rotateY(Math.PI / 2);

        this.scene.add(road);
        this.roads.push(road);
        this.worldObjects.push(road);
    }

    generateStaticLocations() {
        console.log('🏘️ Generating static locations with realistic buildings...');

        // Build each location exactly as defined
        for (const [locationName, location] of Object.entries(this.staticLocations)) {
            console.log(`🏗️ Building ${locationName}`);

            location.buildings.forEach(buildingData => {
                const building = new Building(buildingData.x, buildingData.z, this.textureManager, {
                    style: buildingData.style,
                    // Use realistic proportions - smaller and more appropriate for the scale
                    width: this.getRealisticBuildingSize(buildingData.style).width,
                    height: this.getRealisticBuildingSize(buildingData.style).height,
                    depth: this.getRealisticBuildingSize(buildingData.style).depth,
                    material: buildingData.material,
                    type: locationName
                });

                building.addToScene(this.scene);
                this.buildings.push(building);
                this.worldObjects.push(...building.getMeshes());
            });
        }
    }

    getRealisticBuildingSize(style) {
        // More realistic building sizes - scaled down to be more proportional
        const sizes = {
            house: { width: 10, height: 7, depth: 10 },           // Real house size
            apartment: { width: 16, height: 15, depth: 12 },      // 4-5 story apartment
            warehouse: { width: 25, height: 12, depth: 20 },      // Large warehouse
            school_building: { width: 30, height: 10, depth: 25 }, // School
            military_barracks: { width: 20, height: 6, depth: 12 }, // Military building
            barn: { width: 15, height: 10, depth: 12 },           // Farm barn
            shed: { width: 5, height: 4, depth: 5 },              // Small shed
            factory: { width: 30, height: 15, depth: 25 },        // Factory
            farmhouse: { width: 12, height: 8, depth: 10 },       // Farmhouse
            office: { width: 18, height: 12, depth: 15 },         // Office building
            bunker: { width: 12, height: 4, depth: 12 },          // Bunker
            watchtower: { width: 4, height: 20, depth: 4 },       // Watchtower
            prison_block: { width: 40, height: 8, depth: 20 },    // Prison
            silo: { width: 6, height: 20, depth: 6 },             // Grain silo
            power_station: { width: 35, height: 18, depth: 30 }   // Power plant
        };

        return sizes[style] || sizes.house;
    }

    generateStaticTrees() {
        console.log('🌲 Generating static trees...');

        this.staticTrees.forEach(treePos => {
            const tree = new Tree(treePos.x, treePos.z, this.textureManager);
            tree.addToScene(this.scene);
            this.trees.push(tree);
            this.worldObjects.push(...tree.getMeshes());
        });
    }

    generateStaticBuildings() {
        console.log('🏠 Generating static scattered buildings...');

        this.staticBuildings.forEach(buildingData => {
            const building = new Building(buildingData.x, buildingData.z, this.textureManager, {
                style: buildingData.style,
                width: this.getRealisticBuildingSize(buildingData.style).width,
                height: this.getRealisticBuildingSize(buildingData.style).height,
                depth: this.getRealisticBuildingSize(buildingData.style).depth,
                material: buildingData.material,
                type: 'scattered'
            });

            building.addToScene(this.scene);
            this.buildings.push(building);
            this.worldObjects.push(...building.getMeshes());
        });
    }

    addPowerLines() {
        console.log('⚡ Adding power lines and transmission towers...');

        // Add transmission towers like in PUBG
        const towerPositions = [
            { x: 100, z: 0 },
            { x: 200, z: 50 },
            { x: 300, z: -100 },
            { x: -100, z: 150 },
            { x: -200, z: 0 }
        ];

        towerPositions.forEach(pos => {
            this.createTransmissionTower(pos.x, pos.z);
        });
    }

    createTransmissionTower(x, z) {
        const towerMaterial = new THREE.MeshStandardMaterial({
            color: 0x666666,
            metalness: 0.8,
            roughness: 0.3
        });

        // Main tower structure
        const towerGeometry = new THREE.BoxGeometry(2, 40, 2);
        const tower = new THREE.Mesh(towerGeometry, towerMaterial);
        tower.position.set(x, 20, z);
        tower.castShadow = true;
        tower.name = 'transmission_tower';

        // Cross beams
        const beamGeometry = new THREE.BoxGeometry(15, 1, 1);
        const beam1 = new THREE.Mesh(beamGeometry, towerMaterial);
        beam1.position.set(x, 35, z);

        const beam2 = new THREE.Mesh(beamGeometry, towerMaterial);
        beam2.position.set(x, 25, z);

        this.scene.add(tower, beam1, beam2);
        this.worldObjects.push(tower, beam1, beam2);
    }

    update(deltaTime) {
        // Static world - no updates needed
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
        // Cleanup all objects
        this.buildings.forEach(building => building.dispose());
        this.trees.forEach(tree => tree.dispose());

        if (this.terrain) {
            this.scene.remove(this.terrain);
            this.terrain.geometry.dispose();
            this.terrain.material.dispose();
        }

        this.roads.forEach(road => {
            this.scene.remove(road);
            road.geometry.dispose();
            road.material.dispose();
        });

        this.worldObjects.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });

        this.textureManager.dispose();

        this.buildings = [];
        this.trees = [];
        this.roads = [];
        this.worldObjects = [];

        console.log('🏝️ Realistic PUBG Erangel world disposed');
    }
}