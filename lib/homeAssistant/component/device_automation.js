/* eslint-disable more/no-duplicated-chains */
const HomeAssistantComponent = require('./index');


/*
https://www.home-assistant.io/integrations/device_trigger.mqtt/
config
{
    automation_type - should be equal to 'trigger'
    payload - string (optional)
    qos integer (optional, default: 0)
    topic  - string REQUIRED
    type - string REQUIRED
    subtype - string REQUIRED
    device - map(optional),
        connections - list (optional), ex. [["mac", "02:5b:26:a8:dc:12"]],
        identifiers - string | list (optional),
        manufacturer - string (optional),
        model - string (optional),
        name - string (optional),
        sw_version - string (optional),
        via_device string (optional)
}
*/
class HomeAssistantDeviceAutomationComponent extends HomeAssistantComponent {
    constructor(config, { mqttConnection, allStates, debug, node_id, object_id }) {
        if (!config.automation_type) throw new Error('type is required');
        if (config.automation_type !== 'trigger') throw new Error('automation_type should be equal \'trigger\'');
        if (!config.topic) throw new Error('type is required');
        if (!config.type) throw new Error('type is required');
        if (!config.subtype) throw new Error('subtype is required');
        if (!config.device) throw new Error('device is required');
        super(config, { mqttConnection, allStates, debug, domain: 'device_automation', node_id, object_id });

        this.lastTimeTriggered = null;
    }
    init() {
        if (this.config.topic) {
            const topic = this.config.topic;
            const payload = this.config.payload;
            const handler = (value) => {
                try {
                    // let value_json = null;

                    // try {
                    //     value_json = JSON.parse(value);
                    // // eslint-disable-next-line no-empty
                    // } catch (e) {}


                    if (payload !== undefined && value !== payload) return;

                    this.lastTimeTriggered = new Date();
                    this.state.state = payload;
                    this.emit('triggered', this.state.state);
                } catch (e) {
                    this.emit('error', e);
                }
            };
            const detach = () => {
                this.mqttConnection.off(`message.${topic}`, handler);
                this.mqttConnection.unsubscribe(topic);
            };

            // attach
            this.mqttConnection.on(`message.${topic}`, handler);
            this.mqttConnection.subscribe(topic);
            if (this.mqttConnection.topics[topic]) handler(this.mqttConnection.topics[topic]);

            this.handlers.push({
                topic, handler, detach
            });
        }
    }
    // async
    // handlers
}

module.exports = HomeAssistantDeviceAutomationComponent;
