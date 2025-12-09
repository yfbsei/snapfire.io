import { Scene } from '@babylonjs/core/scene';
import { Engine } from '@babylonjs/core/Engines/engine';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { createTerrain } from './terrain.js';
import { ThirdPersonPlayer } from './player.js';

// Import side effects for features we need
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export async function createScene(
    engine: Engine,
    canvas: HTMLCanvasElement,
    onProgress: (progress: number) => void
): Promise<Scene> {
    // Create scene
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.5, 0.7, 0.9, 1); // Sky blue background

    onProgress(10);

    // Initialize Havok Physics
    const havokInstance = await HavokPhysics();
    const havokPlugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

    onProgress(30);

    // Create camera
    const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 2, // Alpha (horizontal rotation)
        Math.PI / 3,  // Beta (vertical rotation)
        50,           // Radius (distance from target)
        new Vector3(0, 0, 0), // Target position
        scene
    );

    // Camera settings
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 200;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.wheelPrecision = 50;
    camera.panningSensibility = 100;

    onProgress(40);

    // Lighting setup
    // Ambient light from above
    const hemisphericLight = new HemisphericLight(
        'hemisphericLight',
        new Vector3(0, 1, 0),
        scene
    );
    hemisphericLight.intensity = 0.6;
    hemisphericLight.groundColor = new Color3(0.3, 0.3, 0.4);

    // Directional sun light
    const sunLight = new DirectionalLight(
        'sunLight',
        new Vector3(-1, -2, -1),
        scene
    );
    sunLight.position = new Vector3(50, 100, 50);
    sunLight.intensity = 0.8;
    sunLight.diffuse = new Color3(1, 0.95, 0.8);

    // Shadow generator
    const shadowGenerator = new ShadowGenerator(2048, sunLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    onProgress(60);

    // Create terrain from heatmap - waits for terrain physics to be fully loaded
    const terrainInfo = await createTerrain(scene, shadowGenerator);

    onProgress(80);

    // Calculate spawn position on terrain
    const spawnX = 0;
    const spawnZ = 0;
    const terrainHeight = terrainInfo.getHeightAtCoordinates(spawnX, spawnZ);
    const spawnPosition = new Vector3(spawnX, terrainHeight + 2, spawnZ); // +2 for character height buffer

    // Create third person player at terrain height
    const player = await ThirdPersonPlayer.create(scene, camera, shadowGenerator, spawnPosition);
    console.log('Player created at position:', player.getPosition());

    onProgress(100);

    return scene;
}

