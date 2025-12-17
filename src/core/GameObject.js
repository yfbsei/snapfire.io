import * as THREE from 'three';
import { generateUUID } from 'three/src/math/MathUtils.js';

/**
 * Transform - Simplified transform wrapper
 */
export class Transform {
    constructor(object3D) {
        this._object = object3D;
    }

    get position() { return this._object.position; }
    get rotation() { return this._object.rotation; }
    get quaternion() { return this._object.quaternion; }
    get scale() { return this._object.scale; }

    /**
     * Set position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setPosition(x, y, z) {
        this._object.position.set(x, y, z);
        return this;
    }

    /**
     * Set rotation in degrees
     * @param {number} x - Pitch
     * @param {number} y - Yaw
     * @param {number} z - Roll
     */
    setRotation(x, y, z) {
        this._object.rotation.set(
            THREE.MathUtils.degToRad(x),
            THREE.MathUtils.degToRad(y),
            THREE.MathUtils.degToRad(z)
        );
        return this;
    }

    /**
     * Rotate by degrees
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    rotate(x, y, z) {
        this._object.rotation.x += THREE.MathUtils.degToRad(x);
        this._object.rotation.y += THREE.MathUtils.degToRad(y);
        this._object.rotation.z += THREE.MathUtils.degToRad(z);
        return this;
    }

    /**
     * Set scale uniformly or per-axis
     * @param {number} x
     * @param {number} [y]
     * @param {number} [z]
     */
    setScale(x, y, z) {
        if (y === undefined) {
            this._object.scale.set(x, x, x);
        } else {
            this._object.scale.set(x, y, z);
        }
        return this;
    }

    /**
     * Move forward (local Z axis)
     * @param {number} distance
     */
    translateZ(distance) {
        this._object.translateZ(distance);
        return this;
    }

    /**
     * Move right (local X axis)
     * @param {number} distance
     */
    translateX(distance) {
        this._object.translateX(distance);
        return this;
    }

    /**
     * Move up (local Y axis)
     * @param {number} distance
     */
    translateY(distance) {
        this._object.translateY(distance);
        return this;
    }

    /**
     * Look at a position
     * @param {THREE.Vector3|{x:number, y:number, z:number}|number} target - Vector3, object with xyz, or x coordinate
     * @param {number} [y] - Y coordinate (if passing individual coords)
     * @param {number} [z] - Z coordinate (if passing individual coords)
     */
    lookAt(target, y, z) {
        if (typeof target === 'number') {
            // Called with (x, y, z) numbers
            this._object.lookAt(target, y, z);
        } else if (target instanceof THREE.Vector3) {
            this._object.lookAt(target);
        } else if (target && typeof target.x === 'number') {
            this._object.lookAt(target.x, target.y, target.z);
        }
        return this;
    }

    /**
     * Get world position
     * @returns {THREE.Vector3}
     */
    getWorldPosition() {
        const pos = new THREE.Vector3();
        this._object.getWorldPosition(pos);
        return pos;
    }

    /**
     * Get forward direction (local -Z in world space)
     * @returns {THREE.Vector3}
     */
    getForward() {
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this._object.quaternion);
        return forward;
    }

    /**
     * Get right direction (local +X in world space)
     * @returns {THREE.Vector3}
     */
    getRight() {
        const right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(this._object.quaternion);
        return right;
    }

    /**
     * Get up direction (local +Y in world space)
     * @returns {THREE.Vector3}
     */
    getUp() {
        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(this._object.quaternion);
        return up;
    }
}

/**
 * GameObject - Main entity class for game objects
 * Wraps THREE.Object3D with component system and scripts
 */
export class GameObject {
    constructor(name = 'GameObject') {
        this.uuid = generateUUID();
        this.name = name;
        this.tag = '';
        this.layer = 0;

        // Three.js object
        this._object3D = new THREE.Object3D();
        this._object3D.name = name;
        this._object3D.userData.gameObject = this;

        // Transform wrapper
        this.transform = new Transform(this._object3D);

        // Components
        this._components = new Map();

        // Scripts
        this.scripts = [];

        // Parent/children (mirrors Three.js hierarchy)
        this._parent = null;
        this._children = [];

        // Active state
        this._active = true;
    }

    /**
     * Get the underlying Three.js object
     */
    get object3D() {
        return this._object3D;
    }

    /**
     * Check if active
     */
    get active() {
        return this._active;
    }

    /**
     * Set active state
     */
    set active(value) {
        this._active = value;
        this._object3D.visible = value;
    }

    /**
     * Get parent GameObject
     */
    get parent() {
        return this._parent;
    }

    /**
     * Get children GameObjects
     */
    get children() {
        return [...this._children];
    }

    // ==================== Components ====================

    /**
     * Add a component to this GameObject
     * @param {Function} ComponentClass - Component constructor
     * @param {Object} options - Component options
     * @returns {Object} The component instance
     */
    addComponent(ComponentClass, options = {}) {
        const component = new ComponentClass(this, options);
        this._components.set(ComponentClass.name, component);

        if (component.onAttach) {
            component.onAttach();
        }

        return component;
    }

    /**
     * Get a component by class
     * @param {Function} ComponentClass
     * @returns {Object|undefined}
     */
    getComponent(ComponentClass) {
        return this._components.get(ComponentClass.name);
    }

    /**
     * Remove a component
     * @param {Function} ComponentClass
     */
    removeComponent(ComponentClass) {
        const component = this._components.get(ComponentClass.name);
        if (component) {
            if (component.onDetach) {
                component.onDetach();
            }
            this._components.delete(ComponentClass.name);
        }
    }

    /**
     * Check if has component
     * @param {Function} ComponentClass
     */
    hasComponent(ComponentClass) {
        return this._components.has(ComponentClass.name);
    }

    // ==================== Scripts ====================

    /**
     * Add a script to this GameObject
     * @param {Function} ScriptClass - Script constructor
     * @param {Object} engine - Engine instance
     * @returns {Script}
     */
    addScript(ScriptClass, engine) {
        const script = new ScriptClass();
        this.scripts.push(script);

        if (engine && engine.scripts) {
            engine.scripts.register(script, this);
        }

        return script;
    }

    /**
     * Get a script by class
     * @param {Function} ScriptClass
     */
    getScript(ScriptClass) {
        return this.scripts.find(s => s instanceof ScriptClass);
    }

    /**
     * Remove a script
     * @param {Function} ScriptClass
     * @param {Object} engine
     */
    removeScript(ScriptClass, engine) {
        const index = this.scripts.findIndex(s => s instanceof ScriptClass);
        if (index !== -1) {
            const script = this.scripts[index];
            this.scripts.splice(index, 1);

            if (engine && engine.scripts) {
                engine.scripts.unregister(script);
            }
        }
    }

    // ==================== Hierarchy ====================

    /**
     * Add a child GameObject
     * @param {GameObject} child
     */
    addChild(child) {
        if (child._parent) {
            child._parent.removeChild(child);
        }

        child._parent = this;
        this._children.push(child);
        this._object3D.add(child._object3D);
    }

    /**
     * Remove a child GameObject
     * @param {GameObject} child
     */
    removeChild(child) {
        const index = this._children.indexOf(child);
        if (index !== -1) {
            this._children.splice(index, 1);
            child._parent = null;
            this._object3D.remove(child._object3D);
        }
    }

    /**
     * Find a child by name (recursive)
     * @param {string} name
     */
    findChild(name) {
        for (const child of this._children) {
            if (child.name === name) return child;
            const found = child.findChild(name);
            if (found) return found;
        }
        return null;
    }

    // ==================== Utility ====================

    /**
     * Clone this GameObject
     * @returns {GameObject}
     */
    clone() {
        const cloned = new GameObject(this.name + '_clone');
        cloned._object3D.copy(this._object3D, false);
        cloned.tag = this.tag;
        cloned.layer = this.layer;

        // Clone children
        for (const child of this._children) {
            cloned.addChild(child.clone());
        }

        return cloned;
    }

    /**
     * Destroy this GameObject and its children
     * @param {Object} engine
     */
    destroy(engine) {
        // Remove scripts
        for (const script of this.scripts) {
            if (engine && engine.scripts) {
                engine.scripts.unregister(script);
            }
        }
        this.scripts = [];

        // Destroy children
        for (const child of [...this._children]) {
            child.destroy(engine);
        }

        // Remove from parent
        if (this._parent) {
            this._parent.removeChild(this);
        }

        // Dispose components
        for (const [, component] of this._components) {
            if (component.dispose) {
                component.dispose();
            }
        }
        this._components.clear();

        // Dispose Three.js resources
        this._object3D.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    /**
     * Create a GameObject with a mesh
     * @param {string} name
     * @param {THREE.BufferGeometry} geometry
     * @param {THREE.Material} material
     * @returns {GameObject}
     */
    static createMesh(name, geometry, material) {
        const go = new GameObject(name);
        const mesh = new THREE.Mesh(geometry, material);
        go._object3D.add(mesh);
        return go;
    }

    /**
     * Create a primitive GameObject
     * @param {string} type - 'box', 'sphere', 'cylinder', 'plane', 'capsule'
     * @param {Object} options
     * @returns {GameObject}
     */
    static createPrimitive(type, options = {}) {
        let geometry;
        const material = new THREE.MeshStandardMaterial({
            color: options.color || 0x4a90d9,
            roughness: options.roughness ?? 0.5,
            metalness: options.metalness ?? 0.1
        });

        switch (type) {
            case 'box':
                geometry = new THREE.BoxGeometry(
                    options.width || 1,
                    options.height || 1,
                    options.depth || 1
                );
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(
                    options.radius || 0.5,
                    options.segments || 32,
                    options.segments || 32
                );
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(
                    options.radiusTop || 0.5,
                    options.radiusBottom || 0.5,
                    options.height || 1,
                    options.segments || 32
                );
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(
                    options.width || 10,
                    options.height || 10
                );
                break;
            case 'capsule':
                geometry = new THREE.CapsuleGeometry(
                    options.radius || 0.5,
                    options.length || 1,
                    options.capSegments || 8,
                    options.radialSegments || 16
                );
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        const go = new GameObject(options.name || type.charAt(0).toUpperCase() + type.slice(1));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = options.castShadow ?? true;
        mesh.receiveShadow = options.receiveShadow ?? true;
        go._object3D.add(mesh);

        return go;
    }
}
