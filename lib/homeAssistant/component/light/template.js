/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
const _ = require('underscore');
const colorsys = require('colorsys');
const HomeAssistantLightComponent = require('./index');

/*
https://www.home-assistant.io/integrations/light.mqtt/
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
class HomeAssistantTemplateComponent extends HomeAssistantLightComponent {
    constructor(config, { mqttConnection, allStates, debug, node_id, object_id }) {
        _.defaults(config, {
            name       : 'MQTT Template Light',
            qos        : 0,
            min_mireds : 153,
            max_mireds : 500
        });

        // eslint-disable-next-line no-param-reassign
        if (typeof config.effect_list === 'string') config.effect_list = config.effect_list.split(',');


        if (!config.command_topic) throw new Error('command_topic is required');
        if (!config.command_on_template) throw new Error('command_on_template is required');
        if (!config.command_off_template) throw new Error('command_off_template is required');

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
            const state_template = this.config.state_template;
            const brightness_template = this.config.brightness_template;
            const red_template = this.config.red_template;
            const green_template = this.config.green_template;
            const blue_template = this.config.blue_template;
            const color_temp_template = this.config.color_temp_template;
            const effect_template = this.config.effect_template;
            const white_value_template = this.config.white_value_template;

            const handler = (value) => {
                try {
                    let value_json = null;

                    try {
                        value_json = JSON.parse(value);
                        // eslint-disable-next-line no-empty
                    } catch (e) {}

                    if (state_template) {
                        const result = this.apply_template(state_template, { value, value_json });
                        const payload_on = 'on';
                        const payload_off = 'off';

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
                    if (brightness_template) {
                        const brightness_state = parseInt(this.apply_template(brightness_template, { value, value_json }), 10);
                        const brightness_scale = 255;

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
                    if (red_template && green_template && blue_template) {
                        const r = parseInt(this.apply_template(red_template, { value, value_json }), 10);
                        const g = parseInt(this.apply_template(green_template, { value, value_json }), 10);
                        const b = parseInt(this.apply_template(blue_template, { value, value_json }), 10);

                        // eslint-disable-next-line prefer-const
                        let { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });


                        if (brightness_template) v = this.brightness_percent === null ? 100 : this.brightness_percent;
                        else this.brightness_percent = v;

                        const { r: rr, g: rg, b: rb  } = colorsys.hsv_to_rgb({ h, s, v });

                        this.rgb_state = `${r},${g},${b}`;
                        this.real_rgb_state = `${rr},${rg},${rb}`;

                        if (!brightness_template) this.emit('brightness_percent', this.brightness_percent);
                        this.emit('rgb_state', this.rgb_state);
                        this.emit('real_rgb_state', this.real_rgb_state);
                    }
                    if (color_temp_template) {
                        const color_temp_state = parseInt(this.apply_template(color_temp_template, { value, value_json }), 10);
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
                    if (effect_template) {
                        const effect_state = this.apply_template(effect_template, { value, value_json });
                        const effect_list = this.config.effect_list;

                        if (!effect_list.includes(effect_state)) throw new Error(`Bad effect received ${effect_state}`);

                        this.effect_state = effect_state;

                        this.emit('effect_state', this.effect_state);
                    }
                    if (white_value_template) {
                        const white_value_state = parseInt(this.apply_template(white_value_template, { value, value_json }), 10);
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
        const to_send = data ? this.apply_template(this.config.command_on_template, { state: 'on' })
            : this.apply_template(this.config.command_on_template, { state: 'off' });

        this.mqttConnection.publish(this.config.command_topic, to_send);
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
        if (!this.config.brightness_template) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, this.apply_template(this.config.command_on_template, { state: 'on', brightness: data }));

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
        if (this.config.brightness_template) {
            const brightness_scale = 255;

            await this.brightness_command(Math.round(data * brightness_scale / 100));
        } else if (this.config.red_template && this.config.green_template && this.config.blue_template) {
            const [ r, g, b ] = (this.real_rgb_state || '255,255,255').split(',').map(n => parseInt(n, 10));
            const { h, s } = colorsys.rgb_to_hsv({ r, g, b });
            const { r: nr, g: ng, b: nb } = colorsys.rgb_to_hsv({ h, s, v: data });

            await this.real_rgb_command(`${nr},${ng},${nb}`);
        }

        return this.brightness_percent !== null ? this.brightness_percent : data;
    }
    async real_rgb_command(rgb) {
        if (!this.config.red_template || !this.config.green_template || !this.config.blue_template) throw new Error('Not settable');

        const [ r, g, b ] = rgb.split(',').map(n => parseInt(n, 10));
        const { h, s, v } = colorsys.rgb_to_hsv({ r, g, b });
        const { r: nr, g: ng, b: nb } = colorsys.hsv_to_rgb({ h, s, v });

        let payload = { state: 'on' };

        if (this.config.brightness_template) payload = { ...payload, brightness: Math.round(v * 255 / 100) };
        const [ red, green, blue ] = this.config.brightness_template ? [ nr, ng, nb ] : [ r, g, b ];

        payload = { ...payload, red, green, blue };

        this.mqttConnection.publish(this.config.command_topic, this.apply_template(this.config.command_on_template, payload));
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
        if (!this.config.color_temp_template) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, this.apply_template(this.config.command_on_template, { state: 'on', color_temp: data }));

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

        if (!this.config.effect_template) throw new Error('Not settable');
        if (!effect_list.includes(data)) throw new Error(`Wrong effect ${data}`);

        this.mqttConnection.publish(this.config.command_topic, this.apply_template(this.config.command_on_template, { state: 'on', effect: data }));

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
        if (!this.config.white_value_template) throw new Error('Not settable');

        this.mqttConnection.publish(this.config.command_topic, this.apply_template(this.config.command_on_template, { state: 'on', white_value: data }));

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

module.exports = HomeAssistantTemplateComponent;
