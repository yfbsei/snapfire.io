import * as THREE from 'three';

/**
 * WeatherSystem - Dynamic weather and time of day
 * Handles day/night cycle, fog, rain, clouds, and atmospheric effects
 */
export class WeatherSystem {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.scene = engine.scene;

        // Time of day (0-24 hours)
        this.timeOfDay = options.startTime ?? 12;
        this.timeSpeed = options.timeSpeed ?? 1; // 1 = real time, 60 = 1 min = 1 hour
        this.pauseTime = false;

        // Sun/Moon
        this.sun = engine.sun || null;
        this.sunLight = null;
        this.moonLight = null;
        this.ambientLight = null;

        // Sky colors for different times
        this.skyColors = {
            dawn: new THREE.Color(0xffb347),
            day: new THREE.Color(0x87CEEB),
            dusk: new THREE.Color(0xff6b6b),
            night: new THREE.Color(0x0a0a2e)
        };

        this.sunColors = {
            dawn: new THREE.Color(0xffcc66),
            day: new THREE.Color(0xffffff),
            dusk: new THREE.Color(0xff8844),
            night: new THREE.Color(0x333366)
        };

        // Fog
        this.fogEnabled = options.fog ?? true;
        this.fogNear = options.fogNear ?? 50;
        this.fogFar = options.fogFar ?? 300;
        this.fogDensity = options.fogDensity ?? 0.01;
        this.fogType = options.fogType ?? 'linear'; // 'linear' or 'exp2'

        // Rain
        this.rainEnabled = false;
        this.rainIntensity = 0;
        this.rainParticles = null;
        this.maxRaindrops = options.maxRaindrops ?? 10000;

        // Clouds
        this.cloudsEnabled = options.clouds ?? false;
        this.cloudMesh = null;

        // Current weather state
        this.currentWeather = 'clear'; // clear, cloudy, rain, storm
        this.weatherTransitionTime = 0;
        this.targetWeather = 'clear';

        // Initialize
        this._init();
    }

    _init() {
        // Setup fog
        if (this.fogEnabled) {
            this._setupFog();
        }

        // Find or create sun light
        if (!this.sun) {
            this.scene.traverse((obj) => {
                if (obj.isDirectionalLight && !this.sunLight) {
                    this.sunLight = obj;
                }
                if (obj.isAmbientLight && !this.ambientLight) {
                    this.ambientLight = obj;
                }
            });
        } else {
            this.sunLight = this.sun;
        }

        // Create ambient if not found
        if (!this.ambientLight) {
            this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
            this.scene.add(this.ambientLight);
        }

        // Create moon light
        this.moonLight = new THREE.DirectionalLight(0x4466aa, 0);
        this.moonLight.position.set(-50, 100, -50);
        this.scene.add(this.moonLight);
    }

    /**
     * Setup fog
     */
    _setupFog() {
        if (this.fogType === 'exp2') {
            this.scene.fog = new THREE.FogExp2(0x87CEEB, this.fogDensity);
        } else {
            this.scene.fog = new THREE.Fog(0x87CEEB, this.fogNear, this.fogFar);
        }
    }

    /**
     * Set time of day
     * @param {number} hours - 0-24
     */
    setTime(hours) {
        this.timeOfDay = hours % 24;
        this._updateLighting();
    }

    /**
     * Set time speed multiplier
     * @param {number} speed
     */
    setTimeSpeed(speed) {
        this.timeSpeed = speed;
    }

    /**
     * Pause/resume time progression
     */
    toggleTimePause() {
        this.pauseTime = !this.pauseTime;
    }

    /**
     * Set weather
     * @param {string} weather - 'clear', 'cloudy', 'rain', 'storm'
     * @param {number} transitionTime - Seconds to transition
     */
    setWeather(weather, transitionTime = 5) {
        if (weather === this.currentWeather) return;

        this.targetWeather = weather;
        this.weatherTransitionTime = transitionTime;
    }

    /**
     * Enable/disable rain
     * @param {boolean} enabled
     * @param {number} intensity - 0 to 1
     */
    setRain(enabled, intensity = 0.5) {
        if (enabled && !this.rainParticles) {
            this._createRain();
        }

        this.rainEnabled = enabled;
        this.rainIntensity = intensity;

        if (this.rainParticles) {
            this.rainParticles.visible = enabled;
        }
    }

    /**
     * Create rain particle system
     */
    _createRain() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxRaindrops * 3);
        const velocities = new Float32Array(this.maxRaindrops);

        for (let i = 0; i < this.maxRaindrops; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 200;
            positions[i * 3 + 1] = Math.random() * 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
            velocities[i] = 15 + Math.random() * 10;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const material = new THREE.PointsMaterial({
            color: 0xaaaacc,
            size: 0.1,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.rainParticles = new THREE.Points(geometry, material);
        this.rainParticles.frustumCulled = false;
        this.rainParticles.name = 'Rain';
        this.scene.add(this.rainParticles);
    }

    /**
     * Update rain animation
     */
    _updateRain(deltaTime) {
        if (!this.rainParticles || !this.rainEnabled) return;

        const positions = this.rainParticles.geometry.attributes.position.array;
        const velocities = this.rainParticles.geometry.attributes.velocity.array;

        // Center rain around camera
        const cameraPos = this.engine.camera?.position || new THREE.Vector3();

        for (let i = 0; i < this.maxRaindrops; i++) {
            positions[i * 3 + 1] -= velocities[i] * deltaTime * this.rainIntensity * 2;

            // Reset raindrop if below ground
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3] = cameraPos.x + (Math.random() - 0.5) * 200;
                positions[i * 3 + 1] = 50 + Math.random() * 50;
                positions[i * 3 + 2] = cameraPos.z + (Math.random() - 0.5) * 200;
            }
        }

        this.rainParticles.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * Set fog parameters
     */
    setFog(enabled, options = {}) {
        this.fogEnabled = enabled;

        if (!enabled) {
            this.scene.fog = null;
            return;
        }

        if (options.near !== undefined) this.fogNear = options.near;
        if (options.far !== undefined) this.fogFar = options.far;
        if (options.density !== undefined) this.fogDensity = options.density;
        if (options.type !== undefined) this.fogType = options.type;

        this._setupFog();
    }

    /**
     * Update lighting based on time of day
     */
    _updateLighting() {
        const t = this.timeOfDay;

        // Calculate sun/moon position
        const sunAngle = ((t - 6) / 12) * Math.PI; // 6am = 0, 6pm = PI
        const isDaytime = t >= 6 && t < 18;

        // Sun position
        if (this.sunLight) {
            const sunHeight = Math.sin(sunAngle) * 100;
            const sunDist = Math.cos(sunAngle) * 100;

            this.sunLight.position.set(sunDist, Math.max(sunHeight, -20), 50);
            this.sunLight.intensity = isDaytime ? Math.max(0, Math.sin(sunAngle)) : 0;
        }

        // Moon
        if (this.moonLight) {
            this.moonLight.intensity = isDaytime ? 0 : 0.3;
        }

        // Sky color interpolation
        let skyColor, sunColor, ambientIntensity;

        if (t >= 5 && t < 7) {
            // Dawn
            const blend = (t - 5) / 2;
            skyColor = this.skyColors.night.clone().lerp(this.skyColors.dawn, blend);
            sunColor = this.sunColors.night.clone().lerp(this.sunColors.dawn, blend);
            ambientIntensity = 0.2 + blend * 0.2;
        } else if (t >= 7 && t < 17) {
            // Day
            const blend = Math.min((t - 7) / 3, 1);
            skyColor = this.skyColors.dawn.clone().lerp(this.skyColors.day, blend);
            sunColor = this.sunColors.dawn.clone().lerp(this.sunColors.day, blend);
            ambientIntensity = 0.4;
        } else if (t >= 17 && t < 19) {
            // Dusk
            const blend = (t - 17) / 2;
            skyColor = this.skyColors.day.clone().lerp(this.skyColors.dusk, blend);
            sunColor = this.sunColors.day.clone().lerp(this.sunColors.dusk, blend);
            ambientIntensity = 0.4 - blend * 0.2;
        } else if (t >= 19 && t < 21) {
            // Evening
            const blend = (t - 19) / 2;
            skyColor = this.skyColors.dusk.clone().lerp(this.skyColors.night, blend);
            sunColor = this.sunColors.dusk.clone().lerp(this.sunColors.night, blend);
            ambientIntensity = 0.2 - blend * 0.1;
        } else {
            // Night
            skyColor = this.skyColors.night.clone();
            sunColor = this.sunColors.night.clone();
            ambientIntensity = 0.1;
        }

        // Apply colors
        if (this.scene.background instanceof THREE.Color) {
            this.scene.background.copy(skyColor);
        }

        if (this.scene.fog) {
            this.scene.fog.color.copy(skyColor);
        }

        if (this.sunLight) {
            this.sunLight.color.copy(sunColor);
        }

        if (this.ambientLight) {
            this.ambientLight.intensity = ambientIntensity;
        }
    }

    /**
     * Update weather system
     * @param {number} deltaTime
     */
    update(deltaTime) {
        // Update time
        if (!this.pauseTime) {
            this.timeOfDay += (deltaTime / 3600) * this.timeSpeed;
            if (this.timeOfDay >= 24) this.timeOfDay -= 24;
            this._updateLighting();
        }

        // Update weather transition
        if (this.weatherTransitionTime > 0) {
            this.weatherTransitionTime -= deltaTime;
            if (this.weatherTransitionTime <= 0) {
                this.currentWeather = this.targetWeather;
                this._applyWeather();
            }
        }

        // Update rain
        if (this.rainEnabled) {
            this._updateRain(deltaTime);
        }
    }

    /**
     * Apply weather settings
     */
    _applyWeather() {
        switch (this.currentWeather) {
            case 'clear':
                this.setRain(false);
                this.setFog(true, { far: 500 });
                break;
            case 'cloudy':
                this.setRain(false);
                this.setFog(true, { far: 300 });
                break;
            case 'rain':
                this.setRain(true, 0.5);
                this.setFog(true, { far: 200 });
                break;
            case 'storm':
                this.setRain(true, 1.0);
                this.setFog(true, { far: 100 });
                break;
        }
    }

    /**
     * Get current time as formatted string
     */
    getTimeString() {
        const hours = Math.floor(this.timeOfDay);
        const minutes = Math.floor((this.timeOfDay % 1) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Check if it's daytime
     */
    isDaytime() {
        return this.timeOfDay >= 6 && this.timeOfDay < 18;
    }

    /**
     * Dispose weather system
     */
    dispose() {
        if (this.rainParticles) {
            this.scene.remove(this.rainParticles);
            this.rainParticles.geometry.dispose();
            this.rainParticles.material.dispose();
        }

        if (this.cloudMesh) {
            this.scene.remove(this.cloudMesh);
        }

        if (this.moonLight) {
            this.scene.remove(this.moonLight);
        }
    }
}
