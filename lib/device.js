/* eslint-disable more/no-duplicated-chains */
const BaseDeviceBridge = require('homie-sdk/lib/Bridge/BaseDevice');
const { createHash } = require('./utils');
const NodeBridge = require('./node');

const { create: createNode } = NodeBridge;

class DeviceBridge extends BaseDeviceBridge {
    constructor(config, { debug } = {}) {
        super(config, { debug });
        this.handleCreateComponent = this.handleCreateComponent.bind(this);
        this.handleRemoveComponent = this.handleRemoveComponent.bind(this);
        this.connected = true;
    }

    // sync
    attachBridge(bridge) {
        super.attachBridge(bridge);
        this.bridge.homeAssistantAllStates.on('before.createComponent', this.handleCreateComponent);
        this.bridge.homeAssistantAllStates.on('before.removeComponent', this.handleRemoveComponent);
    }

    detachBridge() {
        this.bridge.homeAssistantAllStates.off('before.createComponent', this.handleCreateComponent);
        this.bridge.homeAssistantAllStates.off('before.removeComponent', this.handleRemoveComponent);
        super.detachBridge();
    }

    getNodeIdByComponent(component) {
        if (component.config.device.identifiers) {
            let identifiers = component.config.device.identifiers;

            if (Array.isArray(identifiers)) identifiers = identifiers.join('--');

            return createHash(identifiers);
        // eslint-disable-next-line no-else-return
        } else {
            return createHash(component.state.entity_id);
        }
    }
    findOrAddNewHomeAssistantDevice(component) {
        if (this.debug) this.debug.info('DeviceBridge.findOrAddNewHomeAssistantDevice');
        const id = this.getNodeIdByComponent(component);

        let node = this.nodes.find((n) => n.id === id);

        if (node && (node instanceof NodeBridge)) {
            if (node.deleted) {
                this.removeNode(node.id);
                node = null;
            } else {
                return node;
            }
        }

        let homieNode;

        if (node) {
            if (this.debug) this.debug.info('DeviceBridge.findOrAddNewHomeAssistantDevice 1');

            homieNode = node.homieEntity;
            this.removeNode(node.id);

            if (this.debug) this.debug.info('DeviceBridge.findOrAddNewHomeAssistantDevice 2');
        } else {
            homieNode = this.homieEntity.nodes.find((n) => n.id === id);
        }

        if (this.debug) this.debug.info('DeviceBridge.findOrAddNewHomeAssistantDevice 3');

        node = createNode(homieNode || { id }, { debug: this.debug });

        this.addNode(node);

        return node;
    }

    // async

    // handlers
    async handleCreateComponent(component) {
        if (this.debug) this.debug.info('DeviceBridge.handleCreateComponent');
        if (component.config.device && (component.config.unique_id || component.state.entity_id)) {
            try {
                const node = this.findOrAddNewHomeAssistantDevice(component);
                const name = (component.config.device.name && component.config.device.model) ? `${component.config.device.name}/${component.config.device.model}` :
                    component.config.device.name || component.config.device.model || 'Node';

                node.publishAttribute('name', name);
                node.setComponent(component);
            } catch (e) {
                if (this.debug) this.debug.error(e);
            }
        }
    }
    async handleRemoveComponent(component) {
        if (component.config.device && (component.config.unique_id || component.state.entity_id)) {
            const id = this.getNodeIdByComponent(component);
            const node = this.nodes.find((n) => n.id === id);

            node.unsetComponent(component);
        }
    }
}

module.exports = DeviceBridge;
