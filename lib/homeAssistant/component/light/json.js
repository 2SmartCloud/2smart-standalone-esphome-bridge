/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const colorsys = require('colorsys');
const convertcolors = require('@csstools/convert-colors');
const HomeAssistantLightComponent = require('./index');

/*
https://www.home-assistant.io/integrations/light.mqtt/
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
*/
class HomeAssistantJSONLightComponent extends HomeAssistantLightComponent {
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
            brightness       : false,
            brightness_scale : 255,
            color_temp       : false,
            effect           : false,
            name             : 'MQTT JSON Light',
            qos              : 0,
            retain           : false,
            rgb              : false,
            min_mireds       : 153,
            max_mireds       : 500,
            white_value      : false,
            xy               : false
        });

        // eslint-disable-next-line no-param-reassign
        if (typeof config.effect_list === 'string') config.effect_list = config.effect_list.split(',');

        if (!config.command_topic) throw new Error('command_topic is required');

        super(config, { mqttConnection, allStates, debug, domain: 'light', node_id, object_id });

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

            const handler = (value) => {
                try {
                    const value_json = JSON.parse(value);

                    if (value_json.state !== undefined) {
                        const result = value_json.state;
                        const payload_on = 'ON';
                        const payload_off = 'OFF';

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
                    }
                    if (this.config.brightness && value_json.brightness !== undefined) {
                        const brightness_state = value_json.brightness;
                        const brightness_scale = this.config.brightness_scale;

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
                    }
                    if (value_json.color) {
                        const color = value_json.color;

                        if (this.config.hs && color.h !== undefined && color.s !== undefined) {
                            const { h, s } = color;

                            const v = this.config.brightness && this.brightness_percent !== null ? this.brightness_percent : 100;

                            const { r: rr, g: rg, b: rb  } = colorsys.hsv_to_rgb({ h, s, v });

                            this.hs_state = `${h.toFixed(1)},${s.toFixed(1)}`;
                            this.real_rgb_state = `${rr},${rg},${rb}`;

                            this.emit('hs_state', this.hs_state);
                            this.emit('real_rgb_state', this.real_rgb_state);
                        }
                        if (this.config.xy && color.x !== undefined && color.y !== undefined) {
                            const { x, y } = color;

                            const z = this.config.brightness && this.brightness_percent !== null ? this.brightness_percent : 100;

                            const [ rr, rg, rb  ] = convertcolors.xyz2rgb(x, y, z);

                            this.xy_state = `${x.toFixed(3)},${y.toFixed(3)}`;
                            this.real_rgb_state = `${rr},${rg},${rb}`;

                            this.emit('xy_state', this.xy_state);
                            this.emit('real_rgb_state', this.real_rgb_state);
                        }
                        if (this.config.rgb && color.r !== undefined && color.g !== undefined && color.b !== undefined) {
                            const { r, g, b } = color;

                            // eslint-disable-next-line prefer-const
                            let { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });

                            if (this.config.brightness) v = this.brightness_percent === null ? 100 : this.brightness_percent;
                            else this.brightness_percent = v;

                            const { r: rr, g: rg, b: rb  } = colorsys.hsv_to_rgb({ h, s, v });

                            this.rgb_state = `${r},${g},${b}`;
                            this.real_rgb_state = `${rr},${rg},${rb}`;

                            if (!this.config.brightness) this.emit('brightness_percent', this.brightness_percent);
                            this.emit('rgb_state', this.rgb_state);
                            this.emit('real_rgb_state', this.real_rgb_state);
                        }

                        this.emit('color_state', this.color);
                    }
                    if (this.config.color_temp && value_json.color_temp !== undefined) {
                        const color_temp_state = value_json.color_temp;
                        const min_mireds = this.config.min_mireds;
                        const max_mireds = this.config.max_mireds;

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
                    }
                    if (this.config.effect && value_json.effect !== undefined) {
                        const effect_state = value_json.effect;
                        const effect_list = this.config.effect_list;

                        if (!effect_list.includes(effect_state)) throw new Error(`Bad effect received ${effect_state}`);

                        this.effect_state = effect_state;

                        this.emit('effect_state', this.effect_state);
                    }
                    if (this.config.white_value && value_json.white_value !== undefined) {
                        const white_value_state = value_json.white_value;
                        const white_value_scale = 255;

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
                    }
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
    async command(data) {
        if (this.debug) this.debug.info('HomeAssistantSwitchComponent.command', { data });
        this.mqttConnection.publish(this.config.command_topic, JSON.stringify({ state: data ? 'ON' : 'OFF' }));
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
        if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.brightness_command', { data });
        if (!this.config.brightness) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, JSON.stringify({ state: 'ON', brightness: data }));

        if (this.brightness_percent === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.brightness_command', { optimistic: true });
            setTimeout(() => {
                if (this.brightness_state !== null) this.emit('brightness_state', this.brightness_state);
                if (this.brightness_percent !== null) this.emit('brightness_percent', this.brightness_percent);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.brightness_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('brightness_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.brightness_command.onState');
                    detach();
                    resolve(this.brightness_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.brightness_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('brightness_state', onState);
            });
        }
    }
    async brightness_percent_command(data) {
        if (this.config.brightness) {
            const brightness_scale = this.config.brightness_scale;

            await this.brightness_command(Math.round(data * brightness_scale / 100));
        } else if (this.config.rgb) {
            const [ r, g, b ] = (this.real_rgb_state || '255,255,255').split(',').map(n => parseInt(n, 10));
            const { h, s } = colorsys.rgb_to_hsv({ r, g, b });
            const { r: nr, g: ng, b: nb } = colorsys.rgb_to_hsv({ h, s, v: data });

            await this.real_rgb_command(`${nr},${ng},${nb}`);
        }

        return this.brightness_percent !== null ? this.brightness_percent : data;
    }
    async real_rgb_command(rgb) {
        if (!this.config.rgb && !this.config.hs && !this.config.xy) throw new Error('Not settable');

        const [ r, g, b ] = rgb.split(',').map(n => parseInt(n, 10));
        const { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });
        const [ x, y ] = convertcolors.rgb2xyz(r, g, b);
        const { r: nr, g: ng, b: nb } = colorsys.hsv_to_rgb({ h, s, v });

        let payload = { state: 'ON', color: {} };

        if (this.config.brightness) payload = { ...payload, brightness: Math.round(v * 255 / 100) };
        if (this.config.rgb) {
            const [ red, green, blue ] = this.config.brightness ? [ nr, ng, nb ] : [ r, g, b ];

            payload.color = { ...payload.color, r: red, g: green, b: blue };
        }
        if (this.config.hs) {
            payload.color = { ...payload.color, h, s };
        }
        if (this.config.xy) {
            payload.color = { ...payload.color, x, y };
        }
        this.mqttConnection.publish(this.config.command_topic, JSON.stringify(payload));
        if (this.real_rgb_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.real_rgb_command', { optimistic: true });
            setTimeout(() => {
                if (this.real_rgb_state !== null) this.emit('real_rgb_state', this.real_rgb_state);
            }, 1000);

            return rgb;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.real_rgb_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('real_rgb_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.real_rgb_command.onState');
                    detach();
                    resolve(this.real_rgb_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.real_rgb_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('real_rgb_state', onState);
            });
        }
    }
    async color_temp_command(data) {
        if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.color_temp_command', { data });
        if (!this.config.color_temp) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, JSON.stringify({ state: 'ON', color_temp: data }));

        if (this.color_temp_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.color_temp_command', { optimistic: true });
            setTimeout(() => {
                if (this.color_temp_state !== null) this.emit('color_temp_state', this.color_temp_state);
                if (this.color_temp_percent !== null) this.emit('color_temp_percent', this.color_temp_percent);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.color_temp_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('color_temp_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.color_temp_command.onState');
                    detach();
                    resolve(this.color_temp_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.color_temp_command.timeout');
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
        if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.effect_command', { data });
        const effect_list = this.config.effect_list;

        if (!this.config.effect) throw new Error('Not settable');
        if (!effect_list.includes(data)) throw new Error(`Wrong effect ${data}`);

        this.mqttConnection.publish(this.config.command_topic, JSON.stringify({ state: 'ON', effect: data }));

        if (this.effect_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.effect_command', { optimistic: true });
            setTimeout(() => {
                if (this.effect_state !== null) this.emit('effect_state', this.effect_state);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.effect_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('effect_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.effect_command.onState');
                    detach();
                    resolve(this.effect_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.effect_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('effect_state', onState);
            });
        }
    }
    async white_value_command(data) {
        if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.white_value_command', { data });
        if (!this.config.white_value) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, JSON.stringify({ state: 'ON', white_value: data }));

        if (this.white_value_state === null || this.config.optimistic) {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.white_value_command', { optimistic: true });
            setTimeout(() => {
                if (this.white_value_state !== null) this.emit('white_value_state', this.white_value_state);
                if (this.white_value_percent !== null) this.emit('white_value_percent', this.white_value_percent);
            }, 1000);

            return data;
            // eslint-disable-next-line no-else-return
        } else {
            if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.white_value_command', { optimistic: false });

            return new Promise((resolve, reject) => {
                const detach = () => {
                    clearTimeout(timeout);
                    this.off('white_value_state', onState);
                };
                const onState = async () => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.white_value_command.onState');
                    detach();
                    resolve(this.white_value_state);
                };
                const timeout = setTimeout(() => {
                    if (this.debug) this.debug.info('HomeAssistantJSONLightComponent.white_value_command.timeout');
                    detach();
                    reject(new Error('Timeout'));
                }, 5000);

                this.once('white_value_state', onState);
            });
        }
    }
    async white_value_percent_command(data) {
        const white_value_scale = 255;

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

module.exports = HomeAssistantJSONLightComponent;
