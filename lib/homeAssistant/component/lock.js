/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const Promise = require('bluebird');
const _ = require('underscore');
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/lock.mqtt/
config
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    command_topic string (optional),
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
    icon - icon (optional)
    json_attributes_template - template (optional)
    json_attributes_topic - string (optional)
    name - string (optional, default: MQTT Lock)
    optimistic boolean (optional)
    payload_available string (optional, default: online)
    payload_lock - string (optional, default: LOCK)
    payload_not_available - string (optional, default: offline)
    payload_unlock - string (optional, default: UNLOCK)
    qos integer (optional, default: 0)
    retain boolean (optional, default: false)
    state_topic - string (optional)
    state_locked - string (optional, default: LOCKED)
    state_unlocked - string (optional, default: UNLOCKED)
    unique_id - string (optional)
    value_template - template (optional)
}
*/
class HomeAssistanLockComponent extends HomeAssistantComponent {
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
            name                  : 'MQTT Lock',
            payload_available     : 'online',
            payload_lock          : 'LOCK',
            payload_not_available : 'offline',
            payload_unlock        : 'UNLOCK',
            qos                   : 0,
            retain                : false,
            state_locked          : 'LOCKED',
            state_unlocked        : 'UNLOCKED'
        });
        super(config, { mqttConnection, allStates, debug, domain: 'lock', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name
        };
        this.state.attributes = { ...this.state.attributes, ...this.defaultAttributes };

        this.locked = null;
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
            const state_locked = this.config.state_locked;
            const state_unlocked = this.config.state_unlocked;
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
                    if (`${result}` === `${state_locked}`) {
                        this.locked = true;
                    } else if (`${result}` === `${state_unlocked}`) {
                        this.locked = false;
                    } else {
                        throw new Error(`Received wrong lock value ${result}`);
                    }
                    this.state.state = result;
                    this.emit('state', this.state.state);
                    this.emit('locked', this.locked);
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
        if (this.debug) this.debug.info('HomeAssistanLockComponent.command', { data });
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, data ? this.config.payload_lock : this.config.payload_unlock);
        if (this.state.state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistanLockComponent.command', { optimistic: true });
            setTimeout(() => {
                if (this.locked !== null) this.emit('locked', this.locked);
            }, 1000);

            return data;
        // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistanLockComponent.command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistanLockComponent.command.onState');
                    detach();
                    resolve(this.locked);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistanLockComponent.command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('state', onState);
            });
        }
    }
    // handlers
}

module.exports = HomeAssistanLockComponent;
