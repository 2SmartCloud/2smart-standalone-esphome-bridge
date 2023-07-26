const BasePropertyBridge = require('homie-sdk/lib/Bridge/BaseProperty');

class PropertyBridge extends BasePropertyBridge {
    /* {
     config,
     { type, transport, parser }
    } */
    constructor(config, { type, transport, parser, debug, homeAssistantComponent }) {
        super(config, { type, transport, parser, debug });
        this.homeAssistantComponent = homeAssistantComponent;
        // handlers
    }
    // sync
    // async
    // handlers~
    // ~handlers
}

module.exports = PropertyBridge;
