export const GameConfig = {
  // World settings
  WORLD: {
    SIZE: 500,
    BUILDING_COUNT: 50,
    TREE_COUNT: 30
    // Removed ENEMY_COUNT - no more bots!
  },

  // Player settings
  PLAYER: {
    HEIGHT: 5,
    SPEED: {
      WALK: 0.3,
      RUN: 0.5,
      JUMP: 5
    },
    HEALTH: 100,
    AMMO: {
      CURRENT: 30,
      MAX: 90
    },
    MOUSE_SENSITIVITY: 0.002,
    JUMP_COOLDOWN: 800, // milliseconds between jumps
    AIR_CONTROL: 0.3 // reduced air movement control
  },

  // Physics
  PHYSICS: {
    GRAVITY: -0.2, // reduced from -0.3 for longer air time
    GROUND_LEVEL: 5,
    JUMP_BUFFER_TIME: 100, // coyote time in ms
    GROUND_FRICTION: 0.8,
    AIR_FRICTION: 0.98
  },

  // Camera settings
  CAMERA: {
    FOV: 75,
    NEAR: 0.1,
    FAR: 1000
  },

  // Graphics settings
  GRAPHICS: {
    SKY_COLOR: 0x87CEEB,
    FOG_NEAR: 100,
    FOG_FAR: 500,
    ANTIALIAS: true,
    SHADOWS_ENABLED: true
  },

  // Lighting
  LIGHTING: {
    AMBIENT_COLOR: 0x404040,
    AMBIENT_INTENSITY: 0.6,
    SUN_COLOR: 0xffffff,
    SUN_INTENSITY: 0.1
  },

  // Materials
  MATERIALS: {
    GROUND_COLOR: 0x4a7c59,
    BUILDING_COLORS: {
      HUE_RANGE: [0.1, 0.2],
      SATURATION: 0.3,
      LIGHTNESS_RANGE: [0.4, 0.7]
    },
    TREE: {
      TRUNK_COLOR: 0x8B4513,
      FOLIAGE_COLOR: 0x228B22
    },
    ENEMY_COLOR: 0xff4444,
    WINDOW_COLOR: 0x87CEEB
  },

  // Weapon settings
  WEAPONS: {
    DAMAGE: 25,
    MUZZLE_FLASH_DURATION: 100,
    MUZZLE_FLASH_COLOR: 0xffff00
  },

  // Performance
  PERFORMANCE: {
    MAX_PIXEL_RATIO: 2,
    SHADOW_MAP_SIZE: 2048
  }
};