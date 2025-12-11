// HDRI Configuration for Photorealistic Lighting
// Switch between different 4K HDRI environments easily

export interface HDRIConfig {
    name: string;
    path: string;
    description: string;
    intensity: number;  // Recommended environment intensity
    skyboxBlur: number; // Blur amount for skybox (0.0 = sharp, 1.0 = very blurred)
}

// Available HDRI environments
export const AVAILABLE_HDRIS: HDRIConfig[] = [
    {
        name: 'Farmland Overcast',
        path: '/src/asset/HDRI/farmland_overcast_4k.env',
        description: 'Overcast farmland environment with soft natural lighting',
        intensity: 0.15,  // Very low to prevent overexposed bright spots
        skyboxBlur: 0.0   // Sharp skybox
    }
];

// Currently selected HDRI
export const CURRENT_HDRI: HDRIConfig = AVAILABLE_HDRIS[0]; // Farmland Overcast

