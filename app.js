const path  = require('path');
const fs  = require('fs-extra');
const Debugger = require('homie-sdk/lib/utils/debugger');
const AedesServer = require('./lib/AedesServer');
const ESPHomeBridge = require('./lib/bridge');
const { config2smart }  = require('./lib/utils');

// eslint-disable-next-line no-sync
fs.ensureDirSync(path.resolve('./etc/esphome'));

config2smart.init(path.resolve('./etc/esphome/config.json'));

const debug = new Debugger(process.env.DEBUG || '');

debug.initEvents();
try {
    const deviceBridgeConfig = {
        smartMqttConnection : {
            username : process.env.MQTT_USER || undefined,
            password : process.env.MQTT_PASS || undefined,
            uri      : process.env.MQTT_URI || undefined
        },
        homeAssistantMqttConnection : {
            username        : process.env.HOME_ASSISTANT_MQTT_USERNAME || undefined,
            password        : process.env.HOME_ASSISTANT_MQTT_PASSWORD || undefined,
            uri             : `mqtt://localhost:${process.env.HOME_ASSISTANT_MQTT_LOCAL_PORT_BINDING}`,
            discoveryPrefix : process.env.HOME_ASSISTANT_DISCOVERY_PREFIX
        },
        device : {
            id              : process.env.DEVICE_ID || process.env.MQTT_USER || undefined,
            name            : process.env.DEVICE_NAME || undefined,
            implementation  : process.env.DEVICE_IMPLEMENTATION || undefined,
            mac             : process.env.DEVICE_MAC || undefined,
            firmwareVersion : process.env.DEVICE_FIRMWARE_VERSION || undefined,
            firmwareName    : process.env.DEVICE_FIRMWARE_NAME || undefined
        }
    };

    console.log(deviceBridgeConfig);

    const aesedServer = new AedesServer({
        username : process.env.HOME_ASSISTANT_MQTT_USERNAME || undefined,
        password : process.env.HOME_ASSISTANT_MQTT_PASSWORD || undefined,
        port     : process.env.HOME_ASSISTANT_MQTT_LOCAL_PORT_BINDING,
        debug
    });

    console.log({
        username : process.env.HOME_ASSISTANT_MQTT_USERNAME || undefined,
        password : process.env.HOME_ASSISTANT_MQTT_PASSWORD || undefined,
        port     : process.env.HOME_ASSISTANT_MQTT_LOCAL_PORT_BINDING,
        debug
    });

    aesedServer.on('error', (error) => {
        debug.error(error);
    });
    aesedServer.on('exit', (reason, exit_code) => {
        debug.error(reason);
        process.exit(exit_code);
    });
    aesedServer.init();

    const esphomeBridge = new ESPHomeBridge({ ...deviceBridgeConfig, debug });

    esphomeBridge.on('error', (error) => {
        debug.error(error);
    });
    esphomeBridge.on('exit', (reason, exit_code) => {
        debug.error(reason);
        process.exit(exit_code);
    });
    esphomeBridge.init();
} catch (e) {
    debug.error(e);
    process.exit(1);
}
