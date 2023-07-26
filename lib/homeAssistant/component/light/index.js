/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const HomeAssistantComponent = require('../index');

const SUPPORTED_SHCEMAS = [ 'default', 'json', 'template' ];

/*
https://www.home-assistant.io/integrations/light.mqtt/
config default schema
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    brightness_command_topic - string (optional),
    brightness_scale - integer (optional, default: 255),
    brightness_state_topic - string (optional),
    brightness_value_template - string (optional),
    color_temp_command_template - string (optional),
    color_temp_command_topic - string (optional),'
    color_temp_state_topic - string (optional),
    color_temp_value_template - string (optional),
    command_topic - string REQUIRED,
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    effect_command_topic - string (optional),
    effect_list - string | list (optional),
    effect_state_topic - string (optional),
    effect_value_template - string (optional),
    hs_command_topic - string (optional),
    hs_state_topic - string (optional),
    hs_value_template - string (optional),
    json_attributes_template - template (optional),
    json_attributes_topic - string (optional),
    max_mireds - integer (optional),
    min_mireds - integer (optional),
    name - string (optional, default: MQTT Light),
    on_command_type - string (optional),
    optimistic boolean (optional),
    payload_available string (optional, default: online)
    payload_not_available - string (optional, default: offline)
    payload_off - string (optional, default: OFF)
    payload_on - string (optional, default: ON)
    qos integer (optional, default: 0)
    retain boolean (optional, default: false)
    rgb_command_template - string (optional)
    rgb_command_topic - string (optional)
    rgb_state_topic - string (optional)
    rgb_value_template - string (optional)
    schema - string (optional, default: default)
    state_topic - string (optional)
    state_value_template - string (optional)
    unique_id - string (optional)
    white_value_command_topic - string (optional)
    white_value_scale - integer (optional, default: 255)
    white_value_state_topic - string (optional)
    white_value_template - string (optional)
    xy_command_topic string (optional)
    xy_state_topic string (optional)
    xy_value_template string (optional)
}
config json schema
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    brightness - boolean (optional, default: false)
    brightness_scale - integer (optional, default: 255)
    color_temp boolean - (optional, default: false)
    command_topic - string REQUIRED
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    effect - boolean (optional, default: false)
    effect_list string | list (optional)
    flash_time_long - integer (optional, default: 10)
    flash_time_short - integer (optional, default: 2)
    hs - boolean (optional, default: false)
    json_attributes_template - template (optional),
    json_attributes_topic - string (optional),
    max_mireds - integer (optional),
    min_mireds - integer (optional),
    name string - (optional, default: MQTT JSON Light)
    optimistic - boolean (optional),
    payload_available - string (optional, default: online)
    payload_not_available - string (optional, default: offline)
    qos integer (optional, default: 0)
    retain boolean (optional, default: false)
    rgb - boolean (optional, default: false)
    schema - string (optional, default: default)
    state_topic - string (optional)
    unique_id - string (optional)
    white_value - boolean (optional, default: false)
    xy - boolean (optional, default: false)
}
config Template schema
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    blue_template - string (optional)
    brightness_template - string (optional)
    color_temp_template - string (optional)
    command_off_template - string REQUIRED
    command_on_template - string REQUIRED
    command_topic - string REQUIRED
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    effect_list - string | list (optional)
    effect_template - string (optional)
    green_template - string (optional)
    json_attributes_template - template (optional),
    json_attributes_topic - string (optional),
    max_mireds - integer (optional),
    min_mireds - integer (optional),
    name string - (optional, default: MQTT Template Light)
    optimistic - boolean (optional),
    payload_available - string (optional, default: online)
    payload_not_available - string (optional, default: offline)
    qos - integer (optional, default: 0)
    red_template - string (optional)
    schema - string (optional, default: default)
    state_template - string (optional)
    state_topic - string (optional)
    unique_id - string (optional)
    white_value_template - string (optional)
}
*/
class HomeAssistantLightComponent extends HomeAssistantComponent {
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
            name                  : 'MQTT Light',
            payload_available     : 'online',
            payload_not_available : 'offline',
            qos                   : 0
        });
        super(config, { mqttConnection, allStates, debug, domain: 'light', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name
        };
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
    }
    // async
    static SUPPORTED_SHCEMAS = SUPPORTED_SHCEMAS;
    // handlers
    static create(config, options) {
        if (this && this !== HomeAssistantLightComponent) return new this(config, options);

        _.defaults(config, {
            schema : 'default'
        });

        if (!this.SUPPORTED_SHCEMAS.includes(config.schema)) throw new Error(`Bad schema ${config.schema} provided`);

        const ComponentLightClass = require(`./${config.schema}`);

        return ComponentLightClass.create(config, options);
    }
}

module.exports = HomeAssistantLightComponent;
