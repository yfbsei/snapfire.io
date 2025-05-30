export const GameConfig = {
  // PUBG Erangel World settings (1km x 1km static map)
  WORLD: {
    SIZE: 1000, // 1km static world
    BUILDING_COUNT: 80, // Fixed count, not randomly generated
    TREE_COUNT: 150 // Fixed tree positions
  },

  // PUBG-style player settings
  PLAYER: {
    HEIGHT: 5,
    SPEED: {
      WALK: 0.4,  // PUBG walking speed
      RUN: 0.65,  // PUBG running speed  
      JUMP: 7     // PUBG jump height
    },
    HEALTH: 100,
    AMMO: {
      CURRENT: 30,
      MAX: 90
    },
    MOUSE_SENSITIVITY: 0.002,
    JUMP_COOLDOWN: 500, // PUBG-style jump cooldown
    AIR_CONTROL: 0.3    // Limited air control like PUBG
  },

  // PUBG-style physics
  PHYSICS: {
    GRAVITY: -0.3,      // PUBG gravity feel
    GROUND_LEVEL: 5,
    JUMP_BUFFER_TIME: 100,
    GROUND_FRICTION: 0.8,
    AIR_FRICTION: 0.95
  },

  // Camera settings for PUBG feel
  CAMERA: {
    FOV: 75,            // PUBG default FOV
    NEAR: 0.1,
    FAR: 1500           // Good for 1km map
  },

  // PUBG-style graphics
  GRAPHICS: {
    SKY_COLOR: 0xB8D4F0,  // PUBG sky color
    FOG_NEAR: 200,        // PUBG atmospheric fog
    FOG_FAR: 1200,
    ANTIALIAS: true,
    SHADOWS_ENABLED: true
  },

  // PUBG-style lighting
  LIGHTING: {
    AMBIENT_COLOR: 0x404857,  // Cooler ambient
    AMBIENT_INTENSITY: 0.3,   // Lower for drama
    SUN_COLOR: 0xFFF8DC,      // Warm sunlight
    SUN_INTENSITY: 1.5        // Strong sun like PUBG
  },

  // PUBG terrain and material colors
  MATERIALS: {
    GROUND_COLOR: 0x6B8E4A,   // PUBG terrain color
    BUILDING_COLORS: {
      HUE_RANGE: [0.05, 0.25],
      SATURATION: 0.4,
      LIGHTNESS_RANGE: [0.3, 0.7]
    },
    TREE: {
      TRUNK_COLOR: 0x8B4513,
      FOLIAGE_COLOR: 0x4A7C59   // More muted green
    },
    WINDOW_COLOR: 0x87CEEB,
    ROAD_COLOR: 0x2a2a2a      // Darker road color
  },

  // PUBG weapon settings
  WEAPONS: {
    DAMAGE: 25,
    MUZZLE_FLASH_DURATION: 80,  // Shorter flash
    MUZZLE_FLASH_COLOR: 0xffaa00,
    RANGE: 400                  // PUBG-appropriate range
  },

  // Performance settings optimized for PUBG-style visuals
  PERFORMANCE: {
    MAX_PIXEL_RATIO: 2,
    SHADOW_MAP_SIZE: 4096,      // High quality shadows
    LOD_DISTANCE: 200,
    CULLING_DISTANCE: 800
  },

  // Static PUBG Erangel locations (never change)
  LOCATIONS: {
    POCHINKI: { name: "Pochinki", x: 0, z: 100 },
    SCHOOL: { name: "School", x: -250, z: -200 },
    ROZHOK: { name: "Rozhok", x: 200, z: -100 },
    MILITARY_BASE: { name: "Military Base", x: -350, z: 250 },
    PRIMORSK: { name: "Primorsk", x: -300, z: -350 },
    LIPOVKA: { name: "Lipovka", x: 250, z: 200 },
    PRISON: { name: "Prison", x: -150, z: 350 },
    POWER_PLANT: { name: "Power Plant", x: 350, z: -250 }
  }
};