const events = require('events');
const mqtt = require('mqtt');

class HomeAssistantMqttConnection extends events {
    constructor({ username, password, uri, rejectUnauthorized, discoveryPrefix, debug }) {
        super();
        this.handleMessage = this.handleMessage.bind(this);
        this.handleConnect = this.handleConnect.bind(this);
        this.handleReconnect = this.handleReconnect.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleEnd = this.handleEnd.bind(this);
        this.handleError = this.handleError.bind(this);

        this.mqttConfig = {
            username, password, uri, rejectUnauthorized, clean : true
        };
        this.discoveryPrefix = discoveryPrefix;
        this.topics = {};
        this.debug = debug;
        this.subscriptions = {};
    }
    init() {
        if (this.client) throw new Error('Cannot call init second time');
        this.client =  mqtt.connect(this.mqttConfig.uri, this.mqttConfig);
        this.subscribe(`${this.discoveryPrefix}/#`);
        this.client.on('message', this.handleMessage);
        this.client.on('connect', this.handleConnect);
        this.client.on('reconnect', this.handleReconnect);
        this.client.on('disconnect', this.handleDisconnect);
        this.client.on('end', this.handleEnd);
        this.client.on('error', this.handleError);
    }

    destroy() {
        if (this.client) this.client.end();
        this.client.off('message', this.handleMessage);
        this.client.off('connect', this.handleConnect);
        this.client.off('reconnect', this.handleReconnect);
        this.client.off('disconnect', this.handleDisconnect);
        this.client.off('end', this.handleEnd);
        this.client.off('error', this.handleError);
    }
    subscribe(topic) {
        if (this.subscriptions[topic]) {
            this.subscriptions[topic]++;
        } else {
            this.subscriptions[topic] = 1;
            this.client.subscribe(topic);
        }
    }
    unsubscribe(topic) {
        this.subscriptions[topic]--;
        if (!this.subscriptions[topic]) {
            delete this.subscriptions[topic];
            this.client.unsubscribe(topic);
            delete this.topics[topic];
        }
    }
    publish(...args) {
        this.client.publish(...args);
    }

    // handlers~
    async handleMessage(topic, message) {
        const discoveryRegexp = new RegExp(`^${this.discoveryPrefix}/(?<domain>[a-zA-Z0-9_-]+)/(?<node_id>[a-zA-Z0-9_-]+)?/(?<object_id>[a-zA-Z0-9_-]+)/config$`);

        try {
            // eslint-disable-next-line no-param-reassign
            message = message.toString();


            let regres = null;

            // eslint-disable-next-line no-cond-assign
            if (regres = discoveryRegexp.exec(topic)) {
                if (this.topics[topic] === message) return;

                if (message.length) this.topics[topic] = message;
                else delete this.topics[topic];

                const { domain, node_id, object_id } = regres.groups;

                if (message.length) {
                    const config = JSON.parse(message);

                    this.emit('discovery', {
                        domain, node_id, object_id, config
                    });
                } else {
                    this.emit('delete', {
                        domain, node_id, object_id
                    });
                }
            } else {
                if (message.length) this.topics[topic] = message;
                else delete this.topics[topic];

                this.emit(`message.${topic}`, message);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }
    async handleConnect() {
        if (this.debug) this.debug.info('HomeAssistantMqttConnection.handleConnect');
    }
    async handleReconnect() {
        if (this.debug) this.debug.info('HomeAssistantMqttConnection.handleReconnect');
    }
    async handleDisconnect() {
        if (this.debug) this.debug.info('HomeAssistantMqttConnection.handleDisconnect');
    }
    async handleEnd() {
        if (this.debug) this.debug.info('HomeAssistantMqttConnection.handleEnd');
    }
    async handleError(err) {
        this.emit('error', err);
    }
    // ~handlers
}
module.exports = HomeAssistantMqttConnection;
