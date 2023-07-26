const { createHash } = require('crypto');
const fs = require('fs-extra');
const objectPath = require('object-path');

class Config {
    constructor() {
        this.config = null;
    }
    init(configPath) {
        this.configPath = configPath;
        this.load();
    }
    load() {
        if (this.config) return this.config;
        try {
            // eslint-disable-next-line no-sync
            this.config = JSON.parse(fs.readFileSync(this.configPath));
        } catch (e) {
            if (e.code === 'ENOENT') {
                this.config = {};
                this.save();
            } else throw e;
        }

        return this.config;
    }
    save() {
        // eslint-disable-next-line no-sync
        fs.writeFileSync(this.configPath, JSON.stringify(this.config || {}, null, 4));
    }
    set(path, value) {
        objectPath.set(this.config, path, value);
        this.save();
    }
    del(path) {
        objectPath.del(this.config, path);
        this.save();
    }
    get(path) {
        return objectPath.get(this.config, path);
    }
}

module.exports = {
    createHash(str) {
        return createHash('sha256').update(str).digest('hex');
    },
    config2smart : new Config()
};
