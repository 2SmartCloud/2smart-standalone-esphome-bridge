const events = require('events');
const _ = require('underscore');
const { config2smart } = require('../utils');
const { name2object_id } = require('./utils');
const Component = require('./component');

const { create: createComponent } = Component;

const { DOMAINS } = require('./component');

class HomeAssistantAllStates extends events {
    constructor({ debug, mqttConnection }) {
        super({ debug });
        this.handleErrorPropagate = this.handleErrorPropagate.bind(this);

        function states(entity_id) {
            const [ domain, object_id ] = entity_id.split('.');
            const dom = this[domain];

            if (!object_id) {
                // eslint-disable-next-line no-shadow
                return function d(object_id) {
                    return this[object_id];
                }.bind(dom);
            }

            return dom && dom[object_id] && dom[object_id].state;
        }
        function is_state(entity_id, state) {
            const [ domain, object_id ] = entity_id.split('.');
            const component = this[domain] && this[domain][object_id];

            if (!component) return false;

            return _.isEqual(component.state, state);
        }
        function state_attr(entity_id, attr) {
            const [ domain, object_id ] = entity_id.split('.');

            return this[domain] && this[domain][object_id] && this[domain][object_id].attributes[attr];
        }
        function is_state_attr(entity_id, attr, value) {
            const [ domain, object_id ] = entity_id.split('.');

            return _.isEqual(
                this[domain] && this[domain][object_id] && this[domain][object_id].attributes[attr],
                value
            );
        }

        this.states = states.bind(states);
        this.is_state = is_state.bind(states);
        this.state_attr = state_attr.bind(states);
        this.is_state_attr = is_state_attr.bind(states);
        for (const domain of DOMAINS) this.states[domain] = {};

        this.components = {};
        this.debug = debug;
        this.mqttConnection = mqttConnection;
    }

    getUniqueObjectIdForDomain({ domain, node_id, object_id, name }) {
        const id = `${domain}/${node_id ? `${node_id}/` : ''}${object_id}`;

        let state_object_id = config2smart.get(`componentObjectIdsMap.${id}`);

        if (state_object_id) return state_object_id;

        state_object_id = name2object_id(name);
        const dom = config2smart.config.reservedObjectIds[domain];

        if (!dom[object_id]) return object_id;
        let n = 2;

        while (dom[`${object_id}_${n}`]) n++;

        return `${object_id}_${n}`;
    }

    setComponent({ domain, node_id, object_id, config }) {
        this.removeComponent({ domain, node_id, object_id }, false);
        if (this.debug) this.debug.info('AllStates.setComponent', { domain, node_id, object_id, config });
        const id = `${domain}/${node_id ? `${node_id}/` : ''}${object_id}`;

        const component = createComponent(domain, config, {
            mqttConnection : this.mqttConnection, debug : this.debug, allStates : this, domain, node_id, object_id
        });

        // config2smart.set(`componentObjectIdsMap.${id}`, component.state.object_id);
        // config2smart.set(`reservedObjectIds.${component.state.entity_id}`, true);
        // eslint-disable-next-line max-len
        this.states[component.state.domain][component.state.object_id] = this.states[component.state.entity_id] = component.state;
        this.components[id] = component;
        this.emit('before.createComponent', component);
        component.on('error', this.handleErrorPropagate);
        component.init();
        this.emit('after.createComponent', component);
    }

    removeComponent({ domain, node_id, object_id }/* , clearConfig = true*/) {
        const id = `${domain}/${node_id ? `${node_id}/` : ''}${object_id}`;
        const component = this.components[id];

        if (component) {
            if (this.debug) this.debug.info('AllStates.removeComponent', { domain, node_id, object_id });
            this.emit('before.removeComponent', component);
            component.destroy();
            component.off('error', this.handleErrorPropagate);
            delete this.states[component.state.entity_id];
            delete this.states[component.state.domain][component.object_id];
            delete this.components[id];
            // if (clearConfig) {
            //     config2smart.del(`componentObjectIdsMap.${id}`);
            //     config2smart.del(`reservedObjectIds.${component.state.entity_id}`);
            // }
            this.emit('after.removeComponent', component);
        }
    }
    // handlers~
    async handleErrorPropagate(error) {
        this.emit('error', error);
    }
    // ~handlers
}
module.exports = HomeAssistantAllStates;
