/* eslint-disable more/no-duplicated-chains */
const Promise = require('bluebird');
const _ = require('underscore');
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/alarm_control_panel.mqtt/
config
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    code - string (optional),
    code_arm_required - boolean (optional, default: true),
    code_disarm_required - boolean (optional, default: true),
    command_template - string (optional, default: action)
    command_topic string REQUIRED,
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional),
    json_attributes_template - template (optional),
    json_attributes_topic - string (optional),
    name - string (optional, default: MQTT Alarm),
    payload_arm_away - string (optional, default: ARM_AWAY),
    payload_arm_home - string (optional, default: ARM_HOME),
    payload_arm_night - string (optional, default: ARM_NIGHT),
    payload_arm_custom_bypass - string (optional, default: ARM_CUSTOM_BYPASS),
    payload_available - string (optional, default: online),
    payload_disarm - string (optional, default: DISARM),
    payload_not_available - string (optional, default: offline),
    qos - integer (optional, default: 0),
    state_topic - string REQUIRED,
    unique_id - string (optional)
    value_template - template (optional)
}
*/
class HomeAssistantAlarmControlPanelComponent extends HomeAssistantComponent {
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
            code_arm_required         : true,
            code_disarm_required      : true,
            command_template          : '{{ action }}',
            name                      : 'MQTT Alarm',
            payload_arm_away          : 'ARM_AWAY',
            payload_arm_home          : 'ARM_HOME',
            payload_arm_night         : 'ARM_NIGHT',
            payload_arm_custom_bypass : 'ARM_CUSTOM_BYPASS',
            payload_available         : 'online',
            payload_disarm            : 'DISARM',
            payload_not_available     : 'offline',
            qos                       : 0
        });
        super(config, { mqttConnection, allStates, debug, domain: 'alarm_control_panel', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name,
            icon          : this.config.icon
        };
        if (this.config.unit_of_measurement) {
            this.defaultAttributes.unit_of_measurement = this.config.unit_of_measurement;
        }
        this.state.attributes = { ...this.state.attributes, ...this.defaultAttributes };
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
            const value_template = this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (value_template) {
                        result = this.apply_template(value_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.state.state = result;
                    this.emit('state', this.state.state);
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
    }
    // async
    async command(data) {
        if (this.debug) this.debug.info('HomeAssistantAlarmControlPanelComponent.command', { data });
        this.mqttConnection.publish(this.command, data ? this.config.payload_on : this.config.payload_off);
        if (this.state.state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantAlarmControlPanelComponent.command', { optimistic: true });
            setTimeout(() => {
                if (this.stateOn !== null) this.emit('stateOn', this.stateOn);
            }, 1000);

            return data;
        // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantAlarmControlPanelComponent.command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantAlarmControlPanelComponent.command.onState');
                    detach();
                    resolve(this.stateOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantAlarmControlPanelComponent.command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('state', onState);
            });
        }
    }
    // handlers
}

module.exports = HomeAssistantAlarmControlPanelComponent;
