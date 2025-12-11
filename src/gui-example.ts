import { Scene } from '@babylonjs/core/scene';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { Button } from '@babylonjs/gui/2D/controls/button';
import { Control } from '@babylonjs/gui/2D/controls/control';

/**
 * Example GUI System - Shows how to use BabylonJS GUI
 * 
 * This demonstrates creating 2D UI overlays using @babylonjs/gui
 */
export class GUIExample {
    private scene: Scene;
    private advancedTexture: AdvancedDynamicTexture;

    constructor(scene: Scene) {
        this.scene = scene;

        // Create fullscreen UI
        this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene);
    }

    /**
     * Create a simple info panel at top-left corner
     */
    createInfoPanel(text: string): Rectangle {
        const panel = new Rectangle('infoPanel');
        panel.width = '300px';
        panel.height = '80px';
        panel.cornerRadius = 8;
        panel.color = 'white';
        panel.thickness = 2;
        panel.background = 'rgba(0, 0, 0, 0.7)';
        panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        panel.left = 20;
        panel.top = 20;

        const textBlock = new TextBlock();
        textBlock.text = text;
        textBlock.color = 'white';
        textBlock.fontSize = 18;

        panel.addControl(textBlock);
        this.advancedTexture.addControl(panel);

        return panel;
    }

    /**
     * Create a button (example: settings button)
     */
    createButton(
        name: string,
        text: string,
        onClick: () => void
    ): Button {
        const button = Button.CreateSimpleButton(name, text);
        button.width = '150px';
        button.height = '50px';
        button.color = 'white';
        button.background = 'rgba(0, 100, 200, 0.8)';
        button.cornerRadius = 8;
        button.thickness = 2;
        button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        button.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        button.top = 20;
        button.left = -20;

        // Hover effect
        button.onPointerEnterObservable.add(() => {
            button.background = 'rgba(0, 120, 240, 1.0)';
        });

        button.onPointerOutObservable.add(() => {
            button.background = 'rgba(0, 100, 200, 0.8)';
        });

        // Click handler
        button.onPointerClickObservable.add(onClick);

        this.advancedTexture.addControl(button);

        return button;
    }

    /**
     * Create FPS counter
     */
    createFPSCounter(): TextBlock {
        const fpsText = new TextBlock('fps');
        fpsText.text = 'FPS: 0';
        fpsText.color = 'lime';
        fpsText.fontSize = 16;
        fpsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        fpsText.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        fpsText.top = -20;
        fpsText.left = -20;

        this.advancedTexture.addControl(fpsText);

        // Update FPS every frame
        this.scene.onBeforeRenderObservable.add(() => {
            const fps = this.scene.getEngine().getFps();
            fpsText.text = `FPS: ${fps.toFixed(0)}`;
        });

        return fpsText;
    }

    /**
     * Remove all GUI elements
     */
    dispose(): void {
        this.advancedTexture.dispose();
    }
}
