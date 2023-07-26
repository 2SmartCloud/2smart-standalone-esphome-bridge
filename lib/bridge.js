const BaseBridge = require('homie-sdk/lib/Bridge/Base');
const BaseDeviceBridge = require('homie-sdk/lib/Bridge/BaseDevice');
const DeviceBridge = require('./device');
const HomeAssistantMqttConnection = require('./homeAssistant/MqttConnection');
const HomeAssistantAllStates = require('./homeAssistant/AllStates');

class ESPHomeBridge extends BaseBridge {
    constructor({ smartMqttConnection, homeAssistantMqttConnection, ...config }) {
        super({ mqttConnection: smartMqttConnection, ...config, device: null });
        this.handleHomeAssistantDiscovery = this.handleHomeAssistantDiscovery.bind(this);
        this.handleHomeAssistantDelete = this.handleHomeAssistantDelete.bind(this);

        this.homeAssistantMqttConnection = new HomeAssistantMqttConnection({
            ...homeAssistantMqttConnection, debug : config.debug
        });
        this.homeAssistantMqttConnection.on('error', this.handleErrorPropagate);
        this.homeAssistantMqttConnection.on('exit', (...args) => this.emit('exit', ...args));

        this.homeAssistantAllStates = new HomeAssistantAllStates({
            debug : config.debug, mqttConnection : this.homeAssistantMqttConnection
        });
        this.homeAssistantAllStates.on('error', this.handleErrorPropagate);
        this.homeAssistantAllStates.on('exit', (...args) => this.emit('exit', ...args));

        this.homeAssistantMqttConnection.on('discovery', this.handleHomeAssistantDiscovery);
        this.homeAssistantMqttConnection.on('delete', this.handleHomeAssistantDelete);

        if (config.device) {
            let deviceBridge = config.device;

            if (!(deviceBridge instanceof BaseDeviceBridge)) {
                deviceBridge = new DeviceBridge({ ...deviceBridge }, { debug: config.debug });
            }
            this.setDeviceBridge(deviceBridge);
        }
    }
    // sync
    init() {
        super.init();
        this.homeAssistantMqttConnection.init();
    }
    destroy() {
        this.homeAssistantMqttConnection.destroy();
        super.destroy();
    }
    // handlers~
    async handleHomeAssistantDiscovery({ domain, node_id, object_id, config }) {
        if (this.debug) this.debug.info('DeviceBridge.handleHomeAssistantDiscovery', { domain, node_id, object_id, config });
        try {
            this.homeAssistantAllStates.setComponent({ domain, node_id, object_id, config });
        } catch (e) {
            await this.handleErrorPropagate(e);
        }
    }
    async handleHomeAssistantDelete({ domain, node_id, object_id }) {
        if (this.debug) this.debug.info('DeviceBridge.handleHomeAssistantDelete', { domain, node_id, object_id });
        try {
            this.homeAssistantAllStates.removeComponent({ domain, node_id, object_id });
        } catch (e) {
            await this.handleErrorPropagate(e);
        }
    }
    // ~handlers
}

module.exports = ESPHomeBridge;
