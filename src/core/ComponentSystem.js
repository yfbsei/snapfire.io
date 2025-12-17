import * as THREE from 'three';
import { generateUUID } from 'three/src/math/MathUtils.js';

/**
 * Component - Base class for all components
 */
export class Component {
    constructor(entity) {
        this.uuid = generateUUID();
        this.entity = entity;
        this.enabled = true;
    }

    /**
     * Called when component is added to entity
     */
    onAttach() { }

    /**
     * Called when component is removed or entity is destroyed
     */
    onDetach() { }

    /**
     * Called every frame
     * @param {number} deltaTime 
     */
    update(deltaTime) { }
}

/**
 * Entity - Wrapper around THREE.Object3D with component support
 */
export class Entity {
    constructor(name = 'Entity') {
        this.uuid = generateUUID();
        this.name = name;
        this.object = new THREE.Object3D();
        this.object.name = name;
        this.object.userData.entityUuid = this.uuid;

        this.components = new Map();
        this.parent = null;
        this.children = [];
    }

    /**
     * Add a component to this entity
     * @param {Class} ComponentClass 
     * @param {Object} data - Initial data
     * @returns {Component}
     */
    addComponent(ComponentClass, data = {}) {
        const component = new ComponentClass(this);
        Object.assign(component, data);

        this.components.set(ComponentClass.name, component);
        component.onAttach();

        return component;
    }

    /**
     * Get component by class name
     * @param {class|string} componentName 
     */
    getComponent(componentName) {
        const name = typeof componentName === 'string' ? componentName : componentName.name;
        return this.components.get(name);
    }

    /**
     * Remove component
     * @param {class|string} componentName 
     */
    removeComponent(componentName) {
        const name = typeof componentName === 'string' ? componentName : componentName.name;
        const component = this.components.get(name);
        if (component) {
            component.onDetach();
            this.components.delete(name);
        }
    }

    /**
     * Add child entity
     * @param {Entity} child 
     */
    add(child) {
        if (child.parent) {
            child.parent.remove(child);
        }
        child.parent = this;
        this.children.push(child);
        this.object.add(child.object);
    }

    /**
     * Remove child entity
     * @param {Entity} child 
     */
    remove(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.parent = null;
            this.object.remove(child.object);
        }
    }

    /**
     * Update all components and children
     * @param {number} deltaTime 
     */
    update(deltaTime) {
        for (const component of this.components.values()) {
            if (component.enabled) {
                component.update(deltaTime);
            }
        }

        for (const child of this.children) {
            child.update(deltaTime);
        }
    }
}
