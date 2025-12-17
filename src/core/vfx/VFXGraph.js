/**
 * VFXGraph - Node-based VFX data structure
 * Combines particles, trails, and mesh particles into unified effects
 */
import * as THREE from 'three';
import { GPUParticleSystem, ParticleEmitter } from '../compute/GPUParticleSystem.js';
import { TrailRenderer } from './TrailRenderer.js';
import { MeshParticleSystem } from './MeshParticleSystem.js';

/**
 * VFXNode - Base class for VFX graph nodes
 */
export class VFXNode {
    constructor(type, options = {}) {
        this.id = options.id ?? crypto.randomUUID();
        this.type = type;
        this.name = options.name ?? type;
        this.enabled = options.enabled ?? true;
        this.inputs = new Map();
        this.outputs = new Map();
        this.properties = options.properties ?? {};
    }

    /**
     * Connect output to another node's input
     */
    connect(outputName, targetNode, inputName) {
        this.outputs.set(outputName, { node: targetNode, input: inputName });
        targetNode.inputs.set(inputName, { node: this, output: outputName });
    }

    /**
     * Update node
     */
    update(deltaTime, context) {
        // Override in subclasses
    }

    /**
     * Serialize node to JSON
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            name: this.name,
            enabled: this.enabled,
            properties: this.properties
        };
    }

    /**
     * Deserialize node from JSON
     */
    static fromJSON(data) {
        return new VFXNode(data.type, data);
    }
}

/**
 * SpawnNode - Controls particle emission
 */
export class SpawnNode extends VFXNode {
    constructor(options = {}) {
        super('spawn', options);
        this.properties = {
            rate: options.rate ?? 10,
            burst: options.burst ?? false,
            burstCount: options.burstCount ?? 10,
            burstInterval: options.burstInterval ?? 1.0,
            ...options.properties
        };
        this._accumulator = 0;
        this._burstTimer = 0;
    }

    update(deltaTime, context) {
        if (!this.enabled) return;

        let spawnCount = 0;

        if (this.properties.burst) {
            this._burstTimer += deltaTime;
            if (this._burstTimer >= this.properties.burstInterval) {
                spawnCount = this.properties.burstCount;
                this._burstTimer = 0;
            }
        } else {
            this._accumulator += this.properties.rate * deltaTime;
            spawnCount = Math.floor(this._accumulator);
            this._accumulator -= spawnCount;
        }

        if (spawnCount > 0) {
            context.emit('spawn', { count: spawnCount });
        }
    }
}

/**
 * InitializeNode - Sets initial particle properties
 */
export class InitializeNode extends VFXNode {
    constructor(options = {}) {
        super('initialize', options);
        this.properties = {
            position: options.position ?? new THREE.Vector3(),
            positionSpread: options.positionSpread ?? new THREE.Vector3(),
            velocity: options.velocity ?? new THREE.Vector3(0, 5, 0),
            velocitySpread: options.velocitySpread ?? new THREE.Vector3(1, 1, 1),
            lifetime: options.lifetime ?? 2.0,
            lifetimeSpread: options.lifetimeSpread ?? 0.5,
            size: options.size ?? 1.0,
            sizeSpread: options.sizeSpread ?? 0.2,
            color: options.color ?? new THREE.Color(1, 1, 1),
            ...options.properties
        };
    }
}

/**
 * PhysicsNode - Applies forces to particles
 */
export class PhysicsNode extends VFXNode {
    constructor(options = {}) {
        super('physics', options);
        this.properties = {
            gravity: options.gravity ?? new THREE.Vector3(0, -9.8, 0),
            drag: options.drag ?? 0.0,
            turbulence: options.turbulence ?? 0.0,
            turbulenceFrequency: options.turbulenceFrequency ?? 1.0,
            ...options.properties
        };
    }
}

/**
 * ColorNode - Animates particle color over lifetime
 */
export class ColorNode extends VFXNode {
    constructor(options = {}) {
        super('color', options);
        this.properties = {
            gradient: options.gradient ?? [
                { t: 0, color: new THREE.Color(1, 1, 1) },
                { t: 1, color: new THREE.Color(1, 1, 1) }
            ],
            ...options.properties
        };
    }
}

/**
 * SizeNode - Animates particle size over lifetime
 */
export class SizeNode extends VFXNode {
    constructor(options = {}) {
        super('size', options);
        this.properties = {
            curve: options.curve ?? [[0, 1], [1, 0]],
            ...options.properties
        };
    }
}

/**
 * RenderNode - Defines how particles are rendered
 */
export class RenderNode extends VFXNode {
    constructor(options = {}) {
        super('render', options);
        this.properties = {
            renderType: options.renderType ?? 'point', // 'point', 'billboard', 'mesh', 'trail'
            mesh: options.mesh ?? null,
            material: options.material ?? null,
            blending: options.blending ?? 'additive',
            ...options.properties
        };
    }
}

/**
 * VFXGraph - Main VFX effect container
 */
export class VFXGraph {
    constructor(options = {}) {
        this.id = options.id ?? crypto.randomUUID();
        this.name = options.name ?? 'VFXEffect';
        this.nodes = new Map();
        this.rootNodes = [];

        // Systems
        this.particleSystem = null;
        this.trailRenderer = null;
        this.meshParticleSystem = null;

        // Container
        this.container = new THREE.Group();
        this.container.name = this.name;

        // State
        this.isPlaying = false;
        this.duration = options.duration ?? -1; // -1 = infinite
        this.time = 0;
        this.loop = options.loop ?? true;

        // Event emitter
        this._eventListeners = new Map();
    }

    /**
     * Add a node to the graph
     * @param {VFXNode} node
     * @returns {VFXNode}
     */
    addNode(node) {
        this.nodes.set(node.id, node);

        // Auto-detect root nodes (nodes with no inputs)
        if (node.inputs.size === 0) {
            this.rootNodes.push(node);
        }

        return node;
    }

    /**
     * Remove a node from the graph
     * @param {string} nodeId
     */
    removeNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        // Remove connections
        node.inputs.forEach((conn, inputName) => {
            conn.node.outputs.delete(conn.output);
        });
        node.outputs.forEach((conn, outputName) => {
            conn.node.inputs.delete(conn.input);
        });

        // Remove from root nodes
        const rootIndex = this.rootNodes.indexOf(node);
        if (rootIndex > -1) {
            this.rootNodes.splice(rootIndex, 1);
        }

        this.nodes.delete(nodeId);
    }

    /**
     * Build the effect from nodes
     */
    build() {
        // Find render node to determine rendering type
        let renderNode = null;
        let spawnNode = null;
        let initNode = null;
        let physicsNode = null;
        let colorNode = null;
        let sizeNode = null;

        this.nodes.forEach(node => {
            switch (node.type) {
                case 'spawn': spawnNode = node; break;
                case 'initialize': initNode = node; break;
                case 'physics': physicsNode = node; break;
                case 'color': colorNode = node; break;
                case 'size': sizeNode = node; break;
                case 'render': renderNode = node; break;
            }
        });

        if (!renderNode) {
            console.warn('VFXGraph: No render node found');
            return;
        }

        // Build appropriate system based on render type
        const renderType = renderNode.properties.renderType;

        if (renderType === 'trail') {
            this._buildTrailSystem(initNode, renderNode);
        } else if (renderType === 'mesh') {
            this._buildMeshSystem(initNode, physicsNode, colorNode, sizeNode, renderNode);
        } else {
            this._buildParticleSystem(initNode, physicsNode, colorNode, sizeNode, renderNode);
        }
    }

    _buildParticleSystem(initNode, physicsNode, colorNode, sizeNode, renderNode) {
        const emitterOptions = initNode?.properties ?? {};

        this.particleSystem = new GPUParticleSystem({
            maxParticles: 10000
        });

        const emitter = new ParticleEmitter({
            position: emitterOptions.position,
            rate: 100,
            lifetime: emitterOptions.lifetime ?? 2.0,
            speed: emitterOptions.velocity?.length() ?? 5,
            spread: emitterOptions.velocitySpread?.length() ?? 1,
            size: emitterOptions.size ?? 1.0,
            colors: colorNode ? colorNode.properties.gradient.map(g => g.color) : undefined,
            gravity: physicsNode?.properties.gravity
        });

        this.particleSystem.addEmitter(emitter);
    }

    _buildTrailSystem(initNode, renderNode) {
        this.trailRenderer = new TrailRenderer({
            width: initNode?.properties.size ?? 0.5,
            colorStart: initNode?.properties.color ?? new THREE.Color(1, 1, 1),
            colorEnd: new THREE.Color(1, 1, 1),
            lifetime: initNode?.properties.lifetime ?? 1.0
        });

        this.container.add(this.trailRenderer.getMesh());
    }

    _buildMeshSystem(initNode, physicsNode, colorNode, sizeNode, renderNode) {
        this.meshParticleSystem = new MeshParticleSystem({
            maxParticles: 1000,
            gravity: physicsNode?.properties.gravity,
            drag: physicsNode?.properties.drag ?? 0
        });

        if (colorNode) {
            this.meshParticleSystem.colorOverLifetime = colorNode.properties.gradient;
        }
        if (sizeNode) {
            this.meshParticleSystem.scaleOverLifetime = sizeNode.properties.curve;
        }

        // Need mesh to initialize - will be done later
    }

    /**
     * Initialize with renderer (for GPU systems)
     * @param {THREE.WebGPURenderer|THREE.WebGLRenderer} renderer
     */
    async init(renderer) {
        if (this.particleSystem) {
            await this.particleSystem.init(renderer);
            const mesh = this.particleSystem.mesh();
            if (mesh) {
                this.container.add(mesh);
            }
        }
    }

    /**
     * Play the effect
     */
    play() {
        this.isPlaying = true;
        this.time = 0;
    }

    /**
     * Stop the effect
     */
    stop() {
        this.isPlaying = false;
    }

    /**
     * Pause the effect
     */
    pause() {
        this.isPlaying = false;
    }

    /**
     * Resume the effect
     */
    resume() {
        this.isPlaying = true;
    }

    /**
     * Update the effect
     * @param {number} deltaTime
     */
    update(deltaTime) {
        if (!this.isPlaying) return;

        this.time += deltaTime;

        // Check duration
        if (this.duration > 0 && this.time >= this.duration) {
            if (this.loop) {
                this.time = 0;
            } else {
                this.stop();
                return;
            }
        }

        // Create context for node updates
        const context = {
            deltaTime,
            time: this.time,
            emit: (event, data) => this._handleEvent(event, data)
        };

        // Update nodes
        this.nodes.forEach(node => {
            node.update(deltaTime, context);
        });

        // Update systems
        if (this.particleSystem) {
            this.particleSystem.update(deltaTime);
        }
        if (this.trailRenderer) {
            this.trailRenderer.update(deltaTime);
        }
        if (this.meshParticleSystem) {
            this.meshParticleSystem.update(deltaTime);
        }
    }

    _handleEvent(event, data) {
        if (event === 'spawn' && this.meshParticleSystem) {
            // Find initialize node for emission options
            let initNode = null;
            this.nodes.forEach(node => {
                if (node.type === 'initialize') initNode = node;
            });

            this.meshParticleSystem.emit(data.count, initNode?.properties ?? {});
        }
    }

    /**
     * Get the container for adding to scene
     * @returns {THREE.Group}
     */
    getContainer() {
        return this.container;
    }

    /**
     * Serialize to JSON
     * @returns {Object}
     */
    toJSON() {
        const nodes = [];
        const connections = [];

        this.nodes.forEach(node => {
            nodes.push(node.toJSON());

            node.outputs.forEach((conn, outputName) => {
                connections.push({
                    from: node.id,
                    fromOutput: outputName,
                    to: conn.node.id,
                    toInput: conn.input
                });
            });
        });

        return {
            id: this.id,
            name: this.name,
            duration: this.duration,
            loop: this.loop,
            nodes,
            connections
        };
    }

    /**
     * Deserialize from JSON
     * @param {Object} data
     * @returns {VFXGraph}
     */
    static fromJSON(data) {
        const graph = new VFXGraph({
            id: data.id,
            name: data.name,
            duration: data.duration,
            loop: data.loop
        });

        // Create nodes
        const nodeMap = new Map();
        for (const nodeData of data.nodes) {
            let node;
            switch (nodeData.type) {
                case 'spawn': node = new SpawnNode(nodeData); break;
                case 'initialize': node = new InitializeNode(nodeData); break;
                case 'physics': node = new PhysicsNode(nodeData); break;
                case 'color': node = new ColorNode(nodeData); break;
                case 'size': node = new SizeNode(nodeData); break;
                case 'render': node = new RenderNode(nodeData); break;
                default: node = new VFXNode(nodeData.type, nodeData);
            }
            graph.addNode(node);
            nodeMap.set(node.id, node);
        }

        // Create connections
        for (const conn of data.connections) {
            const fromNode = nodeMap.get(conn.from);
            const toNode = nodeMap.get(conn.to);
            if (fromNode && toNode) {
                fromNode.connect(conn.fromOutput, toNode, conn.toInput);
            }
        }

        return graph;
    }

    /**
     * Dispose all resources
     */
    dispose() {
        if (this.particleSystem) {
            this.particleSystem.dispose();
        }
        if (this.trailRenderer) {
            this.trailRenderer.dispose();
        }
        if (this.meshParticleSystem) {
            this.meshParticleSystem.dispose();
        }
        this.nodes.clear();
        this.rootNodes = [];
    }
}

export default VFXGraph;
