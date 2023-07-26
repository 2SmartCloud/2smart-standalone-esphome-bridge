/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const colorsys = require('colorsys');
const convertcolors = require('@csstools/convert-colors');
const HomeAssistantLightComponent = require('./index');

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
*/
class HomeAssistantDefaultLightComponent extends HomeAssistantLightComponent {
    constructor(config, { mqttConnection, allStates, debug, node_id, object_id }) {
        _.defaults(config, {
            brightness_scale  : 255,
            name              : 'MQTT Light',
            payload_on        : 'ON',
            payload_off       : 'OFF',
            on_command_type   : 'last',
            qos               : 0,
            retain            : false,
            min_mireds        : 153,
            max_mireds        : 500,
            white_value_scale : 255
        });

        // eslint-disable-next-line no-param-reassign
        if (typeof config.effect_list === 'string') config.effect_list = config.effect_list.split(',');

        if (!config.command_topic) throw new Error('command_topic is required');

        super(config, { mqttConnection, allStates, debug, node_id, object_id });

        this.stateOn = null;

        this.brightness_state = null;
        this.brightness_percent = null;

        this.hs_state = null;

        this.xy_state = null;

        this.rgb_state = null;

        this.real_rgb_state = null;

        this.color_temp_state = null;
        this.color_temp_percent = null;

        this.effect_state = null;

        this.white_value_state = null;
        this.white_value_percent = null;
    }
    init() {
        super.init();
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
                        result = value;
                    }
                    if (`${result}` === `${payload_on}`) {
                        this.stateOn = true;
                    } else if (`${result}` === `${payload_off}`) {
                        this.stateOn = false;
                    } else {
                        throw new Error(`Received wrong light value ${result}`);
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
        if (this.config.brightness_state_topic) {
            const brightness_state_topic = this.config.brightness_state_topic;
            const brightness_value_template = this.config.brightness_value_template;
            const brightness_scale = this.config.brightness_scale;
            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (brightness_value_template) {
                        result = this.apply_template(brightness_value_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    const brightness_state = parseInt(result, 10);

                    const brightness_percent = Math.min(
                        Math.max(
                            Math.round(100 * brightness_state / brightness_scale),
                            0
                        ),
                        100
                    );

                    this.brightness_state = brightness_state;
                    this.brightness_percent = brightness_percent;

                    this.emit('brightness_state', this.brightness_state);
                    this.emit('brightness_percent', this.brightness_percent);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${brightness_state_topic}`, handler);
                this.mqttConnection.unsubscribe(brightness_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${brightness_state_topic}`, handler);
            this.mqttConnection.subscribe(brightness_state_topic);
            if (this.mqttConnection.topics[brightness_state_topic]) handler(this.mqttConnection.topics[brightness_state_topic]);

            this.handlers.push({
                topic : brightness_state_topic, handler, detach
            });
        }
        if (this.config.hs_state_topic) {
            const hs_state_topic = this.config.hs_state_topic;
            const hs_value_template = this.config.hs_value_template;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (hs_value_template) {
                        result = this.apply_template(hs_value_template, { value, value_json });
                    } else {
                        result = value;
                    }
                    const [ h, s ] = result.split(',').map(n => parseFloat(n, 10));

                    const v = this.config.brightness_state_topic && this.brightness_percent !== null ? this.brightness_percent : 100;

                    const { r: rr, g: rg, b: rb  } = colorsys.hsv_to_rgb({ h, s, v });

                    this.hs_state = result;
                    this.real_rgb_state = `${rr},${rg},${rb}`;

                    this.emit('hs_state', this.hs_state);
                    this.emit('real_rgb_state', this.real_rgb_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${hs_state_topic}`, handler);
                this.mqttConnection.unsubscribe(hs_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${hs_state_topic}`, handler);
            this.mqttConnection.subscribe(hs_state_topic);
            if (this.mqttConnection.topics[hs_state_topic]) handler(this.mqttConnection.topics[hs_state_topic]);

            this.handlers.push({
                topic : hs_state_topic, handler, detach
            });
        }
        if (this.config.xy_state_topic) {
            const xy_state_topic = this.config.xy_state_topic;
            const xy_value_template = this.config.xy_value_template;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (xy_value_template) {
                        result = this.apply_template(xy_value_template, { value, value_json });
                    } else {
                        result = value;
                    }
                    const [ x, y ] = result.split(',').map(n => parseFloat(n, 10));

                    const z = this.config.brightness_state_topic && this.brightness_percent !== null ? this.brightness_percent : 100;

                    const [ rr, rg, rb  ] = convertcolors.xyz2rgb(x, y, z);

                    this.xy_state = result;
                    this.real_rgb_state = `${rr},${rg},${rb}`;

                    this.emit('xy_state', this.xy_state);
                    this.emit('real_rgb_state', this.real_rgb_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${xy_state_topic}`, handler);
                this.mqttConnection.unsubscribe(xy_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${xy_state_topic}`, handler);
            this.mqttConnection.subscribe(xy_state_topic);
            if (this.mqttConnection.topics[xy_state_topic]) handler(this.mqttConnection.topics[xy_state_topic]);

            this.handlers.push({
                topic : xy_state_topic, handler, detach
            });
        }
        if (this.config.rgb_state_topic) {
            const rgb_state_topic = this.config.rgb_state_topic;
            const rgb_value_template = this.config.rgb_value_template;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (rgb_value_template) {
                        result = this.apply_template(rgb_value_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    const [ r, g, b ] = result.split(',').map(n => parseInt(n, 10));

                    // eslint-disable-next-line prefer-const
                    let { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });

                    if (this.config.brightness_state_topic) v = this.brightness_percent === null ? 100 : this.brightness_percent;
                    else this.brightness_percent = v;

                    const { r: rr, g: rg, b: rb  } = colorsys.hsv_to_rgb({ h, s, v });

                    this.rgb_state = result;
                    this.real_rgb_state = `${rr},${rg},${rb}`;

                    if (!this.config.brightness_state_topic) this.emit('brightness_percent', this.brightness_percent);
                    this.emit('rgb_state', this.rgb_state);
                    this.emit('real_rgb_state', this.real_rgb_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${rgb_state_topic}`, handler);
                this.mqttConnection.unsubscribe(rgb_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${rgb_state_topic}`, handler);
            this.mqttConnection.subscribe(rgb_state_topic);
            if (this.mqttConnection.topics[rgb_state_topic]) handler(this.mqttConnection.topics[rgb_state_topic]);

            this.handlers.push({
                topic : rgb_state_topic, handler, detach
            });
        }
        if (this.config.color_temp_state_topic) {
            const color_temp_state_topic = this.config.color_temp_state_topic;
            const color_temp_value_template = this.config.color_temp_value_template;
            const min_mireds = this.config.min_mireds;
            const max_mireds = this.config.max_mireds;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (color_temp_value_template) {
                        result = this.apply_template(color_temp_value_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    const color_temp_state = parseInt(result, 10);

                    const color_temp_percent = Math.min(
                        Math.max(
                            Math.round(100 * (color_temp_state - min_mireds) / (max_mireds - min_mireds)),
                            0
                        ),
                        100
                    );

                    this.color_temp_state = color_temp_state;
                    this.color_temp_percent = color_temp_percent;

                    this.emit('color_temp_state', this.color_temp_state);
                    this.emit('color_temp_percent', this.color_temp_percent);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${color_temp_state_topic}`, handler);
                this.mqttConnection.unsubscribe(color_temp_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${color_temp_state_topic}`, handler);
            this.mqttConnection.subscribe(color_temp_state_topic);
            if (this.mqttConnection.topics[color_temp_state_topic]) handler(this.mqttConnection.topics[color_temp_state_topic]);

            this.handlers.push({
                topic : color_temp_state_topic, handler, detach
            });
        }
        if (this.config.effect_state_topic && this.config.effect_list) {
            const effect_state_topic = this.config.effect_state_topic;
            const effect_value_template = this.config.effect_value_template;
            const effect_list = this.config.effect_list;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (effect_value_template) {
                        result = this.apply_template(effect_value_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    if (!effect_list.includes(result)) throw new Error(`Bad effect received ${result}`);

                    this.effect_state = result;

                    this.emit('effect_state', this.effect_state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${effect_state_topic}`, handler);
                this.mqttConnection.unsubscribe(effect_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${effect_state_topic}`, handler);
            this.mqttConnection.subscribe(effect_state_topic);
            if (this.mqttConnection.topics[effect_state_topic]) handler(this.mqttConnection.topics[effect_state_topic]);

            this.handlers.push({
                topic : effect_state_topic, handler, detach
            });
        }
        if (this.config.white_value_command_topic) {
            const white_value_state_topic = this.config.white_value_state_topic;
            const white_value_template = this.config.white_value_template;
            const white_value_scale = this.config.white_value_scale;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                    // eslint-disable-next-line no-empty
                    } catch (e) {}

                    let result = null;

                    if (white_value_template) {
                        result = this.apply_template(white_value_template, { value, value_json });
                    } else {
                        result = value;
                    }

                    const white_value_state = parseInt(result, 10);

                    const white_value_percent = Math.min(
                        Math.max(
                            Math.round(100 * white_value_state / white_value_scale),
                            0
                        ),
                        100
                    );

                    this.white_value_state = white_value_state;
                    this.white_value_percent = white_value_percent;

                    this.emit('white_value_state', this.white_value_state);
                    this.emit('white_value_percent', this.white_value_percent);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${white_value_state_topic}`, handler);
                this.mqttConnection.unsubscribe(white_value_state_topic);
            };

            // attach
            this.mqttConnection.on(`message.${white_value_state_topic}`, handler);
            this.mqttConnection.subscribe(white_value_state_topic);
            if (this.mqttConnection.topics[white_value_state_topic]) handler(this.mqttConnection.topics[white_value_state_topic]);

            this.handlers.push({
                topic : white_value_state_topic, handler, detach
            });
        }
    }
    // async
    // async
    async command(data) {
        if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command', { data });
        if (!this.config.command_topic) throw new Error('Not settable');
        this.mqttConnection.publish(this.config.command_topic, data ? this.config.payload_on : this.config.payload_off);
        if (this.state.state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command', { optimistic: true });
            setTimeout(() => {
                if (this.stateOn !== null) this.emit('stateOn', this.stateOn);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('state', onState);
                };
                const onState = () => {
                    if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command.onState');
                    detach();
                    resolve(this.stateOn);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('state', onState);
            });
        }
    }
    async brightness_command(data) {
        if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.brightness_command', { data });
        if (!this.config.brightness_command_topic) throw new Error('Not settable');

        if (this.config.on_command_type === 'first') await this.command(true);
        this.mqttConnection.publish(this.config.brightness_command_topic, data);
        if (this.brightness_percent === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.brightness_command', { optimistic: true });
            setTimeout(() => {
                if (this.brightness_state !== null) this.emit('brightness_state', this.brightness_state);
                if (this.brightness_percent !== null) this.emit('brightness_percent', this.brightness_percent);
            }, 1000);

            if (this.config.on_command_type === 'last') await this.command(true);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.brightness_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('brightness_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.brightness_command.onState');
                    detach();
                    if (this.config.on_command_type === 'last') await this.command(true);
                    resolve(this.brightness_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.brightness_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('brightness_state', onState);
            });
        }
    }
    async brightness_percent_command(data) {
        if (this.config.brightness_command_topic) {
            const brightness_scale = this.config.brightness_scale;

            await this.brightness_command(Math.round(data * brightness_scale / 100));
        } else if (this.config.rgb_command_topic) {
            const [ r, g, b ] = (this.real_rgb_state || '255,255,255').split(',').map(n => parseInt(n, 10));
            const { h, s } = colorsys.rgb_to_hsv({ r, g, b });
            const { r: nr, g: ng, b: nb } = colorsys.rgb_to_hsv({ h, s, v: data });

            await this.real_rgb_command(`${nr},${ng},${nb}`);
        }

        return this.brightness_percent !== null ? this.brightness_percent : data;
    }
    async real_rgb_command(rgb) {
        const rgb_command_topic = this.config.rgb_command_topic;
        const rgb_command_template = this.config.rgb_command_template;
        const hs_command_topic = this.config.hs_command_topic;
        const xy_command_topic = this.config.xy_command_topic;
        const brightness_command_topic = this.config.brightness_command_topic;

        if (!rgb_command_topic && !hs_command_topic && !xy_command_topic) throw new Error('Not settable');

        const [ r, g, b ] = rgb.split(',').map(n => parseInt(n, 10));
        const { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });
        const [ x, y ] = convertcolors.rgb2xyz(r, g, b);
        const { r: nr, g: ng, b: nb } = colorsys.hsv_to_rgb({ h, s, v });

        if (this.config.on_command_type === 'first') await this.command(true);

        if (brightness_command_topic) this.mqttConnection.publish(brightness_command_topic, `${Math.round(v * 255 / 100)}`);
        if (rgb_command_topic) {
            const [ red, green, blue ] = brightness_command_topic ? [ nr, ng, nb ] : [ r, g, b ];

            this.mqttConnection.publish(rgb_command_topic, rgb_command_template ? this.apply_template(rgb_command_template, { red, green, blue }) : `${red},${green},${blue}`);
        }
        if (hs_command_topic) {
            this.mqttConnection.publish(hs_command_topic, `${h.toFixed(1)},${s.toFixed(1)}`);
        }
        if (hs_command_topic) {
            this.mqttConnection.publish(xy_command_topic, `${x.toFixed(3)},${y.toFixed(3)}`);
        }
        if (this.real_rgb_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.real_rgb_command', { optimistic: true });
            setTimeout(() => {
                if (this.real_rgb_state !== null) this.emit('real_rgb_state', this.real_rgb_state);
            }, 1000);

            if (this.config.on_command_type === 'last') await this.command(true);

            return rgb;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.real_rgb_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('real_rgb_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.real_rgb_command.onState');
                    detach();
                    if (this.config.on_command_type === 'last') await this.command(true);
                    resolve(this.real_rgb_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.real_rgb_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('real_rgb_state', onState);
            });
        }
    }
    async color_temp_command(data) {
        if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.color_temp_command', { data });
        if (!this.config.color_temp_command_topic) throw new Error('Not settable');
        const color_temp_command_template  = this.config.color_temp_command_template;

        if (this.config.on_command_type === 'first') await this.command(true);

        this.mqttConnection.publish(this.config.color_temp_command_topic, color_temp_command_template ? this.apply_template(color_temp_command_template, { value: data }) : data);

        if (this.color_temp_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.color_temp_command', { optimistic: true });
            setTimeout(() => {
                if (this.color_temp_state !== null) this.emit('color_temp_state', this.color_temp_state);
                if (this.color_temp_percent !== null) this.emit('color_temp_percent', this.color_temp_percent);
            }, 1000);

            if (this.config.on_command_type === 'last') await this.command(true);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.color_temp_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('color_temp_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.color_temp_command.onState');
                    detach();
                    if (this.config.on_command_type === 'last') await this.command(true);
                    resolve(this.color_temp_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.color_temp_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('color_temp_state', onState);
            });
        }
    }
    async color_temp_percent_command(data) {
        const min_mireds = this.config.min_mireds;
        const max_mireds = this.config.max_mireds;

        await this.color_temp_command(Math.min(
            Math.max(
                Math.round(data * (max_mireds - min_mireds) / 100 + min_mireds),
                min_mireds
            ),
            max_mireds
        ));

        return this.color_temp_percent !== null ? this.color_temp_percent : data;
    }
    async effect_command(data) {
        if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.effect_command', { data });
        const effect_list = this.config.effect_list;

        if (!this.config.effect_command_topic) throw new Error('Not settable');
        if (!effect_list.includes(data)) throw new Error(`Wrong effect ${data}`);

        if (this.config.on_command_type === 'first') await this.command(true);

        this.mqttConnection.publish(this.config.effect_command_topic, data);

        if (this.effect_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.effect_command', { optimistic: true });
            setTimeout(() => {
                if (this.effect_state !== null) this.emit('effect_state', this.effect_state);
            }, 1000);

            if (this.config.on_command_type === 'last') await this.command(true);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.effect_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('effect_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.effect_command.onState');
                    detach();
                    if (this.config.on_command_type === 'last') await this.command(true);
                    resolve(this.effect_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.effect_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('effect_state', onState);
            });
        }
    }
    async white_value_command(data) {
        if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.white_value_command', { data });
        const white_value_command_topic  = this.config.white_value_command_topic;

        if (!white_value_command_topic) throw new Error('Not settable');

        if (this.config.on_command_type === 'first') await this.command(true);

        this.mqttConnection.publish(white_value_command_topic, `${data}`);

        if (this.white_value_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.white_value_command', { optimistic: true });
            setTimeout(() => {
                if (this.white_value_state !== null) this.emit('white_value_state', this.white_value_state);
                if (this.white_value_percent !== null) this.emit('white_value_percent', this.white_value_percent);
            }, 1000);

            if (this.config.on_command_type === 'last') await this.command(true);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.white_value_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('white_value_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.white_value_command.onState');
                    detach();
                    if (this.config.on_command_type === 'last') await this.command(true);
                    resolve(this.white_value_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantDefaultLightComponent.white_value_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('white_value_state', onState);
            });
        }
    }
    async white_value_percent_command(data) {
        const white_value_scale = this.config.white_value_scale;

        await this.white_value_command(Math.min(
            Math.max(
                Math.round(data * white_value_scale / 100),
                0
            ),
            white_value_scale
        ));

        return this.white_value_percent !== null ? this.white_value_percent : data;
    }
}

module.exports = HomeAssistantDefaultLightComponent;
