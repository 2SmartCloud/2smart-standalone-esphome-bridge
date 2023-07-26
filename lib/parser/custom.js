/* eslint-disable no-param-reassign */
/* eslint-disable no-nested-ternary */
const _ = require('underscore');
const BaseParser = require('homie-sdk/lib/Bridge/BaseParser');

class CustomParser extends BaseParser {
    constructor(conf) {
        super(_.defaults(_.clone(conf), {
            homieDataType : conf.homieDataType || 'string',
            type          : 'custom'
        }));
        if (conf.fromHomie) this.fromHomie = conf.fromHomie.bind(this);
        if (conf.toHomie) this.toHomie = conf.toHomie.bind(this);
    }
}

module.exports = CustomParser;
