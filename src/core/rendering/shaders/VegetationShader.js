import * as THREE from 'three';

/**
 * Vegetation Shader
 * Supports:
 * - GPU Instancing
 * - Wind Animation (Vertex displacement)
 * - Player Interaction (Bending away from player)
 * - Gradient Color / Simple Texture
 */
export const VegetationShader = {
    uniforms: {
        time: { value: 0 },
        playerPos: { value: new THREE.Vector3(0, 0, 0) },
        bendRadius: { value: 1.5 },
        bendStrength: { value: 1.0 },
        windSpeed: { value: 1.0 },
        colorTop: { value: new THREE.Color(0x44aa44) },
        colorBottom: { value: new THREE.Color(0x225522) },
        textureMap: { value: null }
    },

    vertexShader: /* glsl */`
        precision highp float;
        
        // Instanced attributes
        // instanceMatrix is auto-provided by THREE.InstancedMesh
        
        uniform float time;
        uniform vec3 playerPos;
        uniform float bendRadius;
        uniform float bendStrength;
        uniform float windSpeed;
        
        varying vec2 vUv;
        varying float vHeight;
        
        // Simple noise function
        float noise(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        void main() {
            vUv = uv;
            vHeight = position.y;
            
            // World position of instance (approximation)
            // We get the world PROPERLY by multiplying instanceMatrix
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            
            // ---- Wind Effect ----
            // Only affects top of grass (y > 0)
            float stiffness = position.y; // 0 at bottom, 1 at top (assuming 1 unit high mesh)
            
            float windX = sin(time * windSpeed + worldPosition.x * 0.5) * 0.1;
            float windZ = cos(time * windSpeed * 0.8 + worldPosition.z * 0.5) * 0.1;
            
            vec3 displacement = vec3(windX, 0.0, windZ) * stiffness;
            
            // ---- Interactive Bending ----
            vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float dist = distance(instancePos.xz, playerPos.xz);
            
            if (dist < bendRadius) {
                // Direction away from player
                vec3 dir = normalize(instancePos - playerPos);
                dir.y = 0.0;
                
                // Falloff based on distance
                float influence = (1.0 - dist / bendRadius); // 1.0 at center, 0 at edge
                influence = pow(influence, 2.0); // Non-linear falloff
                
                // Displace vertex away
                displacement.xz += dir.xz * influence * bendStrength * stiffness;
                
                // Curve down (simple hack: lower Y as we bend out)
                displacement.y -= influence * stiffness * 0.3;
            }
            
            // Apply displacement to local position before view matrix?
            // Actually simpler to modify worldPosition or local 'position' before matrix
            // But modifying 'position' locally needs inverse matrix logic if we want world-space wind.
            // Let's modify the final worldPosition.
            
            worldPosition.xyz += displacement;
            
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,

    fragmentShader: /* glsl */`
        precision highp float;
        
        uniform vec3 colorTop;
        uniform vec3 colorBottom;
        uniform sampler2D textureMap;
        
        varying vec2 vUv;
        varying float vHeight;
        
        void main() {
            // Gradient color
            vec3 gradient = mix(colorBottom, colorTop, vHeight);
            
            vec4 texColor = vec4(1.0);
            // if texture is present (needs check, usually use define)
            // texColor = texture2D(textureMap, vUv);
            
            vec3 finalColor = gradient * texColor.rgb;
            
            // Fake lighting/AO
            // Darker at bottom
            finalColor *= 0.5 + 0.5 * vHeight;
            
            gl_FragColor = vec4(finalColor, 1.0);
            
            // Alpha cutout standard (if texture used)
            // if (texColor.a < 0.5) discard;
        }
    `
};
