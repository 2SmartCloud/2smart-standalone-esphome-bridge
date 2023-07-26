/* eslint-disable no-param-reassign */
/* eslint-disable more/no-duplicated-chains */
const events = require('events');
const abbreviations = require('../utils/abbreviations');
const nunjucks = require('../utils/nunjucks');


const DOMAINS = [
    // 'alarm_control_panel',
    'binary_sensor',
    'cover',
    // 'camera',
    'device_automation',
    'fan',
    'climate',
    'light',
    'lock',
    'sensor',
    'switch'// ,
    // 'tag',
    // 'vacuum'
];

class HomeAssistantComponent extends events {
    constructor(config, { mqttConnection, allStates, debug, domain, node_id, object_id }) {
        super();
        this.config = config;
        this.mqttConnection = mqttConnection;
        this.allStates = allStates;
        this.debug = debug;
        this.domain = domain;
        this.node_id = node_id;
        this.object_id = object_id;
        this.state = {
            state        : null,
            entity_id    : null,
            domain       : null,
            object_id    : null,
            name         : null,
            last_updated : null,
            last_changed : null,
            attributes   : {}
        };
        this.handlers = [];

        this.state.domain = domain;
        this.state.object_id = `${node_id ? `${node_id}--` : ''}${object_id}`;
        this.state.entity_id = `${this.state.domain}.${this.state.object_id}`;
    }
    init() {

    }
    destroy() {
        for (const { detach } of this.handlers) detach();
    }
    apply_template(template, data) {
        return nunjucks.renderString(template, {
            states        : this.allStates.states,
            is_state      : this.allStates.is_state,
            state_attr    : this.allStates.state_attr,
            is_state_attr : this.allStates.is_state_attr,
            ...data
        });
    }
    static DOMAINS = DOMAINS;
    static create = function create(domain, config, options) {
        if (this && this !== HomeAssistantComponent) {
            options = config;
            config = domain;

            return new this(config, options);
        }
        if (!DOMAINS.includes(domain)) throw new Error('Unsuupported domain');
        const ComponentClass = require(`./${domain}`);

        return ComponentClass.create(abbreviations.apply(config), options);
    }
}

module.exports = HomeAssistantComponent;
