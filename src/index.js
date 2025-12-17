/**
 * OpenWorld Game Engine - Main Entry Point
 * A Three.js wrapper for open-world FPS/TPS game development
 */

// Core Engine
export { GameEngine } from './core/GameEngine.js';

// Game Objects
export { GameObject, Transform } from './core/GameObject.js';

// Input System
export { InputManager } from './core/input/InputManager.js';

// Scripting System
export { Script, ScriptManager } from './core/scripting/Script.js';

// Asset Loading
export { AssetLoader } from './core/assets/AssetLoader.js';

// Audio System
export { AudioManager } from './core/audio/AudioManager.js';

// Physics
export { PhysicsWorld, RigidBody } from './core/physics/PhysicsWorld.js';
export { CharacterController } from './core/physics/CharacterController.js';

// Animation
export { AnimationController, AnimatorComponent } from './core/animation/AnimationController.js';

// Camera Controllers
export { FPSCamera, TPSCamera, OrbitCamera } from './core/camera/CameraControllers.js';

// Prefabs
export {
    Prefabs,
    DualModePlayer,
    DualModePlayerScript,
    FPSPlayer,
    TPSPlayer,
    Enemy,
    Pickup,
    Projectile,
    FPSPlayerScript,
    TPSPlayerScript,
    EnemyAIScript,
    PickupScript,
    ProjectileScript
} from './prefabs/Prefabs.js';

// World Systems
export { TerrainSystem } from './world/TerrainSystem.js';
export { VegetationSystem } from './world/VegetationSystem.js';
export { WeatherSystem } from './world/WeatherSystem.js';
export { WaterSystem } from './world/WaterSystem.js';
export { WindAnimationSystem } from './world/WindAnimationSystem.js';

// Rendering Systems
export {
    WebGPUAdapter,
    isWebGPUAvailable,
    isWebGL2Available,
    RendererCapabilities
} from './core/rendering/WebGPUAdapter.js';
export { PostProcessing } from './core/rendering/PostProcessing.js';
export { ScreenRecorder } from './core/rendering/ScreenRecorder.js';

// AAA Rendering Passes
export { SSRPass } from './core/rendering/passes/SSRPass.js';
export { TAAPass } from './core/rendering/passes/TAAPass.js';
export { VolumetricPass } from './core/rendering/passes/VolumetricPass.js';
export { VirtualShadowMapPass } from './core/rendering/passes/VirtualShadowMapPass.js';
export { SSGIPass } from './core/rendering/passes/SSGIPass.js';
export { ContactShadowsPass } from './core/rendering/passes/ContactShadowsPass.js';

// Light Probes & Shadows
export { LightProbeSystem } from './core/rendering/LightProbeSystem.js';
export { CSMShadows } from './core/rendering/CSMShadows.js';

// Material System
export { DecalSystem, Decal } from './core/rendering/DecalSystem.js';
export { MaterialLibrary, materialLibrary } from './core/rendering/MaterialLibrary.js';

// Entity Component System (existing)
export { Entity, Component } from './core/ComponentSystem.js';

// Re-export THREE for convenience
import * as THREE from 'three';
export { THREE };

// Physics Systems
export { VehicleSystem } from './core/physics/VehicleSystem.js';
export { DestructionSystem, DestructibleObject } from './core/physics/DestructibleObject.js';



// GPU Compute Physics
export { GPUComputeManager, ComputeHelpers } from './core/compute/GPUComputeManager.js';
export { GPUParticleSystem, ParticleEmitter } from './core/compute/GPUParticleSystem.js';
export { ClothSimulation } from './core/compute/ClothSimulation.js';
export { SoftBodySimulation } from './core/compute/SoftBodySimulation.js';

// Audio System (Advanced)
export { AudioMixer, AudioChannel } from './core/audio/AudioMixer.js';

// Asset Pipeline
export { VirtualTexturing, VirtualTexture } from './core/assets/VirtualTexturing.js';
export { LODGenerator } from './core/assets/LODGenerator.js';

// Imposter System (Billboard LOD for distant rendering)
export { ImposterSystem, ImposterAtlas, ImposterBaker, ImposterMaterial } from './core/rendering/ImposterSystem.js';

// VFX System
export { TrailRenderer } from './core/vfx/TrailRenderer.js';
export { MeshParticleSystem } from './core/vfx/MeshParticleSystem.js';
export {
    VFXGraph,
    VFXNode,
    SpawnNode,
    InitializeNode,
    PhysicsNode,
    ColorNode,
    SizeNode,
    RenderNode
} from './core/vfx/VFXGraph.js';
