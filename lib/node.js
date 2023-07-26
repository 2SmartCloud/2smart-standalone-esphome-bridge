/* eslint-disable max-len */
/* eslint-disable more/no-duplicated-chains */
/* eslint-disable no-cond-assign */
const BaseNodeBridge = require('homie-sdk/lib/Bridge/BaseNode');
const { createHash } = require('./utils');
const PropertyBridge = require('./property');
const { create: createTransport } = require('./transport');
const { create: createParser } = require('./parser');

class NodeBridge extends BaseNodeBridge {
    constructor(config, { debug } = {}) {
        super(config, { debug });
        this.handleAvalable = this.handleAvalable.bind(this);
        this.homeAssistantComponents = [];
    }
    // sync
    setComponent(component) {
        if (this.debug) this.debug.info('NodeBridge.setComponent', { entity_id: component.state.entity_id });
        if (this.homeAssistantComponents.includes(component)) throw new Error('Component already exists');
        this.homeAssistantComponents.push(component);
        if (component.config.availability || component.config.availability_topic) {
            component.on('available', this.handleAvalable);
            if (component.available !== null) this.handleAvalable(component.available);
        } else {
            this.handleAvalable(true);
        }

        if (component.config.device.sw_version) {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash('device.w_version'),
                name     : 'sw version',
                value    : component.config.device.sw_version,
                dataType : 'string',
                settable : false,
                retained : true,
                unit     : ''
            }, { type: 'telemetry', component });
        }
        if (component.config.device.model) {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash('device.model'),
                name     : 'Model',
                value    : component.config.device.model,
                dataType : 'string',
                settable : false,
                retained : true,
                unit     : ''
            }, { type: 'telemetry', component });
        }
        if (component.config.device.manufacturer) {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash('device.manufacturer'),
                name     : 'Manufacturer',
                value    : component.config.device.manufacturer,
                dataType : 'string',
                settable : false,
                retained : true,
                unit     : ''
            }, { type: 'telemetry', component });
        }
        if (component.state.domain === 'sensor') {
            if (typeof component.config.unique_id === 'string' && component.config.unique_id.endsWith('-wifisignal')) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : 'signal',
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'float',
                    settable : false,
                    retained : true,
                    // unit     : component.state.attributes.unit_of_measurement
                    unit     : '%'
                }, {
                    type   : 'telemetry',
                    parser : createParser({
                        type          : 'custom',
                        homieDataType : 'integer',
                        fromHomie(data) {
                            const result = parseInt(data, 10);

                            if (isNaN(result)) throw new Error('Wrong format');

                            return [ Math.round(result / 2 - 100) ];
                        },
                        toHomie(data) {
                            const result = parseInt(data, 10);

                            if (isNaN(result)) throw new Error('Wrong format');

                            return [ Math.max(Math.min(2 * (result + 100), 100), 0) ];
                        }
                    }),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.state.state,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            } else if (typeof component.config.unique_id === 'string' && (
                component.config.unique_id.endsWith('-version')
                || component.config.unique_id.endsWith('-wifiinfo-ip')
                || component.config.unique_id.endsWith('-wifiinfo-ssid')
                || component.config.unique_id.endsWith('-wifiinfo-bssid')
                || component.config.unique_id.endsWith('-wifiinfo-macadr')
            )) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}`),
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'string',
                    settable : false,
                    retained : true,
                    unit     : component.state.attributes.unit_of_measurement || ''
                }, {
                    type      : 'telemetry',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.state.state,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            } else {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}`),
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'float',
                    settable : false,
                    retained : true,
                    unit     : component.state.attributes.unit_of_measurement || ''
                }, {
                    type      : 'sensor',
                    parser    : createParser('float'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.state.state,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
        } else if (component.state.domain === 'switch') {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}`),
                name     : component.state.attributes.friendly_name || component.state.attributes.name,
                dataType : 'boolean',
                settable : !!component.config.command_topic,
                retained : true
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : component.stateOn || false,
                    methods : {
                        async set(data) {
                            const result = await component.command(data);

                            this.handleNewData(result);

                            return result;
                        }
                    },
                    attachBridge() {
                        component.on('stateOn', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('stateOn', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
        } else if (component.state.domain === 'device_automation') {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}`),
                name     : `Trigger ${component.config.type}(${component.config.subtype})`,
                dataType : 'string',
                settable : false,
                retained : false
            }, {
                type      : 'sensor',
                transport : createTransport({
                    type    : 'custom',
                    methods : {
                        async set() {
                            throw new Error('Property is not settable');
                        }
                    },
                    attachBridge() {
                        component.on('triggered', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('triggered', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
        } else if (component.state.domain === 'binary_sensor') {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}`),
                name     : component.state.attributes.friendly_name || component.state.attributes.name,
                dataType : 'boolean',
                settable : false,
                retained : true
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : component.stateOn || false,
                    methods : {
                        async set() {
                            throw new Error('Property is not settable');
                        }
                    },
                    attachBridge() {
                        component.on('stateOn', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('stateOn', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
        } else if (component.state.domain === 'lock') {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}`),
                name     : component.state.attributes.friendly_name || component.state.attributes.name,
                dataType : 'boolean',
                settable : !!component.config.command_topic,
                retained : true
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : component.locked || false,
                    methods : {
                        async set(data) {
                            const result = await component.command(data);

                            this.handleNewData(result);

                            return result;
                        }
                    },
                    attachBridge() {
                        component.on('locked', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('locked', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
        } else if (component.state.domain === 'climate') {
            if (component.config.action_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.action`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Action`,
                    dataType : 'string',
                    settable : false,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.action || undefined,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('action', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('action', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.aux_state_topic || component.config.aux_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.aux`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Auxiliary heat`,
                    dataType : 'boolean',
                    settable : !!component.config.aux_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.auxOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.aux_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('auxOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('auxOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.current_temperature_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.current_temperature`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Current temperature`,
                    dataType : 'float',
                    unit     : `°${component.config.temperature_unit}`,
                    settable : false,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('float'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.current_temperature || undefined,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('current_temperature', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('current_temperature', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.away_mode_state_topic || component.config.away_mode_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.away_mode`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Away Mode`,
                    dataType : 'boolean',
                    settable : !!component.config.away_mode_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.awayModeOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.away_mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('awayModeOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('awayModeOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.fan_mode_state_topic || component.config.fan_mode_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.fan_mode`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Fan Mode`,
                    dataType : 'enum',
                    format   : component.config.fan_modes.join(','),
                    settable : !!component.config.fan_mode_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.fan_mode_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.fan_mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('fan_mode_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('fan_mode_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.fan_mode_state_topic || component.config.fan_mode_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.fan_mode`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Fan Mode`,
                    dataType : 'enum',
                    format   : component.config.fan_modes.join(','),
                    settable : !!component.config.fan_mode_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.fan_mode_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.fan_mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('fan_mode_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('fan_mode_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if ((component.config.hold_state_topic && component.config.hold_modes)
                || component.config.hold_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.hold`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Hold Mode`,
                    dataType : 'enum',
                    format   : component.config.hold_modes.join(','),
                    settable : !!component.config.hold_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.hold_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.hold_mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('hold_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('hold_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.mode_state_topic || component.config.mode_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.mode`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Mode`,
                    dataType : 'enum',
                    format   : component.config.modes.join(','),
                    settable : !!component.config.mode_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.mode_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('mode_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('mode_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.swing_mode_state_topic || component.config.swing_mode_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.swing_mode`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Swing Mode`,
                    dataType : 'enum',
                    format   : component.config.swing_modes.join(','),
                    settable : !!component.config.swing_mode_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.swing_mode_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.swing_mode_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('swing_mode_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('swing_mode_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.temperature_high_command_topic || component.config.temperature_high_state_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.temperature_high_state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Temperature High State`,
                    dataType : 'float',
                    unit     : `°${component.config.temperature_unit}`,
                    settable : !!component.config.temperature_high_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.temperature_high_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.temperature_high_state_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('temperature_high_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('temperature_high_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.temperature_low_command_topic || component.config.temperature_low_state_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.temperature_low_state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Temperature Low State`,
                    dataType : 'float',
                    unit     : `°${component.config.temperature_unit}`,
                    settable : !!component.config.temperature_low_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.temperature_low_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.temperature_low_state_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('temperature_low_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('temperature_low_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.temperature_command_topic || component.config.temperature_state_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.temperature_state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Setpoint`,
                    dataType : 'float',
                    unit     : `°${component.config.temperature_unit}`,
                    settable : !!component.config.temperature_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.temperature_state || component.config.initial,
                        methods : {
                            async set(data) {
                                const result = await component.temperature_state_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('temperature_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('temperature_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
        } else if (component.state.domain === 'fan') {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}.state`),
                name     : `${component.state.attributes.friendly_name || component.state.attributes.name} State`,
                dataType : 'boolean',
                settable : !!component.config.command_topic,
                retained : true
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : component.stateOn || false,
                    methods : {
                        async set(data) {
                            const result = await component.command(data);

                            this.handleNewData(result);

                            return result;
                        }
                    },
                    attachBridge() {
                        component.on('stateOn', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('stateOn', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
            if (component.config.speed_state_topic || component.config.speed_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.speed_state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Speed`,
                    dataType : 'enum',
                    format   : component.config.speeds.join(','),
                    settable : !!component.config.speed_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.speed_state || undefined,
                        methods : {
                            async set(data) {
                                const result = await component.speed_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('speed_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('speed_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.oscillation_state_topic || component.config.oscillation_command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.oscillation_state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Oscillation`,
                    dataType : 'boolean',
                    settable : !!component.config.oscillation_command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.oscillationOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.oscillation_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('oscillationOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('oscillationOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
        } else if (component.state.domain === 'cover') {
            if (component.config.position_topic || component.config.set_position_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.position`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Position`,
                    dataType : 'integer',
                    settable : !!component.config.set_position_topic,
                    retained : true,
                    unit     : '%'
                }, {
                    type      : 'sensor',
                    parser    : createParser('integer'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.position || 0,
                        methods : {
                            async set(data) {
                                const result = await component.set_position_command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('position', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('position', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            } else if (component.config.state_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.state`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} State`,
                    dataType : 'string',
                    settable : false,
                    retained : true
                }, {
                    type      : 'sensor',
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.real_state || false,
                        methods : {
                            async set() {
                                throw new Error('Property is not settable');
                            }
                        },
                        attachBridge() {
                            component.on('real_state', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('real_state', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            if (component.config.command_topic) {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}.open_command`),
                    name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Open`,
                    dataType : 'boolean',
                    settable : true,
                    retained : false
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : false,
                        methods : {
                            async set() {
                                await component.open_command();

                                this.handleNewData(true);

                                return true;
                            }
                        }
                    }),
                    homeAssistantComponent : component
                });
            }
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}.close_command`),
                name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Close`,
                dataType : 'boolean',
                settable : true,
                retained : false
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : false,
                    methods : {
                        async set() {
                            await component.close_command();

                            this.handleNewData(true);

                            return true;
                        }
                    }
                }),
                homeAssistantComponent : component
            });
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}.stop_command`),
                name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Stop`,
                dataType : 'boolean',
                settable : true,
                retained : false
            }, {
                type      : 'sensor',
                parser    : createParser('boolean'),
                transport : createTransport({
                    type    : 'custom',
                    data    : false,
                    methods : {
                        async set() {
                            await component.stop_command();

                            this.handleNewData(true);

                            return true;
                        }
                    }
                }),
                homeAssistantComponent : component
            });
        }
        if (component.config.tilt_status_topic || component.config.tilt_command_topic) {
            this.createOrUpdateHomeAssistantProperty({
                id       : createHash(`entity_id.${component.state.entity_id}.tilt`),
                name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Tilt`,
                dataType : 'integer',
                settable : !!component.config.tilt_command_topic,
                retained : true,
                unit     : '%'
            }, {
                type      : 'sensor',
                parser    : createParser('integer'),
                transport : createTransport({
                    type    : 'custom',
                    data    : component.tilt || 0,
                    methods : {
                        async set(data) {
                            const result = await component.tilt_command(data);

                            this.handleNewData(result);

                            return result;
                        }
                    },
                    attachBridge() {
                        component.on('tilt', this.handleNewData);
                    },
                    detachBridge() {
                        component.off('tilt', this.handleNewData);
                    }
                }),
                homeAssistantComponent : component
            });
        } else if (component.state.domain === 'light') {
            if (component.config.schema === 'default') {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}`),
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'boolean',
                    settable : !!component.config.command_topic,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.stateOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('stateOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('stateOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
                if (component.config.brightness_state_topic || component.config.brightness_command_topic || component.config.rgb_state_topic || component.config.rgb_command_topic) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.brightness_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Brightness`,
                        dataType : 'integer',
                        settable : !!(component.config.brightness_command_topic || component.config.rgb_command_topic),
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.brightness || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.brightness_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('brightness_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('brightness_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.hs_state_topic || component.config.hs_command_topic || component.config.xy_state_topic || component.config.xy_command_topic || component.config.rgb_state_topic || component.config.rgb_command_topic) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.real_rgb_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color`,
                        dataType : 'color',
                        format   : 'rgb',
                        settable : !!(component.config.hs_command_topic && component.config.xy_command_topic && component.config.rgb_command_topic),
                        retained : true,
                        unit     : ''
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.real_rgb_state || '255,255,255',
                            methods : {
                                async set(data) {
                                    const result = await component.real_rgb_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('real_rgb_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('real_rgb_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.color_temp_state_topic || component.config.color_temp_command_topic) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.color_temp_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color Temp`,
                        dataType : 'integer',
                        settable : !!component.config.color_temp_command_topic,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.color_temp_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.color_temp_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('color_temp_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('color_temp_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.effect_list && component.config.effect_list.length && (component.config.effect_state_topic || component.config.effect_command_topic)) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.effect_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Effect`,
                        dataType : 'enum',
                        format   : component.config.effect_list.join(','),
                        settable : !!component.config.effect_command_topic,
                        retained : true
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.effect_state || undefined,
                            methods : {
                                async set(data) {
                                    const result = await component.effect_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('effect_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('effect_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.white_value_state_topic || component.config.white_value_command_topic) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.white_value_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} White Value`,
                        dataType : 'integer',
                        settable : !!component.config.white_value_command_topic,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.white_value_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.white_value_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('white_value_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('white_value_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
            } else if (component.config.schema === 'json') {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}`),
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'boolean',
                    settable : true,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.stateOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('stateOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('stateOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
                if (component.config.brightness || component.config.rgb) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.brightness_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Brightness`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.brightness || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.brightness_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('brightness_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('brightness_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.hs || component.config.xy || component.config.rgb) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.real_rgb_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color`,
                        dataType : 'color',
                        format   : 'rgb',
                        settable : true,
                        retained : true,
                        unit     : ''
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.real_rgb_state || '255,255,255',
                            methods : {
                                async set(data) {
                                    const result = await component.real_rgb_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('real_rgb_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('real_rgb_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.color_temp) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.color_temp_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color Temp`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.color_temp_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.color_temp_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('color_temp_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('color_temp_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.effect_list && component.config.effect_list.length && component.config.effect) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.effect_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Effect`,
                        dataType : 'enum',
                        format   : component.config.effect_list.join(','),
                        settable : true,
                        retained : true
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.effect_state || undefined,
                            methods : {
                                async set(data) {
                                    const result = await component.effect_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('effect_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('effect_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.white_value) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.white_value_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} White Value`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.white_value_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.white_value_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('white_value_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('white_value_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
            } else if (component.config.schema === 'template') {
                this.createOrUpdateHomeAssistantProperty({
                    id       : createHash(`entity_id.${component.state.entity_id}`),
                    name     : component.state.attributes.friendly_name || component.state.attributes.name,
                    dataType : 'boolean',
                    settable : true,
                    retained : true
                }, {
                    type      : 'sensor',
                    parser    : createParser('boolean'),
                    transport : createTransport({
                        type    : 'custom',
                        data    : component.stateOn || false,
                        methods : {
                            async set(data) {
                                const result = await component.command(data);

                                this.handleNewData(result);

                                return result;
                            }
                        },
                        attachBridge() {
                            component.on('stateOn', this.handleNewData);
                        },
                        detachBridge() {
                            component.off('stateOn', this.handleNewData);
                        }
                    }),
                    homeAssistantComponent : component
                });
                if (component.config.brightness_template || (component.config.red_template && component.config.green_template && component.config.blue_template)) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.brightness_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Brightness`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.brightness || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.brightness_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('brightness_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('brightness_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.red_template && component.config.green_template && component.config.blue_template) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.real_rgb_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color`,
                        dataType : 'color',
                        format   : 'rgb',
                        settable : true,
                        retained : true,
                        unit     : ''
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.real_rgb_state || '255,255,255',
                            methods : {
                                async set(data) {
                                    const result = await component.real_rgb_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('real_rgb_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('real_rgb_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.color_temp_template) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.color_temp_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Color Temp`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.color_temp_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.color_temp_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('color_temp_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('color_temp_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.effect_list && component.config.effect_list.length && component.config.effect_template) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.effect_state`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} Effect`,
                        dataType : 'enum',
                        format   : component.config.effect_list.join(','),
                        settable : true,
                        retained : true
                    }, {
                        type      : 'sensor',
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.effect_state || undefined,
                            methods : {
                                async set(data) {
                                    const result = await component.effect_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('effect_state', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('effect_state', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
                if (component.config.white_value_template) {
                    this.createOrUpdateHomeAssistantProperty({
                        id       : createHash(`entity_id.${component.state.entity_id}.white_value_percent`),
                        name     : `${component.state.attributes.friendly_name || component.state.attributes.name} White Value`,
                        dataType : 'integer',
                        settable : true,
                        retained : true,
                        unit     : '%'
                    }, {
                        type      : 'sensor',
                        parser    : createParser('integer'),
                        transport : createTransport({
                            type    : 'custom',
                            data    : component.white_value_percent || 0,
                            methods : {
                                async set(data) {
                                    const result = await component.white_value_percent_command(data);

                                    this.handleNewData(result);

                                    return result;
                                }
                            },
                            attachBridge() {
                                component.on('white_value_percent', this.handleNewData);
                            },
                            detachBridge() {
                                component.off('white_value_percent', this.handleNewData);
                            }
                        }),
                        homeAssistantComponent : component
                    });
                }
            }
        }
    }
    unsetComponent(component) {
        if (this.debug) this.debug.info('NodeBridge.unsetComponent', { entity_id: component.state.entity_id });
        const index = this.homeAssistantComponents.indexOf(component);

        if (index === -1) throw new Error('Component not exists');

        if (component.config.availability || component.config.availability_topic) {
            component.off('available', this.handleAvalable);
        }
        for (const p of this.sensors) if (p.homeAssistantComponent === component) this.removeSensor(p.id);
        for (const p of this.telemetry) if (p.homeAssistantComponent === component) this.removeTelemetry(p.id);
        for (const p of this.options) if (p.homeAssistantComponent === component) this.removeOption(p.id);
        this.homeAssistantComponents.splice(index, 1);

        // recalculate state
        for (const c of this.homeAssistantComponents) {
            if (c.config.availability || c.config.availability_topic) {
                if (c.available !== null) {
                    this.handleAvalable(c.available);
                    break;
                }
            }
        }
    }
    createOrUpdateHomeAssistantProperty({ id, ...config }, { type, parser, transport, homeAssistantComponent }) {
        if (this.debug) this.debug.info('NodeBridge.createOrUpdateHomeAssistantProperty', { id });

        let property;

        if (type === 'sensor') property = this.sensors.find(({ id: _id }) => _id === id);
        else if (type === 'telemetry') property = this.telemetry.find(({ id: _id }) => _id === id);
        else if (type === 'option') property = this.options.find(({ id: _id }) => _id === id);

        let homieProperty;

        if (property) {
            homieProperty = property.homieEntity;
            if (property.type === 'sensor') this.removeSensor(property.id);
            else if (property.type === 'option') this.removeOption(property.id);
            else if (property.type === 'telemetry') this.removeTelemetry(property.id);
            homieProperty.updateAttribute(config);
        } else {
            if (type === 'sensor') homieProperty = this.homieEntity.sensors.find((p) => p.id === id);
            else if (type === 'option') homieProperty = this.homieEntity.options.find((p) => p.id === id);
            else if (type === 'telemetry') homieProperty = this.homieEntity.telemetry.find((p) => p.id === id);
            if (homieProperty) homieProperty.updateAttribute(config);
            else homieProperty = { ...config, id };
        }

        property = new PropertyBridge(homieProperty, {
            type,
            parser,
            transport,
            homeAssistantComponent,
            debug : this.debug
        });

        if (type === 'sensor') this.addSensor(property);
        else if (type === 'option') this.addOption(property);
        else if (type === 'telemetry') this.addTelemetry(property);

        for (const k of Object.keys(config)) property.publishAttribute(k, config[k], true);

        return property;
    }
    // updatePropertyConfigWithData(propertyId, data) {
    //     const config = this.getPropertyConfig(propertyId);

    //     if (!config) return;
    //     if (typeof data === 'number' && config.dataType !== 'float') {
    //         config.dataType = 'float';
    //         this.savePropertyConfig(propertyId, config);
    //     }

    //     return config;
    // }
    // getPropertyConfig(propertyId) {
    //     if (!this.modelID) return;

    //     const config = config2smart.config.models;

    //     return config && config[this.modelID] && config[this.modelID][propertyId] || {};
    // }
    // savePropertyConfig(propertyId, propertyConfig) {
    //     let config = config2smart.config;

    //     config.models = config.models || {};

    //     config = config.models;
    //     config[this.modelID] = config[this.modelID] || {};

    //     config = config[this.modelID];
    //     config[propertyId] = propertyConfig;
    //     config2smart.set(`bridge.${this.device.id}.${this.id}.${propertyId}`);
    // }
    // async
    // handlers~
    async handleAvalable(available) {
        this.connected = available;
    }
}

NodeBridge.create = function create(config = {}, options) {
    const node = new NodeBridge(config, options);

    return node;
};

module.exports = NodeBridge;
