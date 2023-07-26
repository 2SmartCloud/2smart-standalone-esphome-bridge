/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/cover.mqtt/
config
{
    availability - list (optional)
        payload_available - string (optional, default: online)
        payload_not_available - string (optional, default: offline)
        topic - string REQUIRED
    availability_topic - string (optional),
    command_topic - string (optional)
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
    name - string (optional, default: MQTT Cover)
    optimistic - string (optional)
    payload_available string (optional, default: online)
    payload_close - string (optional, default: CLOSE)
    payload_not_available - string (optional, default: offline)
    payload_open - string (optional, default: OPEN)
    payload_stop - string (optional, default: STOP)
    position_closed - integer (optional, default: 0)
    position_open - integer (optional, default: 100)
    position_topic - string (optional)
    qos - integer (optional, default: 0)
    retain - boolean (optional, default: false)
    set_position_template string (optional)
    set_position_topic string (optional)
    state_closed - string (optional, default: closed)
    state_closing - string (optional, default: closing)
    state_open - string (optional, default: open)
    state_opening - string (optional, default: opening)
    state_topic - string (optional)
    tilt_closed_value - integer (optional, default: 0)
    tilt_command_topic - string (optional)
    tilt_invert_state - boolean (optional, default: false)
    tilt_max - integer (optional, default: 100)
    tilt_min - integer (optional, default: 0)
    tilt_opened_value - integer (optional, default: 100)
    tilt_optimistic - boolean (optional)
    tilt_status_template - string (optional)
    tilt_status_topic - string (optional)
    unique_id - string (optional)
    value_template - template (optional)
}
*/
class HomeAssistantCoverComponent extends HomeAssistantComponent {
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
            name                  : 'MQTT Cover',
            payload_available     : 'online',
            payload_close         : 'CLOSE',
            payload_not_available : 'offline',
            payload_open          : 'OPEN',
            payload_stop          : 'STOP',
            position_closed       : 0,
            position_open         : 100,
            qos                   : 0,
            retain                : false,
            state_closed          : 'closed',
            state_closing         : 'closing',
            state_open            : 'open',
            state_opening         : 'opening',
            tilt_closed_value     : 0,
            tilt_invert_state     : false,
            tilt_max              : 100,
            tilt_min              : 0,
            tilt_opened_value     : 100
        });
        super(config, { mqttConnection, allStates, debug, domain: 'cover', node_id, object_id });
        this.state.name = this.config.name;

        this.available = null;

        this.defaultAttributes = {
            friendly_name : this.config.name
        };
        this.state.attributes = { ...this.state.attributes, ...this.defaultAttributes };

        this.position = null;

        this.tilt = null;
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
        if (this.config.position_topic) {
            const position_topic = this.config.position_topic;
            const value_template = this.config.value_template;
            const position_closed = this.config.position_closed;
            const position_open = this.config.position_open;
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
                        result = value;
                    }

                    result = parseInt(result, 10);

                    result = Math.min(
                        Math.max(
                            Math.round(100 * (result - position_closed) / (position_open - position_closed)),
                            0
                        ),
                        100
                    );

                    this.position = result;

                    this.emit('position', this.position);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${position_topic}`, handler);
                this.mqttConnection.unsubscribe(position_topic);
            };

            // attach
            this.mqttConnection.on(`message.${position_topic}`, handler);
            this.mqttConnection.subscribe(position_topic);
            if (this.mqttConnection.topics[position_topic]) handler(this.mqttConnection.topics[position_topic]);

            this.handlers.push({
                topic : position_topic, handler, detach
            });
        } else if (this.config.state_topic) {
            const state_topic = this.config.state_topic;
            const value_template = this.config.value_template;
            const state_closed = this.config.state_closed;
            const state_closing = this.config.state_closing;
            const state_open = this.config.state_open;
            const state_opening = this.config.state_opening;
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

                    if (result === state_closed) {
                        this.real_state = 'closed';
                    } else if (result === state_closing) {
                        this.real_state = 'closing';
                    } else if (result === state_open) {
                        this.real_state = 'open';
                    } else if (result === state_opening) {
                        this.real_state = 'opening';
                    } else {
                        throw new Error(`Received wrong state ${result}`);
                    }

                    this.state.state = result;

                    this.emit('state', this.state.state);
                    this.emit('real_state', this.real_state);
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
        if (this.config.tilt_status_topic) {
            const tilt_status_topic = this.config.tilt_status_topic;
            const tilt_status_template = this.config.tilt_status_template;
            const tilt_min = this.config.tilt_min;
            const tilt_max = this.config.tilt_max;
            const tilt_invert_state = this.config.tilt_invert_state;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (tilt_status_template) {
                        result = this.apply_template(tilt_status_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    result = parseInt(result, 10);

                    if (tilt_invert_state) {
                        result = (tilt_max - result) / (tilt_max - tilt_min);
                    } else {
                        result = (result - tilt_min) / (tilt_max - tilt_min);
                    }
                    result = Math.min(
                        Math.max(
                            Math.round(100 * result),
                            0
                        ),
                        100
                    );

                    this.tilt = result;

                    this.emit('tilt', this.tilt);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${tilt_status_topic}`, handler);
                this.mqttConnection.unsubscribe(tilt_status_topic);
            };

            // attach
            this.mqttConnection.on(`message.${tilt_status_topic}`, handler);
            this.mqttConnection.subscribe(tilt_status_topic);
            if (this.mqttConnection.topics[tilt_status_topic]) handler(this.mqttConnection.topics[tilt_status_topic]);

            this.handlers.push({
                topic : tilt_status_topic, handler, detach
            });
        }
    }
    // async
    async open_command() {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.open_command');
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, this.config.payload_open);

        return true;
    }
    async close_command() {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.open_command');
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, this.config.payload_close);

        return true;
    }
    async stop_command() {
        if (this.debug) this.debug.info('HomeAssistantClimateComponent.open_command');
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, this.config.payload_stop);

        return true;
    }
    async set_position_command(data) {
        if (this.debug) this.debug.info('HomeAssistantCoverComponent.set_position_command', { data });
        if (!this.config.set_position_topic) throw new Error('Not settable');
        const position_closed = this.config.position_closed;
        const position_open = this.config.position_open;
        const set_position_template = this.config.set_position_template;

        const send_data = (set_position_template) ? this.apply_template(set_position_template, { position: data }) : `${
            Math.min(
                Math.max(
                    Math.round(data / 100 * (position_open - position_closed) + position_closed),
                    position_closed
                ),
                position_open
            )
        }`;

        this.mqttConnection.publish(this.config.set_position_topic, send_data);
        if (this.position === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantCoverComponent.set_position_command', { optimistic: true });
            setTimeout(() => {
                if (this.position !== null) this.emit('real_state', this.position);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantCoverComponent.set_position_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('real_state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantCoverComponent.set_position_command.onState');
                    detach();
                    resolve(this.position);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantCoverComponent.set_position_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('real_state', onState);
            });
        }
    }
    async tilt_command(data) {
        if (this.debug) this.debug.info('HomeAssistantCoverComponent.tilt_command', { data });
        if (!this.config.tilt_command_topic) throw new Error('Not settable');
        const tilt_invert_state = this.config.tilt_invert_state;
        const tilt_min = this.config.tilt_min;
        const tilt_max = this.config.tilt_max;

        const send_data = `${
            Math.min(
                Math.max(
                    Math.round(tilt_invert_state ?
                        tilt_max - data / 100 * (tilt_max - tilt_min) :
                        data / 100 * (tilt_max - tilt_min) + tilt_min
                    ),
                    tilt_min
                ),
                tilt_max
            )
        }`;

        this.mqttConnection.publish(this.config.tilt_command_topic, send_data);
        if (this.tilt === null || this.config.tilt_optimistic) {
            if (this.debug) this.debug.info('HomeAssistantCoverComponent.tilt_command', { optimistic: true });
            setTimeout(() => {
                if (this.tilt !== null) this.emit('tilt', this.tilt);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantCoverComponent.tilt_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('tilt', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantCoverComponent.tilt_command.onState');
                    detach();
                    resolve(this.position);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantCoverComponent.tilt_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('tilt', onState);
            });
        }
    }
    // handlers
}

module.exports = HomeAssistantCoverComponent;
