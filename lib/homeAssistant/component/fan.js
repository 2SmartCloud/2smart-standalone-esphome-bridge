/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/fan.mqtt/
config
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    command_topic - string REQUIRED,
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    json_attributes_template - template (optional)
    json_attributes_topic - string (optional)
    name - string (optional, default: MQTT Fan)
    oscillation_command_topic -string (optional)
    oscillation_state_topic - string (optional)
    oscillation_value_template - string (optional)
    payload_available string (optional, default: online)
    payload_not_available - string (optional, default: offline)
    payload_high_speed - string (optional, default: high)
    payload_low_speed - string (optional, default: low)
    payload_medium_speed - string (optional, default: medium)
    payload_not_available - string (optional, default: offline)
    payload_off - string (optional, default: OFF)
    payload_on - string (optional, default: ON)
    payload_oscillation_off - string (optional, default: oscillate_off)
    payload_oscillation_on - string (optional, default: oscillate_on)
    qos - integer (optional, default: 0)
    retain - boolean (optional, default: true)
    speed_command_topic - string (optional)
    speed_state_topic - string (optional)
    speed_value_template - string (optional)
    speeds - string | list (optional). Valid entries are off, low, medium and high.
    state_topic - string (optional)
    state_value_template - string (optional)
    unique_id - string (optional)
}
*/
class HomeAssistantFanComponent extends HomeAssistantComponent {
    constructor(config, { mqttConnection, allStates, debug, node_id, object_id }) {
        if (config.availability) {
            // eslint-disable-next-line no-param-reassign
            config.availability = config.availability.map(data => {
                // eslint-disable-next-line no-param-reassign
                if (typeof data === 'string') data = { topic: data };
                if (!data.topic) throw new Error('topic is required');

                return _.defaults(data, {
                    payload_available     : 'online',
                    payload_not_available : 'offline'
                });
            });
        }
        _.defaults(config, {
            name                    : 'MQTT Fan',
            payload_available       : 'online',
            payload_not_available   : 'offline',
            payload_high_speed      : 'high',
            payload_low_speed       : 'low',
            payload_medium_speed    : 'medium',
            payload_off             : 'OFF',
            payload_on              : 'ON',
            payload_oscillation_off : 'oscillate_off',
            payload_oscillation_on  : 'oscillate_on',
            qos                     : 0,
            retain                  : true
        });
        super(config, { mqttConnection, allStates, debug, domain: 'fan', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name
        };
        this.state.attributes = { ...this.state.attributes, ...this.defaultAttributes };

        this.stateOn = null;

        this.speed_state = null;

        this.oscillation_state = null;
        this.oscillationOn = null;
    }
    init() {
        if (this.config.availability) {
            for (const {
                topic: availability_topic,
                payload_available,
                payload_not_available
            } of this.config.availability) {
                const handler = (data) => {
                    try {
                        if (data === payload_available) {
                            this.available = true;
                            this.emit('available', true);
                        } else if (data === payload_not_available) {
                            this.available = false;
                            this.emit('available', false);
                        } else {
                            throw new Error(`Received wrong payload${data} in ${availability_topic}`);
                        }
                    } catch (e) {
                        this.emit('error', e);
                    }
                };
                const detach = () => {
                    this.mqttConnection.off(`message.${availability_topic}`, handler);
                    this.mqttConnection.unsubscribe(availability_topic);
                };

                // attach
                this.mqttConnection.on(`message.${availability_topic}`, handler);
                this.mqttConnection.subscribe(availability_topic);
                if (this.mqttConnection.topics[availability_topic]) {
                    handler(this.mqttConnection.topics[availability_topic]);
                }

                this.handlers.push({
                    topic : availability_topic, handler, detach
                });
            }
        } else if (this.config.availability_topic) {
            const availability_topic = this.config.availability_topic;
            const payload_available = this.config.payload_available;
            const payload_not_available = this.config.payload_not_available;
            const handler = (data) => {
                try {
                    if (data === payload_available) {
                        this.available = true;
                        this.emit('available', true);
                    } else if (data === payload_not_available) {
                        this.available = false;
                        this.emit('available', false);
                    } else {
                        throw new Error(`Received wrong payload${data} in ${availability_topic}`);
                    }
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${availability_topic}`, handler);
                this.mqttConnection.unsubscribe(availability_topic);
            };

            // attach
            this.mqttConnection.on(`message.${availability_topic}`, handler);
            this.mqttConnection.subscribe(availability_topic);
            if (this.mqttConnection.topics[availability_topic]) handler(this.mqttConnection.topics[availability_topic]);

            this.handlers.push({
                topic : availability_topic, handler, detach
            });
        }
        if (this.config.json_attributes_topic) {
            const json_attributes_topic = this.config.json_attributes_topic;
            const json_attributes_template = this.config.json_attributes_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let json_attributes = null;

                    if (json_attributes_template) {
                        json_attributes = this.apply_template(json_attributes_template, { value, value_json });
                    } else {
                        json_attributes = value_json;
                    }
                    if (!json_attributes) throw new Error(`Received ${json_attributes} instead of object with attributes`);
                    this.state.attributes = { ...json_attributes, ...this.defaultAttributes };
                    this.emit('attributes', this.state.attributes);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${json_attributes_topic}`, handler);
                this.mqttConnection.unsubscribe(json_attributes_topic);
            };

            // attach
            this.mqttConnection.on(`message.${json_attributes_topic}`, handler);
            this.mqttConnection.subscribe(json_attributes_topic);
            if (this.mqttConnection.topics[json_attributes_topic]) {
                handler(this.mqttConnection.topics[json_attributes_topic]);
            }

            this.handlers.push({
                topic : json_attributes_topic, handler, detach
            });
        }
        if (this.config.state_topic) {
            const state_topic = this.config.state_topic;
            const state_value_template = this.config.state_value_template;
            const payload_on = this.config.payload_on;
            const payload_off = this.config.payload_off;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (state_value_template) {
                        result = this.apply_template(state_value_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (`${result}` === `${payload_on}`) {
                        this.stateOn = true;
                    } else if (`${result}` === `${payload_off}`) {
                        this.stateOn = false;
                    } else {
                        throw new Error(`Received wrong state value ${result}`);
                    }
                    this.state.state = result;
                    this.emit('state', this.state.state);
                    this.emit('stateOn', this.stateOn);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${state_topic}`, handler);
                this.mqttConnection.unsubscribe(state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${state_topic}`, handler);
            this.mqttConnection.subscribe(state_topic);
            if (this.mqttConnection.topics[state_topic]) handler(this.mqttConnection.topics[state_topic]);

            this.handlers.push({
                topic : state_topic, handler, detach
            });
        }
        if (this.config.speed_state_topic && this.config.speeds) {
            const speed_state_topic = this.config.speed_state_topic;
            const speed_value_template = this.config.speed_value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (speed_value_template) {
                        result = this.apply_template(speed_value_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.speed_state = result;
                    this.emit('speed_state', this.speed_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${speed_state_topic}`, handler);
                this.mqttConnection.unsubscribe(speed_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${speed_state_topic}`, handler);
            this.mqttConnection.subscribe(speed_state_topic);
            if (this.mqttConnection.topics[speed_state_topic]) handler(this.mqttConnection.topics[speed_state_topic]);

            this.handlers.push({
                topic : speed_state_topic, handler, detach
            });
        }
        if (this.config.oscillation_state_topic) {
            const oscillation_state_topic = this.config.oscillation_state_topic;
            const oscillation_value_template  = this.config.oscillation_value_template;
            const payload_oscillation_on = this.config.payload_oscillation_on;
            const payload_oscillation_off = this.config.payload_oscillation_off;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (oscillation_value_template) {
                        result = this.apply_template(oscillation_value_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (`${result}` === `${payload_oscillation_on}`) {
                        this.oscillationOn = true;
                    } else if (`${result}` === `${payload_oscillation_off}`) {
                        this.oscillationOn = false;
                    } else {
                        throw new Error(`Received wrong state value ${result}`);
                    }
                    this.oscillation_state = result;
                    this.emit('oscillation_state', this.oscillation_state);
                    this.emit('oscillationOn', this.oscillationOn);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${oscillation_state_topic}`, handler);
                this.mqttConnection.unsubscribe(oscillation_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${oscillation_state_topic}`, handler);
            this.mqttConnection.subscribe(oscillation_state_topic);
            if (this.mqttConnection.topics[oscillation_state_topic]) handler(this.mqttConnection.topics[oscillation_state_topic]);

            this.handlers.push({
                topic : oscillation_state_topic, handler, detach
            });
        }
    }
    // async
    // handlers
    async command(data) {
        if (this.debug) this.debug.info('HomeAssistantFanComponent.command', { data });
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, data ? this.config.payload_on : this.config.payload_off);
        if (this.state.state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.command');
            setTimeout(() => {
                if (this.stateOn !== null) this.emit('stateOn', this.stateOn);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.command.onState');
                    detach();
                    resolve(this.stateOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('state', onState);
            });
        }
    }
    async speed_command(data) {
        if (this.debug) this.debug.info('HomeAssistantFanComponent.speed_command', { data });
        if (!this.config.speeds.includes(data)) throw new Error('Wrong value');
        if (!this.config.speed_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.speed_command_topic, data);
        if (this.speed_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.speed_command');
            setTimeout(() => {
                if (this.speed_state !== null) this.emit('speed_state', this.speed_state);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.speed_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('speed_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.speed_command.onState');
                    detach();
                    resolve(this.speed_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('speed_state', onState);
            });
        }
    }
    async oscillation_command(data) {
        if (this.debug) this.debug.info('HomeAssistantFanComponent.oscillation_command', { data });
        if (!this.config.oscillation_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.oscillation_command_topic, data ? this.config.payload_oscillation_on : this.config.payload_oscillation_off);
        if (this.oscillation_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.oscillation_command');
            setTimeout(() => {
                if (this.oscillationOn !== null) this.emit('oscillationOn', this.oscillationOn);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantFanComponent.oscillation_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('oscillation_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.oscillation_command.onState');
                    detach();
                    resolve(this.oscillationOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantFanComponent.oscillation_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('oscillation_state', onState);
            });
        }
    }
}

module.exports = HomeAssistantFanComponent;
