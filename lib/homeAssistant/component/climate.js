/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/climate.mqtt/
config
{
    action_template - template (optional)
    action_topic - string (optional)
    aux_command_topic - string (optional)
    aux_state_template - template (optional)
    aux_state_topic - string (optional)
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    away_mode_command_topic - string (optional)
    away_mode_state_template - template (optional)
    away_mode_state_topic - string (optional)
    current_temperature_template - template (optional)
    current_temperature_topic - string (optional)
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    fan_mode_command_topic - string (optional)
    fan_mode_state_template - template (optional)
    fan_mode_state_topic - string (optional)
    fan_modes - list (optional)(Default: [“auto”, “low”, “medium”, “high”])
    hold_command_topic - string (optional)
    hold_state_template - template (optional)
    hold_state_topic - string (optional)
    hold_modes - ist (optional)
    initial - integer (optional, default: 21)
    json_attributes_template - template (optional)
    json_attributes_topic - string (optional)
    max_temp - float (optional)
    min_temp - float (optional)
    mode_command_topic - string (optional)
    mode_state_template - template (optional)
    mode_state_topic - string (optional)
    modes - list (optional), Default: [“auto”, “off”, “cool”, “heat”, “dry”, “fan_only”]
    name - string (optional, default: MQTT HVAC)
    payload_available string (optional, default: online)
    payload_not_available - string (optional, default: offline)
    payload_off - string (optional, default: OFF)
    payload_on - string (optional, default: ON)
    power_command_topic - string (optional)
    precision - float (optional), Default: 0.1 for Celsius and 1.0 for Fahrenheit. Supported values are 0.1, 0.5 and 1.0.
    qos - integer (optional, default: 0)
    retain - boolean (optional, default: false)
    send_if_off - boolean (optional, default: true)
    swing_mode_command_topic - string (optional)
    swing_mode_state_template - template (optional)
    swing_mode_state_topic - string (optional)
    swing_modes - list (optional, default: [“on”, “off”])
    temperature_command_topic - string (optional)
    temperature_high_command_topic - string (optional)
    temperature_high_state_template - template (optional)
    temperature_high_state_topci - string (optional)
    temperature_low_command_topic - string (optional)
    temperature_low_state_template - template (optional)
    temperature_low_state_topic - string (optional)
    temperature_state_template - template (optional)
    temperature_state_topic - string (optional)
    temperature_unit - string (optional), C or F, Default: system temperature unit.
    temp_step - float (optional, default: 1)
    unique_id - string (optional)
    value_template - template (optional)
}
*/
class HomeAssistantClimateComponent extends HomeAssistantComponent {
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
            fan_modes             : [ 'auto', 'low', 'medium', 'high' ],
            initial               : 21,
            modes                 : [ 'auto', 'off', 'cool', 'heat', 'dry', 'fan_only' ],
            name                  : 'MQTT HVAC',
            payload_available     : 'online',
            payload_not_available : 'offline',
            payload_off           : 'OFF',
            payload_on            : 'ON',
            qos                   : 0,
            retain                : false,
            send_if_off           : true,
            swing_modes           : [ 'on', 'off' ],
            temperature_unit      : 'C',
            temp_step             : 1
        });
        _.defaults(config, {
            precision : config.temperature_unit === 'C' ? 0.1 : 1
        });
        super(config, { mqttConnection, allStates, debug, domain: 'climate', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name
        };
        this.state.attributes = { ...this.state.attributes, ...this.defaultAttributes };

        this.aux_state = null;
        this.auxOn = null;

        this.away_mode_state = null;
        this.awayModeOn = null;

        this.fan_mode_state = null;

        this.hold_state = null;

        this.mode_state = null;

        this.temperature_high_state = null;

        this.temperature_low_state = null;
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
        if (this.config.action_topic) {
            const action_topic = this.config.action_topic;
            const action_template = this.config.action_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (action_template) {
                        result = this.apply_template(action_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }

                    this.action = result;

                    this.emit('action', this.action);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${action_topic}`, handler);
                this.mqttConnection.unsubscribe(action_topic);
            };

            // attach
            this.mqttConnection.on(`message.${action_topic}`, handler);
            this.mqttConnection.subscribe(action_topic);
            if (this.mqttConnection.topics[action_topic]) handler(this.mqttConnection.topics[action_topic]);

            this.handlers.push({
                topic : action_topic, handler, detach
            });
        }
        if (this.config.aux_state_topic) {
            const aux_state_topic = this.config.aux_state_topic;
            const aux_state_template = this.config.aux_state_template || this.config.value_template;
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

                    if (aux_state_template) {
                        result = this.apply_template(aux_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (`${result}` === `${payload_on}`) {
                        this.auxOn = true;
                    } else if (`${result}` === `${payload_off}`) {
                        this.auxOn = false;
                    } else {
                        throw new Error(`Received wrong aux value ${result}`);
                    }
                    this.aux_state = result;
                    this.emit('aux_state', this.aux_state);
                    this.emit('auxOn', this.auxOn);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${aux_state_topic}`, handler);
                this.mqttConnection.unsubscribe(aux_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${aux_state_topic}`, handler);
            this.mqttConnection.subscribe(aux_state_topic);
            if (this.mqttConnection.topics[aux_state_topic]) handler(this.mqttConnection.topics[aux_state_topic]);

            this.handlers.push({
                topic : aux_state_topic, handler, detach
            });
        }
        if (this.config.current_temperature_topic) {
            const current_temperature_topic = this.config.current_temperature_topic;
            const current_temperature_template = this.config.current_temperature_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (current_temperature_template) {
                        result = this.apply_template(current_temperature_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.current_temperature = result;
                    this.emit('current_temperature', this.current_temperature);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${current_temperature_topic}`, handler);
                this.mqttConnection.unsubscribe(current_temperature_topic);
            };

            // attach
            this.mqttConnection.on(`message.${current_temperature_topic}`, handler);
            this.mqttConnection.subscribe(current_temperature_topic);
            if (this.mqttConnection.topics[current_temperature_topic]) handler(this.mqttConnection.topics[current_temperature_topic]);

            this.handlers.push({
                topic : current_temperature_topic, handler, detach
            });
        }
        if (this.config.away_mode_state_topic) {
            const away_mode_state_topic = this.config.away_mode_state_topic;
            const away_mode_state_template = this.config.away_mode_state_template || this.config.value_template;
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

                    if (away_mode_state_template) {
                        result = this.apply_template(away_mode_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (`${result}` === `${payload_on}`) {
                        this.auxOn = true;
                    } else if (`${result}` === `${payload_off}`) {
                        this.auxOn = false;
                    } else {
                        throw new Error(`Received wrong away home value ${result}`);
                    }
                    this.away_mode_state = result;
                    this.emit('away_mode_state', this.away_mode_state);
                    this.emit('awayModeOn', this.awayModeOn);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${away_mode_state_topic}`, handler);
                this.mqttConnection.unsubscribe(away_mode_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${away_mode_state_topic}`, handler);
            this.mqttConnection.subscribe(away_mode_state_topic);
            if (this.mqttConnection.topics[away_mode_state_topic]) handler(this.mqttConnection.topics[away_mode_state_topic]);

            this.handlers.push({
                topic : away_mode_state_topic, handler, detach
            });
        }
        if (this.config.fan_mode_state_topic) {
            const fan_mode_state_topic = this.config.fan_mode_state_topic;
            const fan_mode_state_template = this.config.fan_mode_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (fan_mode_state_template) {
                        result = this.apply_template(fan_mode_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (!this.config.fan_modes.includes(result)) {
                        throw new Error(`Received wrong fan mode state ${result}`);
                    }
                    this.fan_mode_state = result;
                    this.emit('fan_mode_state', this.fan_mode_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${fan_mode_state_topic}`, handler);
                this.mqttConnection.unsubscribe(fan_mode_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${fan_mode_state_topic}`, handler);
            this.mqttConnection.subscribe(fan_mode_state_topic);
            if (this.mqttConnection.topics[fan_mode_state_topic]) handler(this.mqttConnection.topics[fan_mode_state_topic]);

            this.handlers.push({
                topic : fan_mode_state_topic, handler, detach
            });
        }
        if (this.config.hold_state_topic && this.config.hold_modes) {
            const hold_state_topic = this.config.hold_state_topic;
            const hold_state_template = this.config.hold_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (hold_state_template) {
                        result = this.apply_template(hold_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (!this.config.hold_modes.includes(result)) {
                        throw new Error(`Received wrong hold mode state ${result}`);
                    }
                    this.hold_mode_state = result;
                    this.emit('hold_mode_state', this.hold_mode_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${hold_state_topic}`, handler);
                this.mqttConnection.unsubscribe(hold_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${hold_state_topic}`, handler);
            this.mqttConnection.subscribe(hold_state_topic);
            if (this.mqttConnection.topics[hold_state_topic]) handler(this.mqttConnection.topics[hold_state_topic]);

            this.handlers.push({
                topic : hold_state_topic, handler, detach
            });
        }
        if (this.config.mode_state_topic) {
            const mode_state_topic = this.config.mode_state_topic;
            const mode_state_template = this.config.mode_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (mode_state_template) {
                        result = this.apply_template(mode_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (!this.config.modes.includes(result)) {
                        throw new Error(`Received wrong mode state ${result}`);
                    }
                    this.mode_state = result;
                    this.emit('mode_state', this.mode_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${mode_state_topic}`, handler);
                this.mqttConnection.unsubscribe(mode_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${mode_state_topic}`, handler);
            this.mqttConnection.subscribe(mode_state_topic);
            if (this.mqttConnection.topics[mode_state_topic]) handler(this.mqttConnection.topics[mode_state_topic]);

            this.handlers.push({
                topic : mode_state_topic, handler, detach
            });
        }
        if (this.config.swing_mode_state_topic) {
            const swing_mode_state_topic = this.config.swing_mode_state_topic;
            const swing_mode_state_template = this.config.swing_mode_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (swing_mode_state_template) {
                        result = this.apply_template(swing_mode_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    if (!this.config.swing_modes.includes(result)) {
                        throw new Error(`Received wrong swing mode state ${result}`);
                    }
                    this.swing_mode_state = result;
                    this.emit('swing_mode_state', this.swing_mode_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${swing_mode_state_topic}`, handler);
                this.mqttConnection.unsubscribe(swing_mode_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${swing_mode_state_topic}`, handler);
            this.mqttConnection.subscribe(swing_mode_state_topic);
            if (this.mqttConnection.topics[swing_mode_state_topic]) handler(this.mqttConnection.topics[swing_mode_state_topic]);

            this.handlers.push({
                topic : swing_mode_state_topic, handler, detach
            });
        }
        if (this.config.temperature_high_state_topic) {
            const temperature_high_state_topic = this.config.temperature_high_state_topic;
            const temperature_high_state_template = this.config.temperature_high_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (temperature_high_state_template) {
                        result = this.apply_template(temperature_high_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.temperature_high_state = result;
                    this.emit('temperature_high_state', this.temperature_high_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${temperature_high_state_topic}`, handler);
                this.mqttConnection.unsubscribe(temperature_high_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${temperature_high_state_topic}`, handler);
            this.mqttConnection.subscribe(temperature_high_state_topic);
            if (this.mqttConnection.topics[temperature_high_state_topic]) handler(this.mqttConnection.topics[temperature_high_state_topic]);

            this.handlers.push({
                topic : temperature_high_state_topic, handler, detach
            });
        }
        if (this.config.temperature_low_state_topic) {
            const temperature_low_state_topic = this.config.temperature_low_state_topic;
            const temperature_low_state_template = this.config.temperature_low_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (temperature_low_state_template) {
                        result = this.apply_template(temperature_low_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.temperature_low_state = result;
                    this.emit('temperature_low_state', this.temperature_low_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${temperature_low_state_topic}`, handler);
                this.mqttConnection.unsubscribe(temperature_low_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${temperature_low_state_topic}`, handler);
            this.mqttConnection.subscribe(temperature_low_state_topic);
            if (this.mqttConnection.topics[temperature_low_state_topic]) handler(this.mqttConnection.topics[temperature_low_state_topic]);

            this.handlers.push({
                topic : temperature_low_state_topic, handler, detach
            });
        }
        if (this.config.temperature_state_topic) {
            const temperature_state_topic = this.config.temperature_state_topic;
            const temperature_state_template = this.config.temperature_state_template || this.config.value_template;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (temperature_state_template) {
                        result = this.apply_template(temperature_state_template, { value, value_json });
                    } else {
                        result = value_json || value;
                    }
                    this.temperature_state = result;
                    this.emit('temperature_state', this.temperature_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${temperature_state_topic}`, handler);
                this.mqttConnection.unsubscribe(temperature_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${temperature_state_topic}`, handler);
            this.mqttConnection.subscribe(temperature_state_topic);
            if (this.mqttConnection.topics[temperature_state_topic]) handler(this.mqttConnection.topics[temperature_state_topic]);

            this.handlers.push({
                topic : temperature_state_topic, handler, detach
            });
        }
    }
    // async
    // handlers
    async aux_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.aux_command', { data });
        if (!this.config.aux_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.aux_command_topic, data ? this.config.payload_on : this.config.payload_off);
        if (this.aux_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.aux_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.aux_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('aux_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.aux_command.onState');
                    detach();
                    resolve(this.auxOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.aux_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('aux_state', onState);
            });
        }
    }
    async away_mode_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.away_mode_command', { data });
        if (!this.config.away_mode_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.away_mode_command_topic, data ? this.config.payload_on : this.config.payload_off);
        if (this.away_mode_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.away_mode_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.away_mode_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('away_mode_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.away_mode_command.onState');
                    detach();
                    resolve(this.awayModeOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.away_mode_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('away_mode_state', onState);
            });
        }
    }
    async fan_mode_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.fan_mode_command', { data });
        if (!this.config.fan_modes.includes(data)) throw new Error('Wrong value');
        if (!this.config.fan_mode_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.fan_mode_command_topic, data);
        if (this.fan_mode_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.fan_mode_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.fan_mode_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('fan_mode_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.fan_mode_command.onState');
                    detach();
                    resolve(this.fan_mode_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.fan_mode_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('fan_mode_state', onState);
            });
        }
    }
    async hold_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.hold_command', { data });
        if (!this.config.hold_modes.includes(data)) throw new Error('Wrong value');
        if (!this.config.hold_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.hold_command_topic, data);
        if (this.hold_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.hold_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.hold_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('hold_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.hold_command.onState');
                    detach();
                    resolve(this.hold_mode_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.hold_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('hold_state', onState);
            });
        }
    }
    async mode_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.mode_command', { data });
        if (!this.config.modes.includes(data)) throw new Error('Wrong value');
        if (!this.config.mode_command_topic) throw new Error('Not settable');
        if (this.config.power_command_topic && this.config.modes.includes('off')) this.mqttConnection.publish(this.config.power_command_topic, data === 'off' ? this.config.payload_off : this.config.payload_on);
        this.mqttConnection.publish(this.config.mode_command_topic, data);
        if (this.mode_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.mode_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.mode_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('mode_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.mode_command.onState');
                    detach();
                    resolve(this.mode_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.mode_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('mode_state', onState);
            });
        }
    }
    async swing_mode_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.swing_mode_command', { data });
        if (!this.config.swing_modes.includes(data)) throw new Error('Wrong value');
        if (!this.config.swing_mode_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.swing_mode_command_topic, data);
        if (this.swing_mode_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.swing_mode_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.swing_mode_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('swing_mode_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.swing_mode_command.onState');
                    detach();
                    resolve(this.swing_mode_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.swing_mode_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('swing_mode_state', onState);
            });
        }
    }
    async temperature_high_state_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_high_state_command', { data });
        if (!this.config.temperature_high_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.temperature_high_command_topic, data);
        if (this.temperature_high_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_high_state_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_high_state_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('temperature_high_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_high_state_command.onState');
                    detach();
                    resolve(this.temperature_high_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_high_state_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('temperature_high_state', onState);
            });
        }
    }
    async temperature_low_state_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_low_state_command', { data });
        if (!this.config.temperature_low_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.temperature_low_command_topic, data);
        if (this.temperature_low_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_low_state_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_low_state_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('temperature_low_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_low_state_command.onState');
                    detach();
                    resolve(this.temperature_low_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_low_state_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('temperature_low_state', onState);
            });
        }
    }
    async temperature_state_command(data) {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_state_command', { data });
        if (!this.config.temperature_command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.temperature_command_topic, data);
        if (this.temperature_state === null) {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_state_command');

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_state_command');

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('temperature_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_state_command.onState');
                    detach();
                    resolve(this.temperature_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantClimateComponent.temperature_state_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('temperature_state', onState);
            });
        }
    }
}

module.exports = HomeAssistantClimateComponent;
